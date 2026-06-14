#!/usr/bin/env python3
"""
Finsyt TimesFM Skill
Zero-shot time series forecasting using Google's TimesFM model.
"""
import argparse
import json
import sys
import os
import numpy as np

def get_sample_data(metric: str, n: int) -> np.ndarray:
    """Generate sample financial time series for demo when no real data."""
    np.random.seed(42)
    if metric == 'price':
        # Simulated price walk
        returns = np.random.normal(0.0002, 0.018, n)
        prices = 180 * np.exp(np.cumsum(returns))
        return prices
    elif metric == 'volume':
        # Mean-reverting volume
        base = 50_000_000
        shocks = np.random.normal(1.0, 0.3, n)
        vol = base * np.maximum(0.1, shocks)
        return vol
    elif metric == 'atr':
        # Mean-reverting ATR
        base = 3.5
        atr = base + np.random.normal(0, 0.5, n)
        atr = np.maximum(0.1, atr)
        return atr
    return np.random.randn(n)

def run_forecast(symbol: str, metric: str, horizon: int, context: int, output_format: str):
    try:
        import timesfm
    except ImportError:
        print(json.dumps({"error": "timesfm not installed. Run: pip install timesfm==1.3.0"}))
        sys.exit(1)

    # Load model (CPU-safe 1.3.0)
    print(f"Loading TimesFM for {symbol}/{metric}...", file=sys.stderr)
    try:
        tfm = timesfm.TimesFm(
            hparams=timesfm.TimesFmHparams(
                backend='cpu',
                per_core_batch_size=32,
                horizon_len=horizon,
                input_patch_len=32,
                output_patch_len=128,
                num_layers=20,
                model_dims=1280,
                use_positional_embedding=False,
            ),
            checkpoint=timesfm.TimesFmCheckpoint(
                huggingface_repo_id="google/timesfm-1.0-200m",
            ),
        )
    except Exception as e:
        print(json.dumps({"error": f"Model load failed: {e}", "tip": "First run downloads ~200MB. Check internet connection."}))
        sys.exit(1)

    # Get data (real data would come from FMP/EODHD API)
    data = get_sample_data(metric, context)

    # Run forecast
    point_forecasts, quantile_forecasts = tfm.forecast(
        inputs=[data],
        freq=[0],  # 0 = high freq (daily)
    )

    pf = point_forecasts[0].tolist()
    qf = quantile_forecasts[0]  # shape: (horizon, n_quantiles)

    # TimesFM 1.3.0 quantile ordering
    q10 = qf[:, 0].tolist() if qf.shape[1] > 0 else pf
    q90 = qf[:, -1].tolist() if qf.shape[1] > 0 else pf

    ci_width_pct = (np.mean(q90) - np.mean(q10)) / np.mean(data[-20:]) * 100

    # Generate signal
    signal = 'neutral'
    if metric in ('volume', 'atr'):
        recent_avg = float(np.mean(data[-20:]))
        forecast_avg = float(np.mean(pf))
        ratio = forecast_avg / recent_avg
        if metric == 'volume':
            if ratio > 1.10:
                signal = 'breakout_incoming'
            elif ratio < 0.90:
                signal = 'drying_up'
        else:  # atr
            if ratio < 0.80:
                signal = 'squeeze_forming'
            elif ratio > 1.30:
                signal = 'expansion_incoming'

    result = {
        "symbol": symbol,
        "metric": metric,
        "horizon": horizon,
        "context_bars": context,
        "point_forecast": [round(x, 4) for x in pf],
        "q10": [round(x, 4) for x in q10],
        "q90": [round(x, 4) for x in q90],
        "ci_width_pct": round(ci_width_pct, 2),
        "signal": signal,
        "interpretation": {
            "squeeze_forming": "ATR compressing — volatility squeeze likely forming. Scout for breakout setup.",
            "expansion_incoming": "ATR expanding — expect increased volatility. Widen stops.",
            "breakout_incoming": "Volume surge forecast — institutional activity ahead. Confirm with price action.",
            "drying_up": "Volume declining — low conviction. Avoid chasing.",
            "neutral": "No strong regime signal.",
        }.get(signal, ""),
        "model": "TimesFM 1.0 200M (CPU)",
        "note": "Demo uses simulated data. Wire up real OHLCV from /api/aggs for production.",
    }

    if output_format == 'csv':
        import csv, io
        out = io.StringIO()
        w = csv.writer(out)
        w.writerow(['bar', 'point_forecast', 'q10', 'q90'])
        for i, (p, lo, hi) in enumerate(zip(pf, q10, q90)):
            w.writerow([i+1, p, lo, hi])
        print(out.getvalue())
    else:
        print(json.dumps(result, indent=2))

def main():
    p = argparse.ArgumentParser(description='Finsyt TimesFM Forecasting Skill')
    p.add_argument('--symbol', default='AAPL', help='Ticker symbol')
    p.add_argument('--metric', default='price', choices=['price','volume','atr'], help='Metric to forecast')
    p.add_argument('--horizon', type=int, default=10, help='Forecast horizon (bars)')
    p.add_argument('--context', type=int, default=150, help='Historical bars to use')
    p.add_argument('--output', default='json', choices=['json','csv'], help='Output format')
    args = p.parse_args()
    run_forecast(args.symbol, args.metric, args.horizon, args.context, args.output)

if __name__ == '__main__':
    main()

# TimesFM — Time Series Forecasting Skill

Google Research's pretrained Time Series Foundation Model (200M params, zero-shot, no fine-tuning).

## When to Use
- Volatility forecasting (ATR/RVOL) — 8/10 accuracy, best use case
- Volume forecasting for breakout detection — 8.5/10 accuracy
- Price CI bands for TP/SL zones on large caps (SPY, AMZN, META)
- Sector rotation ranking via batch inference
- Macro regime detection (inflation, rates, spreads)

## Install
```bash
pip install timesfm==1.3.0  # CPU-safe version
```

## Usage
```bash
python .agents/skills/timesfm/scripts/run.py --symbol AAPL --metric price --horizon 10 --context 150
```

## Arguments
- `--symbol`: Ticker symbol (e.g. AAPL)
- `--metric`: `price` | `volume` | `atr` (default: price)
- `--horizon`: Forecast horizon in bars (default: 10)
- `--context`: Historical bars to use (default: 150, max: 512)
- `--output`: `json` | `csv` (default: json)

## Output
JSON with:
- `point_forecast`: array of predicted values
- `q10` / `q90`: lower/upper confidence interval bands
- `ci_width`: uncertainty proxy (wide = reduce position)
- `signal`: `squeeze_forming` | `breakout_incoming` | `neutral` (for volume/atr)

## Notes
- Uses timesfm 1.3.0 (CPU-compatible, no GPU required)
- Model downloads ~200MB on first run (cached at ~/.cache/huggingface)
- For production: run as scheduled job, not per-request
- Best lookback: 150 bars for vol/ATR, 20 bars for price direction

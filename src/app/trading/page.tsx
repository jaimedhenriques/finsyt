"use client";

import { useEffect, useState, useCallback } from "react";

type DataSource = "simulated" | "worldbank_data360";

type EconomicDataPoint = {
  country: string;
  countryCode: string;
  indicator: string;
  indicatorCode: string;
  year: number;
  value: number | null;
};

type EconomicIndicator = {
  indicator: string;
  indicatorCode: string;
  countries: string[];
  data: EconomicDataPoint[];
  lastUpdated: string;
};

type Signal = {
  id: string;
  country: string;
  indicator: string;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  value: number;
  change: number;
  timestamp: string;
};

type TradingState = {
  dataSource: DataSource;
  signals: Signal[];
  indicators: Record<string, EconomicIndicator>;
  loading: boolean;
  error: string | null;
  lastFetch: string | null;
};

export default function TradingPage() {
  const [state, setState] = useState<TradingState>({
    dataSource: "worldbank_data360",
    signals: [],
    indicators: {},
    loading: true,
    error: null,
    lastFetch: null,
  });

  const fetchData360 = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch("/api/v1/data360?action=snapshot&countries=USA,CHN,DEU,JPN,GBR");
      const json = await response.json();

      if (!json.success) {
        throw new Error(json.error || "Failed to fetch data");
      }

      const indicators = json.data.indicators as Record<string, EconomicIndicator>;
      const signals = generateSignals(indicators);

      setState((prev) => ({
        ...prev,
        indicators,
        signals,
        loading: false,
        lastFetch: new Date().toISOString(),
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Unknown error",
        signals: generateSimulatedSignals(),
      }));
    }
  }, []);

  const fetchSimulated = useCallback(() => {
    setState((prev) => ({
      ...prev,
      loading: false,
      signals: generateSimulatedSignals(),
      lastFetch: new Date().toISOString(),
    }));
  }, []);

  useEffect(() => {
    if (state.dataSource === "worldbank_data360") {
      fetchData360();
    } else {
      fetchSimulated();
    }
  }, [state.dataSource, fetchData360, fetchSimulated]);

  const cycleDataSource = () => {
    setState((prev) => ({
      ...prev,
      dataSource: prev.dataSource === "simulated" ? "worldbank_data360" : "simulated",
    }));
  };

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Economic Trading Signals</h1>
            <p className="text-gray-400 mt-1">Macro indicators from World Bank Data360</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={cycleDataSource}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              {state.dataSource === "worldbank_data360" ? "LIVE: World Bank Data360" : "SIMULATED"}
            </button>
            <button
              onClick={() => (state.dataSource === "worldbank_data360" ? fetchData360() : fetchSimulated())}
              disabled={state.loading}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
            >
              {state.loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </header>

        {state.error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-200">{state.error}</p>
            <p className="text-red-300 text-sm mt-1">Showing simulated data as fallback.</p>
          </div>
        )}

        {state.lastFetch && (
          <p className="text-gray-500 text-sm mb-6">
            Last updated: {new Date(state.lastFetch).toLocaleString()}
          </p>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {state.signals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </section>

        {Object.keys(state.indicators).length > 0 && (
          <section className="mt-8">
            <h2 className="text-2xl font-semibold mb-4">Raw Indicator Data</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {Object.entries(state.indicators).map(([code, indicator]) => (
                <IndicatorPanel key={code} indicator={indicator} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function SignalCard({ signal }: { signal: Signal }) {
  const directionColors = {
    bullish: "border-green-500 bg-green-900/20",
    bearish: "border-red-500 bg-red-900/20",
    neutral: "border-yellow-500 bg-yellow-900/20",
  };

  const directionIcons = {
    bullish: "\u2191",
    bearish: "\u2193",
    neutral: "\u2194",
  };

  return (
    <div className={`border-2 rounded-lg p-5 ${directionColors[signal.direction]}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xl font-bold">{signal.country}</span>
        <span className="text-2xl">{directionIcons[signal.direction]}</span>
      </div>
      <p className="text-gray-300 text-sm mb-2">{signal.indicator}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-mono">{formatValue(signal.value)}</span>
        <span
          className={`text-sm ${
            signal.change > 0 ? "text-green-400" : signal.change < 0 ? "text-red-400" : "text-gray-400"
          }`}
        >
          {signal.change > 0 ? "+" : ""}
          {signal.change.toFixed(2)}%
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 bg-gray-700 rounded-full h-2">
          <div
            className="bg-blue-500 rounded-full h-2 transition-all"
            style={{ width: `${signal.confidence * 100}%` }}
          />
        </div>
        <span className="text-xs text-gray-400">{(signal.confidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

function IndicatorPanel({ indicator }: { indicator: EconomicIndicator }) {
  const latestByCountry = new Map<string, EconomicDataPoint>();
  indicator.data
    .filter((d) => d.value !== null)
    .sort((a, b) => b.year - a.year)
    .forEach((d) => {
      if (!latestByCountry.has(d.countryCode)) {
        latestByCountry.set(d.countryCode, d);
      }
    });

  return (
    <div className="bg-gray-800 rounded-lg p-5">
      <h3 className="font-semibold text-lg mb-1">{indicator.indicator}</h3>
      <p className="text-gray-400 text-sm mb-4">{indicator.indicatorCode}</p>
      <div className="space-y-2">
        {Array.from(latestByCountry.entries()).map(([code, data]) => (
          <div key={code} className="flex items-center justify-between">
            <span className="text-gray-300">{data.country}</span>
            <span className="font-mono">{formatValue(data.value)}</span>
            <span className="text-gray-500 text-sm">{data.year}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function generateSignals(indicators: Record<string, EconomicIndicator>): Signal[] {
  const signals: Signal[] = [];
  const countries = ["USA", "CHN", "DEU", "JPN", "GBR"];

  for (const country of countries) {
    for (const [code, indicator] of Object.entries(indicators)) {
      const countryData = indicator.data
        .filter((d) => d.countryCode === country && d.value !== null)
        .sort((a, b) => b.year - a.year);

      if (countryData.length < 2) continue;

      const latest = countryData[0];
      const previous = countryData[1];
      const change = ((latest.value! - previous.value!) / Math.abs(previous.value!)) * 100;

      let direction: "bullish" | "bearish" | "neutral" = "neutral";
      if (code.includes("GROWTH") || code.includes("GDP")) {
        direction = change > 1 ? "bullish" : change < -1 ? "bearish" : "neutral";
      } else if (code.includes("INFLATION") || code.includes("UNEMPLOYMENT")) {
        direction = change < -0.5 ? "bullish" : change > 0.5 ? "bearish" : "neutral";
      }

      const confidence = Math.min(0.95, Math.max(0.3, 1 - Math.abs(change) / 20));

      signals.push({
        id: `${country}-${code}`,
        country,
        indicator: indicator.indicator,
        direction,
        confidence,
        value: latest.value!,
        change,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return signals.slice(0, 12);
}

function generateSimulatedSignals(): Signal[] {
  const countries = ["USA", "CHN", "DEU", "JPN", "GBR"];
  const indicators = ["GDP Growth", "Inflation Rate", "Unemployment"];

  return countries.flatMap((country) =>
    indicators.map((indicator) => ({
      id: `sim-${country}-${indicator}`,
      country,
      indicator,
      direction: (["bullish", "bearish", "neutral"] as const)[Math.floor(Math.random() * 3)],
      confidence: 0.3 + Math.random() * 0.4,
      value: Math.random() * 10 - 2,
      change: Math.random() * 6 - 3,
      timestamp: new Date().toISOString(),
    }))
  ).slice(0, 12);
}

function formatValue(value: number | null): string {
  if (value === null) return "N/A";
  if (Math.abs(value) >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  return value.toFixed(2);
}

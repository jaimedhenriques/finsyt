import { NextRequest, NextResponse } from "next/server";
import {
  WorldBankData360Provider,
  DATA360_INDICATORS,
} from "@/lib/providers/worldbank-data360-provider";

const provider = new WorldBankData360Provider();

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get("action") ?? "snapshot";
  const countries = searchParams.get("countries")?.split(",") ?? ["USA", "CHN", "DEU"];
  const indicator = searchParams.get("indicator");

  try {
    switch (action) {
      case "snapshot": {
        const snapshot = await provider.getEconomicSnapshot(countries);
        // Convert Map to object for JSON serialization
        const indicatorsObj: Record<string, unknown> = {};
        snapshot.indicators.forEach((value, key) => {
          indicatorsObj[key] = value;
        });

        return NextResponse.json({
          success: true,
          provider: provider.id,
          data: {
            countries: snapshot.countries,
            indicators: indicatorsObj,
            fetchedAt: snapshot.fetchedAt,
          },
        });
      }

      case "indicator": {
        if (!indicator) {
          return NextResponse.json(
            {
              success: false,
              error: "indicator parameter required for action=indicator",
              availableIndicators: Object.entries(DATA360_INDICATORS).map(([name, code]) => ({
                name,
                code,
              })),
            },
            { status: 400 }
          );
        }

        const data = await provider.getIndicator(indicator, countries);
        if (!data) {
          return NextResponse.json(
            { success: false, error: "Failed to fetch indicator data" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          provider: provider.id,
          data,
        });
      }

      case "quote": {
        const countryCode = countries[0];
        const quote = await provider.getQuote(countryCode);

        return NextResponse.json({
          success: true,
          provider: provider.id,
          data: quote,
        });
      }

      case "efi": {
        const efiIndicator = indicator ?? "IMF.WEO.PPPGDP";
        const efiData = await provider.getData360EFI(efiIndicator, countries);

        return NextResponse.json({
          success: true,
          provider: provider.id,
          data: efiData,
          note: "Data360 EFI endpoint - may require fallback to standard API",
        });
      }

      case "health": {
        const status = await provider.health();
        return NextResponse.json({
          success: true,
          provider: provider.id,
          status,
        });
      }

      case "indicators": {
        return NextResponse.json({
          success: true,
          provider: provider.id,
          indicators: Object.entries(DATA360_INDICATORS).map(([name, code]) => ({
            name,
            code,
            description: getIndicatorDescription(name),
          })),
        });
      }

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unknown action: ${action}`,
            availableActions: ["snapshot", "indicator", "quote", "efi", "health", "indicators"],
          },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Data360 API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

function getIndicatorDescription(name: string): string {
  const descriptions: Record<string, string> = {
    GDP_PPP: "GDP, PPP (current international $)",
    GDP_GROWTH: "GDP growth (annual %)",
    INFLATION: "Inflation, consumer prices (annual %)",
    UNEMPLOYMENT: "Unemployment, total (% of labor force)",
    TRADE_BALANCE: "External balance on goods and services (% of GDP)",
    FOREIGN_RESERVES: "Total reserves including gold (current US$)",
    INTEREST_RATE: "Real interest rate (%)",
    EXCHANGE_RATE: "Official exchange rate (LCU per US$, period average)",
  };
  return descriptions[name] ?? name;
}

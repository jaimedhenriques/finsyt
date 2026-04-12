import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => ({}))

    return NextResponse.json(
      {
        ok: false,
        message: "Checkout endpoint scaffolded. Stripe wiring pending.",
        received: payload ?? {},
      },
      { status: 501 },
    )
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}

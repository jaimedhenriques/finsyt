import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code) {
    return NextResponse.redirect(new URL("/app/figma?error=no_code", req.url))
  }

  const clientId = process.env.FIGMA_CLIENT_ID
  const clientSecret = process.env.FIGMA_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/app/figma?error=not_configured", req.url))
  }

  try {
    const tokenRes = await fetch("https://api.figma.com/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: new URL("/api/figma/callback", req.url).toString(),
        code,
        grant_type: "authorization_code",
      }),
    })

    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      console.error("Figma OAuth error:", err)
      return NextResponse.redirect(new URL("/app/figma?error=token_exchange_failed", req.url))
    }

    const tokens = await tokenRes.json()

    const response = NextResponse.redirect(new URL("/app/figma?connected=true", req.url))
    response.cookies.set("figma_access_token", tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: tokens.expires_in || 86400,
      path: "/",
    })
    if (tokens.refresh_token) {
      response.cookies.set("figma_refresh_token", tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 86400,
        path: "/",
      })
    }

    return response
  } catch (e: any) {
    console.error("Figma OAuth exception:", e)
    return NextResponse.redirect(new URL("/app/figma?error=exception", req.url))
  }
}

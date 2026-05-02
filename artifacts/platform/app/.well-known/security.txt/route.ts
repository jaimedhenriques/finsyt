import { NextResponse } from "next/server";

export const dynamic = "force-static";

export function GET() {
  const oneYear = new Date();
  oneYear.setFullYear(oneYear.getFullYear() + 1);
  const body =
    [
      "Contact: mailto:security@finsyt.com",
      `Expires: ${oneYear.toISOString()}`,
      "Preferred-Languages: en",
      "Policy: https://finsyt.com/security",
      "Canonical: https://finsyt.com/.well-known/security.txt",
    ].join("\n") + "\n";
  return new NextResponse(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

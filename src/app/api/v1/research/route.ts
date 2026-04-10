import { NextResponse } from "next/server";
import { z } from "zod";
import { runResearchQuery } from "@/lib/services/research-service";

const requestSchema = z.object({
  question: z.string().min(5),
  ticker: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.parse(body);
    const result = await runResearchQuery(parsed);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Invalid request payload",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 400 }
    );
  }
}

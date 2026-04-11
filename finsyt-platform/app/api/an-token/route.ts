// Stub — 21st-sdk removed. Route kept so existing imports don't 404.
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ message: 'SDK removed — use /api/ai-research directly.' }, { status: 410 })
}

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '0.1.0',
    services: {
      database: 'unknown',
      redis: 'unknown',
      providers: {
        fmp: !!process.env.FMP_API_KEY,
        finnhub: !!process.env.FINNHUB_API_KEY,
        anthropic: !!process.env.ANTHROPIC_API_KEY,
      },
    },
  };

  // Check Redis if configured
  if (process.env.REDIS_URL) {
    try {
      const Redis = (await import('ioredis')).default;
      const client = new Redis(process.env.REDIS_URL, {
        connectTimeout: 5000,
      });
      await client.ping();
      health.services.redis = 'connected';
      await client.quit();
    } catch {
      health.services.redis = 'disconnected';
    }
  } else {
    health.services.redis = 'not_configured';
  }

  // Check database if configured
  if (process.env.DATABASE_URL) {
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      await prisma.$queryRaw`SELECT 1`;
      health.services.database = 'connected';
      await prisma.$disconnect();
    } catch {
      health.services.database = 'disconnected';
    }
  } else {
    health.services.database = 'not_configured';
  }

  const isHealthy = health.status === 'healthy';
  return NextResponse.json(health, { status: isHealthy ? 200 : 503 });
}

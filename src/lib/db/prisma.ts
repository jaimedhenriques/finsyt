import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const prismaClientConfig = {
  log: (process.env.NODE_ENV === "development"
    ? ["query", "error", "warn"]
    : ["error"]) satisfies Prisma.LogLevel[],
};

export function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  const client = new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
    }),
    ...prismaClientConfig,
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }

  return client;
}

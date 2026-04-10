import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveDatabaseUrls } from "@/lib/db/connection";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const { pooledUrl } = resolveDatabaseUrls();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString: pooledUrl ?? "",
    }),
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

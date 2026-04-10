import "dotenv/config";
import { defineConfig } from "prisma/config";
import { resolveDatabaseUrls } from "./src/lib/db/connection";

const { pooledUrl, directUrl } = resolveDatabaseUrls();
if (!process.env.DATABASE_URL && pooledUrl) {
  process.env.DATABASE_URL = pooledUrl;
}

if (!process.env.DIRECT_URL && directUrl) {
  process.env.DIRECT_URL = directUrl;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: pooledUrl,
  },
});

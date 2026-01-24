import "dotenv/config";
import { defineConfig } from "prisma/config";

const fallbackSqliteDevUrl = "file:./prisma/dev.db";

// Allow a safe dev fallback so `prisma generate/migrate` works without DATABASE_URL.
const dbUrl = process.env.DATABASE_URL || fallbackSqliteDevUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.js",
  },
  datasource: {
    url: dbUrl,
  },
});

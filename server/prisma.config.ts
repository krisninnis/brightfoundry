import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // This tells `npx prisma db seed` what command to run
    seed: "node prisma/seed.js",
  },
  datasource: {
    // Prisma 7 reads DATABASE_URL from here
    url: env("DATABASE_URL"),
  },
});

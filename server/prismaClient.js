// server/prismaClient.js
// Prisma v7 requires passing either a Driver Adapter or an Accelerate URL.
// We use the official better-sqlite3 adapter for SQLite.

require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");

const adapter = new PrismaBetterSqlite3({
  // .env uses: DATABASE_URL="file:./prisma/dev.db"
  url: process.env.DATABASE_URL || "file:./prisma/dev.db",
});

const prisma = new PrismaClient({ adapter });

module.exports = prisma;

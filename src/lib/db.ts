import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Prisma 7 has no bundled query engine — a driver adapter is required at runtime.
// Local: SQLite file (absolute path, matching prisma.config.ts so CLI + runtime
// share one file). Deploy: Turso when TURSO_DATABASE_URL is set.
function dbConfig(): { url: string; authToken?: string } {
  if (process.env.TURSO_DATABASE_URL) {
    return {
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    };
  }
  const file =
    "file:" + path.resolve(process.cwd(), "prisma", "dev.db").replace(/\\/g, "/");
  return { url: file };
}

function makeClient(): PrismaClient {
  const { url, authToken } = dbConfig();
  const adapter = new PrismaLibSql(authToken ? { url, authToken } : { url });
  return new PrismaClient({ adapter });
}

// Reuse a single client across HMR / serverless invocations.
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };
export const prisma: PrismaClient = globalForPrisma.__prisma ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.__prisma = prisma;

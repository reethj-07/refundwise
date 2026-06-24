import path from "node:path";
import { defineConfig } from "@prisma/config";

// Prisma 7 auto-loads .env.local. The datasource URL lives here (no longer in
// schema.prisma). Absolute path so the CLI and the runtime libSQL adapter
// (src/lib/db.ts) resolve to the EXACT same local file.
const localFile =
  "file:" + path.resolve(process.cwd(), "prisma", "dev.db").replace(/\\/g, "/");

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: { path: path.join("prisma", "migrations") },
  datasource: {
    // CLI targets local SQLite by default; set TURSO_DATABASE_URL to target Turso.
    url: process.env.TURSO_DATABASE_URL || localFile,
  },
});

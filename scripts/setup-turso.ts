// One-command Turso setup — applies the Prisma schema to your Turso database and
// seeds it, over the network. No Turso CLI required.
//
// 1. Create a free Turso DB and get its URL + auth token (see README → Deploy).
// 2. Put TURSO_DATABASE_URL (libsql://...) and TURSO_AUTH_TOKEN in .env.local.
// 3. Run:  npm run db:turso
//
// Safe to re-run (the seed wipes and recreates the seed data).

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { execSync } from "node:child_process";
import { createClient } from "@libsql/client";

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !url.startsWith("libsql")) {
    throw new Error(
      "TURSO_DATABASE_URL (libsql://...) is not set in .env.local. See README → Deploy to Vercel.",
    );
  }
  if (!authToken) {
    throw new Error("TURSO_AUTH_TOKEN is not set in .env.local.");
  }

  console.log("→ Generating schema DDL from prisma/schema.prisma …");
  const ddl = execSync(
    "npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script",
    { encoding: "utf8" },
  );

  // Keep only CREATE statements (ignore comments / log lines).
  const statements = ddl
    .split(";")
    .map((s) => s.trim())
    .filter((s) => /create/i.test(s));

  const client = createClient({ url, authToken });
  console.log(`→ Applying ${statements.length} statements to Turso …`);
  for (const stmt of statements) {
    await client.execute(stmt);
  }
  await client.close();
  console.log("→ Schema applied. Seeding …");

  // The seed uses src/lib/db.ts, which targets Turso when TURSO_* is set.
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env: process.env });
  console.log("✅ Turso is ready to use.");
}

main().catch((e) => {
  console.error("Turso setup failed:", e);
  process.exit(1);
});

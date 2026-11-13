/**
 * Local development database — embedded PostgreSQL, no installation needed.
 *
 * Usage:  npm run db:local     (keep it running; Ctrl+C stops it cleanly)
 *
 * Data persists in ./.pgdata between runs. Matches the DATABASE_URL in .env:
 *   postgresql://draftroom:draftroom@localhost:5502/draftroom
 * For production, use a managed Postgres and change DATABASE_URL.
 */
import fs from "fs";
import EmbeddedPostgres from "embedded-postgres";

const pg = new EmbeddedPostgres({
  databaseDir: "./.pgdata",
  user: "draftroom",
  password: "draftroom",
  port: 5502,
  persistent: true,
  // UTF-8 is essential: Windows initdb defaults to WIN1252, which cannot
  // store emoji — and this app stores a lot of emoji.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

async function main() {
  if (!fs.existsSync("./.pgdata/PG_VERSION")) {
    console.log("[dev-db] first run — initialising data directory…");
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase("draftroom");
    console.log("[dev-db] created database 'draftroom'");
  } catch {
    /* already exists */
  }
  console.log(
    "[dev-db] PostgreSQL running on port 5502 — leave this open; Ctrl+C to stop",
  );

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const dbUrl = process.env.DATABASE_URL || "file:./dev.sqlite";
const relativePath = dbUrl.replace(/^file:/, "");
const dbPath = resolve("prisma", relativePath);
const migrationPath = "prisma/migrations/20260514194000_init/migration.sql";

mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
const existing = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Shop'")
  .get();

if (!existing) {
  db.exec(readFileSync(migrationPath, "utf8"));
  console.log(`Initialized SQLite database at ${dbPath}`);
} else {
  console.log(`SQLite database already initialized at ${dbPath}`);
}

db.close();

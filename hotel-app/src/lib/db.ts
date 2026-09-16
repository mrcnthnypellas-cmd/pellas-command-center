// Zero-dependency JSON-file persistence.
//
// Why not SQLite/Postgres: this app's #1 requirement is "npm install must work
// on an Android tablet running Termux, with no native compilation." Every
// native SQLite binding (better-sqlite3, node-sqlite3) needs a matching
// prebuilt binary or a working node-gyp/NDK toolchain, which Termux does not
// reliably have. A single JSON file, read/written with plain fs calls, has
// zero native dependencies and is more than enough for one hotel's data.
//
// Writes are serialized through a promise chain so concurrent requests never
// interleave a read-modify-write and clobber each other's changes.

import fs from "fs";
import path from "path";
import { Database } from "./types";
import { buildSeedDatabase } from "./seed";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadFromDisk(): Database {
  ensureDataDir();
  if (!fs.existsSync(DB_PATH)) {
    const seeded = buildSeedDatabase();
    fs.writeFileSync(DB_PATH, JSON.stringify(seeded, null, 2), "utf-8");
    return seeded;
  }
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw) as Database;
}

function saveToDisk(db: Database) {
  ensureDataDir();
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), "utf-8");
  fs.renameSync(tmpPath, DB_PATH);
}

// Serializes all mutations so overlapping requests can't race each other.
let queue: Promise<unknown> = Promise.resolve();

/** Read-only access to the database. */
export function readDb(): Database {
  return loadFromDisk();
}

/**
 * Read-modify-write in one serialized step. `mutator` receives the live
 * database object, may mutate it in place, and returns any value to hand
 * back to the caller.
 */
export function withDb<T>(mutator: (db: Database) => T): Promise<T> {
  const run = queue.then(() => {
    const db = loadFromDisk();
    const result = mutator(db);
    saveToDisk(db);
    return result;
  });
  // Keep the queue alive even if this step throws, so later writes still run.
  queue = run.catch(() => undefined);
  return run;
}

export function resetDatabaseForSeed() {
  ensureDataDir();
  const seeded = buildSeedDatabase();
  saveToDisk(seeded);
  return seeded;
}

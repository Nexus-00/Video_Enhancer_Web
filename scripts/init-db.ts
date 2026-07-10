import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

const dbPath = "data/jobs.db"
mkdirSync(dirname(dbPath), { recursive: true })

const db = new Database(dbPath)
db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    stage TEXT,
    progress REAL DEFAULT 0,
    current_frame INTEGER,
    total_frames INTEGER,
    eta_seconds INTEGER,
    device TEXT,
    options TEXT,
    input_path TEXT,
    output_path TEXT,
    error TEXT,
    created_at INTEGER,
    updated_at INTEGER
);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS progress_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT REFERENCES jobs(id),
    stage TEXT,
    message TEXT,
    created_at INTEGER
);
`)

db.close()
console.log("DB initialized")

import { existsSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
const __dirname = dirname(fileURLToPath(import.meta.url))
import { Database } from "bun:sqlite"

const root = resolve(__dirname, "..")
const webDir = join(root, "web")
const pythonDir = join(root, "python")
const dataDir = join(root, "data")

const DB_PATH = join(dataDir, "jobs.db")

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    stage TEXT,
    progress REAL DEFAULT 0,
    current_frame INTEGER,
    total_frames INTEGER,
    eta_seconds INTEGER,
    preview_base64 TEXT,
    device TEXT,
    options TEXT,
    input_path TEXT,
    output_path TEXT,
    error TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS progress_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT REFERENCES jobs(id),
    stage TEXT,
    message TEXT,
    created_at INTEGER
);
`

async function ensureDirs() {
  for (const dir of ["uploads", "processing", "outputs"]) {
    await mkdir(join(dataDir, dir), { recursive: true })
  }
}

async function runCommand(cwd: string, command: string[], label: string) {
  console.log(`[setup] ${label}...`)
  const proc = Bun.spawn(command, { cwd, stdio: ["inherit", "inherit", "inherit"] })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`[setup] ${label} failed with exit code ${exitCode}`)
  }
}

async function setupWeb() {
  const nodeModules = join(webDir, "node_modules")
  if (!existsSync(nodeModules)) {
    await runCommand(webDir, ["bun", "install"], "Installing web dependencies")
  }
}

async function setupPython() {
  await runCommand(pythonDir, ["uv", "sync"], "Installing Python dependencies")
}

async function downloadModels() {
  const weightsDir = join(pythonDir, "weights")
  if (!existsSync(weightsDir)) {
    await mkdir(weightsDir, { recursive: true })
  }
  await runCommand(pythonDir, ["uv", "run", "python", "src/scripts/download_models.py"], "Downloading models")
}

async function initDb() {
  if (!existsSync(DB_PATH)) {
    console.log("[setup] Initializing SQLite database...")
  }
  const db = new Database(DB_PATH)
  db.exec(SCHEMA)
  db.close()
}

export async function setup() {
  await ensureDirs()
  await setupWeb()
  await setupPython()
  await initDb()
  console.log("[setup] Done.")
}

if (import.meta.main) {
  await setup()
}

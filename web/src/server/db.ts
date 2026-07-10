import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.AI_VIDEO_ENHANCER_DB
  ?? join(__dirname, "..", "..", "..", "data", "jobs.db")

mkdirSync(dirname(DB_PATH), { recursive: true })

async function createDb(): Promise<any> {
  try {
    const { DatabaseSync } = await import("node:sqlite")
    const db = new DatabaseSync(DB_PATH)
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
    return db
  } catch {
    const { Database } = await import("bun:sqlite")
    const db = new Database(DB_PATH)
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
    return db
  }
}

export const db = await createDb()

import type { JobRow } from "~/types"

export type { JobRow }

export function getJob(id: string): JobRow | null {
  return db.prepare("SELECT * FROM jobs WHERE id = $id").get({ $id: id }) as JobRow | null
}

export function insertJob(job: JobRow) {
  db.prepare(
    `INSERT INTO jobs (id, status, stage, progress, current_frame, total_frames, eta_seconds, device, options, input_path, output_path, error, created_at, updated_at)
     VALUES ($id, $status, $stage, $progress, $currentFrame, $totalFrames, $etaSeconds, $device, $options, $inputPath, $outputPath, $error, $createdAt, $updatedAt)`
  ).run({
    $id: job.id,
    $status: job.status,
    $stage: job.stage,
    $progress: job.progress,
    $currentFrame: job.current_frame,
    $totalFrames: job.total_frames,
    $etaSeconds: job.eta_seconds,
    $device: job.device,
    $options: job.options,
    $inputPath: job.input_path,
    $outputPath: job.output_path,
    $error: job.error,
    $createdAt: job.created_at,
    $updatedAt: job.updated_at,
  })
}

export function updateJob(id: string, updates: Partial<JobRow>) {
  const fields = Object.keys(updates)
    .filter((k) => k !== "id")
    .map((k) => `${k} = $${k}`)
    .join(", ")
  if (!fields) return

  const params: Record<string, any> = { $id: id }
  for (const [k, v] of Object.entries(updates)) {
    if (k !== "id") {
      params[`$${k}`] = v
    }
  }

  db.prepare(`UPDATE jobs SET ${fields}, updated_at = $updatedAt WHERE id = $id`).run({
    ...params,
    $updatedAt: Date.now(),
  })
}

export function insertProgressLog(jobId: string, stage: string | null, message: string) {
  db.prepare(
    "INSERT INTO progress_logs (job_id, stage, message, created_at) VALUES ($jobId, $stage, $message, $createdAt)"
  ).run({
    $jobId: jobId,
    $stage: stage,
    $message: message,
    $createdAt: Date.now(),
  })
}

export function getProgressLogs(jobId: string) {
  return db
    .prepare("SELECT * FROM progress_logs WHERE job_id = $jobId ORDER BY id ASC")
    .all({ $jobId: jobId }) as Array<{
    id: number
    job_id: string
    stage: string | null
    message: string
    created_at: number
  }>
}

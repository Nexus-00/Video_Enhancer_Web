import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { getJob as getJobDb, insertJob, insertProgressLog, listJobs as listJobsDb, updateJob } from "./db"
import type { JobOptions, JobRow } from "~/types"

const webDir = process.cwd()
const root = resolve(webDir, "..")
const pythonDir = join(root, "python")
const dataDir = join(root, "data")
const pythonExe = process.platform === "win32" ? join(pythonDir, ".venv", "Scripts", "python.exe") : join(pythonDir, ".venv", "bin", "python")

const jobProcesses = new Map<string, ReturnType<typeof spawn>>()

function normalizeOptions(options: Partial<JobOptions> & Record<string, any>): JobOptions {
  const upscaleScale = (options.upscaleScale ?? (options.upscale ? 4 : 1)) as 1 | 2 | 4
  return {
    device: options.device ?? "cpu",
    targetFps: options.targetFps ?? 60,
    interpolate: options.interpolate ?? 1,
    interpolationModel: options.interpolationModel ?? "rife",
    upscaleScale: [1, 2, 4].includes(upscaleScale) ? upscaleScale : 1,
    deblur: options.deblur ?? false,
    removeDuplicates: options.removeDuplicates ?? false,
    duplicateThreshold: options.duplicateThreshold ?? 10,
  }
}

export interface JobResponse {
  id: string
  status: string
}

export async function createJobRecord(data: { filename: string; options: JobOptions }): Promise<JobResponse> {
  const id = randomUUID()
  const inputPath = join(dataDir, "uploads", id, data.filename)
  const outputPath = join(dataDir, "outputs", `${id}.mp4`)

  await mkdir(join(dataDir, "uploads", id), { recursive: true })

  const now = Date.now()
  const job: JobRow = {
    id,
    status: "pending",
    stage: null,
    progress: 0,
    current_frame: null,
    total_frames: null,
    eta_seconds: null,
    preview_base64: null,
    device: data.options.device,
    options: JSON.stringify(data.options),
    input_path: inputPath,
    output_path: outputPath,
    error: null,
    retry_count: 0,
    created_at: now,
    updated_at: now,
  }
  insertJob(job)

  return { id, status: "pending" }
}

function runTaskkill(pid: number): Promise<{ exitCode: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const taskkill = spawn("taskkill", ["/T", "/F", "/PID", String(pid)], { stdio: ["ignore", "ignore", "pipe"] })
    let stderr = ""
    taskkill.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString() })
    taskkill.on("error", (err) => resolve({ exitCode: null, stderr: err.message }))
    taskkill.on("close", (exitCode) => resolve({ exitCode, stderr }))
  })
}

async function killProcessTree(proc: ReturnType<typeof spawn>) {
  if (!proc.pid) {
    console.warn("[jobs] Cannot kill process: no PID")
    return
  }

  const pid = proc.pid
  console.log(`[jobs] Killing process tree for PID ${pid}`)

  try {
    // First send a direct kill signal to the parent process.
    proc.kill()
  } catch (err) {
    console.warn(`[jobs] Direct kill of PID ${pid} failed:`, err)
  }

  if (process.platform === "win32") {
    // Windows: taskkill /T /F kills the process and all its children (e.g. ffmpeg spawned by Python).
    const { exitCode, stderr } = await runTaskkill(pid)
    if (exitCode !== 0) {
      console.error(`[jobs] taskkill failed for PID ${pid}: exit=${exitCode}, stderr=${stderr.trim()}`)
    } else {
      console.log(`[jobs] taskkill succeeded for PID ${pid}`)
    }
  } else {
    proc.kill("SIGTERM")
  }

  // Give the OS a moment to terminate the process, then log if it is still alive.
  await new Promise((resolve) => setTimeout(resolve, 500))
  try {
    process.kill(pid, 0)
    console.warn(`[jobs] Process ${pid} still exists after kill attempt`)
  } catch {
    console.log(`[jobs] Process ${pid} confirmed terminated`)
  }
}

export function startJobWorker(id: string, inputPath: string, outputPath: string, rawOptions: JobOptions) {
  const options = normalizeOptions(rawOptions)
  const job = getJobDb(id)
  if (job && job.status === "cancelled") {
    console.log(`[jobs] Not starting worker for cancelled job ${id}`)
    return
  }

  const workDir = join(dataDir, "processing", id)
  const args = [
    pythonExe,
    "src/pipeline.py",
    "--input",
    inputPath,
    "--output",
    outputPath,
    "--work-dir",
    workDir,
    "--device",
    options.device,
    "--target-fps",
    String(options.targetFps),
    "--interpolate",
    String(options.interpolate),
    "--interpolation-model",
    options.interpolationModel,
    "--duplicate-threshold",
    String(options.duplicateThreshold),
    "--upscale-scale",
    String(options.upscaleScale),
  ]
  if (options.deblur) args.push("--deblur")
  if (options.removeDuplicates) args.push("--remove-duplicates")

  updateJob(id, { status: "running", stage: "starting" })

  const proc = spawn(args[0], args.slice(1), {
    cwd: pythonDir,
    stdio: ["ignore", "pipe", "pipe"],
  })
  jobProcesses.set(id, proc)

  // Stream stdout line by line
  const decoder = new TextDecoder()
  let outBuffer = ""
  let errBuffer = ""

  const handleLine = (line: string) => {
    if (!line.trim()) return
    try {
      const payload = JSON.parse(line)
      if (payload.type === "progress") {
        const updates: Partial<JobRow> = {
          status: "running",
          stage: payload.stage,
          progress: payload.progress,
          current_frame: payload.currentFrame,
          total_frames: payload.totalFrames,
          eta_seconds: payload.etaSeconds,
        }
        if (payload.previewBase64) {
          updates.preview_base64 = payload.previewBase64
        }
        updateJob(id, updates)
      } else if (payload.type === "log") {
        insertProgressLog(id, payload.stage ?? null, payload.message)
      }
    } catch {
      insertProgressLog(id, null, line)
    }
  }

  proc.stdout.on("data", (chunk: Buffer) => {
    outBuffer += decoder.decode(chunk, { stream: true })
    const lines = outBuffer.split("\n")
    outBuffer = lines.pop() ?? ""
    for (const line of lines) handleLine(line)
  })

  proc.stderr.on("data", (chunk: Buffer) => {
    errBuffer += decoder.decode(chunk, { stream: true })
    const lines = errBuffer.split("\n")
    errBuffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.trim()) continue
      insertProgressLog(id, null, `[stderr] ${line}`)
    }
  })

  proc.on("close", (code) => {
    jobProcesses.delete(id)
    const currentJob = getJobDb(id)
    if (!currentJob) return

    if (currentJob.status === "cancelled") {
      // User cancelled; leave status as cancelled.
      return
    }

    if (code === 0) {
      updateJob(id, { status: "completed", stage: "completed", progress: 1 })
    } else {
      const retryCount = currentJob.retry_count ?? 0
      const maxRetries = 2
      if (retryCount < maxRetries) {
        updateJob(id, { status: "failed", stage: "failed", retry_count: retryCount + 1, error: `Worker exited with code ${code}` })
        setTimeout(() => {
          if (currentJob.input_path && currentJob.output_path && currentJob.options) {
            const options = JSON.parse(currentJob.options) as JobOptions
            startJobWorker(id, currentJob.input_path, currentJob.output_path, options)
          }
        }, 2000)
      } else {
        updateJob(id, { status: "failed", stage: "failed", error: `Worker exited with code ${code} after ${maxRetries} retries` })
      }
    }
  })
}

export async function cancelJobById(id: string) {
  const job = getJobDb(id)
  if (!job) {
    return { success: false, reason: "Job not found" }
  }
  if (job.status === "completed" || job.status === "cancelled") {
    return { success: false, reason: "Job is already finished or cancelled" }
  }

  // Mark the job as cancelled BEFORE killing the worker so that the worker
  // "close" handler sees the cancelled status and does not retry.
  updateJob(id, { status: "cancelled", stage: "cancelled", error: "Cancelled by user", progress: 0 })

  const proc = jobProcesses.get(id)
  if (proc) {
    await killProcessTree(proc)
    jobProcesses.delete(id)
  }

  const workDir = join(dataDir, "processing", id)
  try {
    await rm(workDir, { recursive: true, force: true })
  } catch (err) {
    console.error(`[jobs] Failed to clean up work dir for ${id}:`, err)
  }

  return { success: true }
}

export function listAllJobs(): JobRow[] {
  return listJobsDb()
}

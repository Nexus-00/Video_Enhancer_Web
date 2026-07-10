import { createServerFn } from "@tanstack/react-start"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
const __dirname = dirname(fileURLToPath(import.meta.url))
import { getJob as getJobDb, insertJob, insertProgressLog, updateJob } from "./db"
import type { JobOptions, JobRow } from "~/types"

const root = resolve(__dirname, "..", "..", "..")
const pythonDir = join(root, "python")
const dataDir = join(root, "data")



export interface JobResponse {
  id: string
  status: string
}

export const createJob = createServerFn({ method: "POST" })
  .validator((data: { filename: string; options: JobOptions }) => data)
  .handler(async ({ data }): Promise<JobResponse> => {
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
      device: data.options.device,
      options: JSON.stringify(data.options),
      input_path: inputPath,
      output_path: outputPath,
      error: null,
      created_at: now,
      updated_at: now,
    }
    insertJob(job)

    return { id, status: "pending" }
  })

export function startJobWorker(id: string, inputPath: string, outputPath: string, options: JobOptions) {
  const workDir = join(dataDir, "processing", id)
  const args = [
    "uv",
    "run",
    "python",
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
    "--duplicate-threshold",
    String(options.duplicateThreshold),
  ]
  if (options.upscale) args.push("--upscale")
  if (options.deblur) args.push("--deblur")
  if (options.removeDuplicates) args.push("--remove-duplicates")

  updateJob(id, { status: "running", stage: "starting" })

  const proc = spawn(args[0], args.slice(1), {
    cwd: pythonDir,
    stdio: ["ignore", "pipe", "pipe"],
  })

  // Stream stdout line by line
  const decoder = new TextDecoder()
  let outBuffer = ""
  let errBuffer = ""

  const handleLine = (line: string) => {
    if (!line.trim()) return
    try {
      const payload = JSON.parse(line)
      if (payload.type === "progress") {
        updateJob(id, {
          status: "running",
          stage: payload.stage,
          progress: payload.progress,
          current_frame: payload.currentFrame,
          total_frames: payload.totalFrames,
          eta_seconds: payload.etaSeconds,
        })
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
    if (code === 0) {
      updateJob(id, { status: "completed", stage: "completed", progress: 1 })
    } else {
      updateJob(id, { status: "failed", stage: "failed" })
    }
  })
}

export const startJob = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data }) => {
    const job = getJobDb(data)
    if (!job || !job.input_path || !job.output_path || !job.options) {
      throw new Error("Job not found or incomplete")
    }
    const options = JSON.parse(job.options) as JobOptions
    startJobWorker(data, job.input_path, job.output_path, options)
    return { success: true }
  })

import { spawn } from "node:child_process"
import { readdir } from "node:fs/promises"
import { join, resolve } from "node:path"
import type { ChildProcess } from "node:child_process"

const webDir = process.cwd()
const root = resolve(webDir, "..")
const pythonDir = join(root, "python")
const pythonExe = process.platform === "win32" ? join(pythonDir, ".venv", "Scripts", "python.exe") : join(pythonDir, ".venv", "bin", "python")

export interface DownloadProgressEvent {
  type: "start" | "progress" | "model" | "done"
  index?: number
  name?: string
  status?: "pending" | "downloading" | "done" | "skipped" | "error"
  percent?: number
  overall?: number
  downloaded?: number
  total?: number
  message?: string
}

export function spawnModelDownload(force = false): ChildProcess {
  const args = [pythonExe, "src/scripts/download_models.py"]
  if (force) args.push("--force")

  return spawn(args[0], args.slice(1), {
    cwd: pythonDir,
    stdio: ["ignore", "pipe", "pipe"],
  })
}

export async function listModelFiles(): Promise<string[]> {
  const weightsDir = join(pythonDir, "weights")
  try {
    const entries = await readdir(weightsDir, { withFileTypes: true })
    return entries.filter((e) => e.isFile()).map((e) => e.name)
  } catch {
    return []
  }
}

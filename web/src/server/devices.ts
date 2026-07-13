import { spawn } from "node:child_process"
import { join, resolve } from "node:path"
import type { DeviceInfo } from "~/types"

const webDir = process.cwd()
const root = resolve(webDir, "..")
const pythonDir = join(root, "python")
const pythonExe = process.platform === "win32" ? join(pythonDir, ".venv", "Scripts", "python.exe") : join(pythonDir, ".venv", "bin", "python")

export async function detectDevices(): Promise<DeviceInfo[]> {
  const proc = spawn(
    pythonExe,
    ["-c", "import json, sys; from src.utils.devices import list_devices; print(json.dumps(list_devices()))"],
    {
      cwd: pythonDir,
      stdio: ["ignore", "pipe", "pipe"],
    }
  )

  let stdout = ""
  let stderr = ""
  proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString() })
  proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString() })

  const exitCode = await new Promise<number>((resolve) => proc.on("close", resolve))

  if (exitCode !== 0) {
    console.error("Failed to detect devices:", stderr)
    return [{ id: "cpu", name: "CPU (fallback)", type: "cpu" }]
  }

  try {
    const parsed = JSON.parse(stdout.trim().split("\n").pop() ?? "[]") as DeviceInfo[]
    return parsed
  } catch {
    return [{ id: "cpu", name: "CPU (fallback)", type: "cpu" }]
  }
}

import { createServerFn } from "@tanstack/react-start"
import { spawn } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { DeviceInfo } from "~/types"
const __dirname = dirname(fileURLToPath(import.meta.url))

const pythonDir = resolve(__dirname, "..", "..", "..", "python")

export const getDevices = createServerFn({ method: "GET" }).handler(async (): Promise<DeviceInfo[]> => {
  const proc = spawn(
    "uv",
    ["run", "python", "-c", "import json, sys; from src.utils.devices import list_devices; print(json.dumps(list_devices()))"],
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
    return JSON.parse(stdout.trim().split("\n").pop() ?? "[]")
  } catch {
    return [{ id: "cpu", name: "CPU (fallback)", type: "cpu" }]
  }
})

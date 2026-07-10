import { createServerFn } from "@tanstack/react-start"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
const __dirname = dirname(fileURLToPath(import.meta.url))

const pythonDir = resolve(__dirname, "..", "..", "..", "python")

export const downloadModels = createServerFn({ method: "POST" }).handler(async () => {
  const weightsDir = join(pythonDir, "weights")
  const proc = Bun.spawn(
    ["uv", "run", "python", "src/scripts/download_models.py"],
    {
      cwd: pythonDir,
      stdout: "pipe",
      stderr: "pipe",
    }
  )

  // Detach from the waiting promise so the request returns immediately.
  proc.exited.then((code) => {
    if (code !== 0) {
      console.error("[models] Download process exited with code", code)
    } else {
      console.log("[models] Downloads finished")
    }
  })

  return { started: true, weightsDir }
})

export const listModelFiles = createServerFn({ method: "GET" }).handler(async () => {
  const weightsDir = join(pythonDir, "weights")
  try {
    const files = await import("node:fs/promises")
    const entries = await files.readdir(weightsDir, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
  } catch {
    return []
  }
})

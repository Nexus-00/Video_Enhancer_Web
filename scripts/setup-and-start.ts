import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
const __dirname = dirname(fileURLToPath(import.meta.url))
import { setup } from "./setup"

const root = resolve(__dirname, "..")
const webDir = join(root, "web")
const dbPath = join(root, "data", "jobs.db")

await setup()

console.log("[start] Launching TanStack Start dev server...")
const proc = Bun.spawn(["bun", "run", "dev"], {
  cwd: webDir,
  stdio: ["inherit", "inherit", "inherit"],
  env: {
    ...process.env,
    AI_VIDEO_ENHANCER_DB: dbPath,
  },
})

await proc.exited

import { createFileRoute } from '@tanstack/react-router'
import { spawnModelDownload, listModelFiles } from '~/server/models'

export const Route = createFileRoute('/api/models')({
  server: {
    handlers: {
      GET: async () => {
        const files = await listModelFiles()
        return Response.json(files)
      },
      POST: async () => {
        const proc = spawnModelDownload()
        const encoder = new TextEncoder()
        const decoder = new TextDecoder()

        let outBuffer = ""
        let errBuffer = ""
        let finished = false

        const streamBody = new ReadableStream({
          start(controller) {
            const send = (data: unknown) => {
              try {
                controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"))
              } catch {
                // Stream may already be closed; ignore.
              }
            }

            const handleLine = (line: string) => {
              if (!line.trim()) return
              try {
                // Validate the JSON line is one of our events before forwarding.
                const parsed = JSON.parse(line)
                if (parsed && typeof parsed === "object") {
                  send(parsed)
                }
              } catch {
                // Forward raw non-JSON lines as log messages.
                send({ type: "log", message: line.trim() })
              }
            }

            proc.stdout?.on("data", (chunk: Buffer) => {
              outBuffer += decoder.decode(chunk, { stream: true })
              const lines = outBuffer.split("\n")
              outBuffer = lines.pop() ?? ""
              for (const line of lines) handleLine(line)
            })

            proc.stderr?.on("data", (chunk: Buffer) => {
              errBuffer += decoder.decode(chunk, { stream: true })
              const lines = errBuffer.split("\n")
              errBuffer = lines.pop() ?? ""
              for (const line of lines) {
                if (!line.trim()) continue
                send({ type: "log", message: line.trim() })
              }
            })

            proc.on("error", (err) => {
              if (finished) return
              finished = true
              send({ type: "error", message: err.message })
              try { controller.close() } catch {}
            })

            proc.on("close", (code) => {
              if (finished) return
              finished = true
              if (code === 0) {
                send({ type: "done" })
              } else {
                send({ type: "error", message: `Download process exited with code ${code}` })
              }
              try { controller.close() } catch {}
            })
          },
        })

        return new Response(streamBody, {
          headers: {
            'Content-Type': 'application/x-ndjson',
            'Cache-Control': 'no-cache',
          },
        })
      },
    },
  },
})

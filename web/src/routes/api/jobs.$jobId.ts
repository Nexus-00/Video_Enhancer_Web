import { createFileRoute } from '@tanstack/react-router'
import { cancelJobById } from '~/server/jobs'
import { getJob as getJobDb } from '~/server/db'

export const Route = createFileRoute('/api/jobs/$jobId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url)
        const stream = url.searchParams.get('stream') === '1'
        if (!stream) {
          const job = getJobDb(params.jobId)
          return Response.json(job)
        }

        const encoder = new TextEncoder()
        const streamBody = new ReadableStream({
          async start(controller) {
            let closed = false
            let interval: ReturnType<typeof setInterval> | null = null

            const close = () => {
              if (closed) return
              closed = true
              if (interval) {
                clearInterval(interval)
                interval = null
              }
              try {
                controller.close()
              } catch {
                // Already closed; ignore.
              }
            }

            const send = (data: unknown) => {
              if (closed) return
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
              } catch {
                close()
              }
            }

            let lastJson = ''
            const poll = () => {
              if (closed) return
              const job = getJobDb(params.jobId)
              const json = JSON.stringify(job)
              if (json !== lastJson) {
                lastJson = json
                send(job)
              }
              if (job && (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled')) {
                close()
              }
            }

            poll()
            interval = setInterval(poll, 1000)

            // Safety timeout: close after 10 minutes.
            setTimeout(() => {
              close()
            }, 600000)
          },
        })

        return new Response(streamBody, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        })
      },
      POST: async ({ params }) => {
        const result = await cancelJobById(params.jobId)
        return Response.json(result)
      },
    },
  },
})

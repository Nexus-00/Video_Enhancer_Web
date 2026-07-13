import { createFileRoute } from '@tanstack/react-router'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const root = resolve(process.cwd(), '..')

export const Route = createFileRoute('/api/output/$jobId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const outputPath = join(root, 'data', 'outputs', `${params.jobId}.mp4`)

        let stats
        try {
          stats = await stat(outputPath)
        } catch {
          return new Response('Not found', { status: 404 })
        }

        const stream = createReadStream(outputPath)
        return new Response(stream as unknown as ReadableStream, {
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Length': String(stats.size),
          },
        })
      },
    },
  },
})

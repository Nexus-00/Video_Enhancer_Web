import { createFileRoute } from '@tanstack/react-router'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))

export const Route = createFileRoute('/api/output/$jobId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const root = resolve(__dirname, '..', '..', '..', '..')
        const outputPath = join(root, 'data', 'outputs', `${params.jobId}.mp4`)

        if (!existsSync(outputPath)) {
          return new Response('Not found', { status: 404 })
        }

        const file = Bun.file(outputPath)
        return new Response(file)
      },
    },
  },
})

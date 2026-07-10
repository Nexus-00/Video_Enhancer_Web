import { createFileRoute } from '@tanstack/react-router'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = dirname(fileURLToPath(import.meta.url))
import { createJob, startJobWorker } from '~/server/jobs'
import type { JobOptions } from '~/types'

export const Route = createFileRoute('/api/upload')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const formData = await request.formData()
        const file = formData.get('file') as File | null
        const optionsJson = formData.get('options') as string | null

        if (!file || !optionsJson) {
          return Response.json({ error: 'Missing file or options' }, { status: 400 })
        }

        const options = JSON.parse(optionsJson) as JobOptions
        const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')

        const job = await createJob({
          data: { filename, options },
        })

        const root = resolve(__dirname, '..', '..', '..', '..')
        const uploadDir = join(root, 'data', 'uploads', job.id)
        await mkdir(uploadDir, { recursive: true })
        const inputPath = join(uploadDir, filename)
        await writeFile(inputPath, new Uint8Array(await file.arrayBuffer()))

        const outputPath = join(root, 'data', 'outputs', `${job.id}.mp4`)
        startJobWorker(job.id, inputPath, outputPath, options)

        return Response.json({ id: job.id, status: 'running' })
      },
    },
  },
})

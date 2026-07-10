import { createFileRoute } from '@tanstack/react-router'
import { downloadModels, listModelFiles } from '~/server/models'

export const Route = createFileRoute('/api/models')({
  server: {
    handlers: {
      GET: async () => {
        const files = await listModelFiles()
        return Response.json(files)
      },
      POST: async () => {
        await downloadModels()
        return Response.json({ started: true })
      },
    },
  },
})

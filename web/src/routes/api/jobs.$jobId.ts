import { createFileRoute } from '@tanstack/react-router'
import { getJob as getJobDb } from '~/server/db'

export const Route = createFileRoute('/api/jobs/$jobId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const job = getJobDb(params.jobId)
        return Response.json(job)
      },
    },
  },
})

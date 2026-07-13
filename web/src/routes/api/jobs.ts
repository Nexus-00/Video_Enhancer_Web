import { createFileRoute } from '@tanstack/react-router'
import { listAllJobs } from '~/server/jobs'

export const Route = createFileRoute('/api/jobs')({
  server: {
    handlers: {
      GET: async () => {
        const jobs = listAllJobs()
        return Response.json(jobs)
      },
    },
  },
})

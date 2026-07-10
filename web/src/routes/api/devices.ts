import { createFileRoute } from '@tanstack/react-router'
import { getDevices } from '~/server/devices'

export const Route = createFileRoute('/api/devices')({
  server: {
    handlers: {
      GET: async () => {
        const devices = await getDevices()
        return Response.json(devices)
      },
    },
  },
})

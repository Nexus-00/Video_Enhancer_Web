import { createFileRoute } from '@tanstack/react-router'
import { detectDevices } from '~/server/devices'

export const Route = createFileRoute('/api/devices')({
  server: {
    handlers: {
      GET: async () => {
        const devices = await detectDevices()
        return Response.json(devices)
      },
    },
  },
})

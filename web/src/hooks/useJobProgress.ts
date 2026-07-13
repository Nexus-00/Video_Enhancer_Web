import { useEffect, useState } from 'react'
import type { JobRow } from '~/types'

export function useJobProgress(jobId: string | null) {
  const [job, setJob] = useState<JobRow | null>(null)

  useEffect(() => {
    if (!jobId) return

    let cancelled = false
    let eventSource: EventSource | null = null

    const connect = () => {
      eventSource = new EventSource(`/api/jobs/${jobId}?stream=1`)
      eventSource.onmessage = (event) => {
        if (cancelled) return
        try {
          const data = JSON.parse(event.data) as JobRow
          setJob(data)
          if (data.status === 'completed' || data.status === 'failed') {
            eventSource?.close()
          }
        } catch (err) {
          console.error('Failed to parse SSE message:', err)
        }
      }
      eventSource.onerror = (err) => {
        console.error('SSE error:', err)
        eventSource?.close()
      }
    }

    connect()
    return () => {
      cancelled = true
      eventSource?.close()
    }
  }, [jobId])

  return job
}

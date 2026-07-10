import { useEffect, useState } from 'react'
import type { JobRow } from '~/types'

export function useJobProgress(jobId: string | null) {
  const [job, setJob] = useState<JobRow | null>(null)

  useEffect(() => {
    if (!jobId) return

    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          setJob(data)
        }
      } catch (err) {
        console.error('Failed to poll job:', err)
      }
    }

    poll()
    const interval = setInterval(poll, 1000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [jobId])

  return job
}

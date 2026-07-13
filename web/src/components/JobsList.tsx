import { useEffect, useState } from 'react'
import type { JobRow } from '~/types'

const statusColor: Record<string, string> = {
  pending: 'text-yellow-400',
  running: 'text-blue-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
  cancelled: 'text-gray-400',
}

export function JobsList() {
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [cancelling, setCancelling] = useState<Set<string>>(new Set())

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs')
      if (!res.ok) throw new Error('Failed to fetch jobs')
      const data = await res.json()
      setJobs(data as JobRow[])
    } catch (err) {
      console.error('Failed to fetch jobs:', err)
    }
  }

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, 3000)
    return () => clearInterval(interval)
  }, [])

  const handleCancel = async (id: string) => {
    setCancelling((prev) => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: 'POST' })
      const result = await res.json()
      if (!result.success) {
        console.warn('Cancel job result:', result.reason)
      }
    } catch (err) {
      console.error('Failed to cancel job:', err)
    } finally {
      setCancelling((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      fetchJobs()
    }
  }

  const formatDate = (ts: number) => new Date(ts).toLocaleString()

  return (
    <div className="bg-gray-900 p-5 space-y-3 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Jobs</h2>
        <button
          onClick={fetchJobs}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          Refresh
        </button>
      </div>

      {jobs.length === 0 ? (
        <p className="text-sm text-gray-500">No jobs yet.</p>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => {
            const canCancel = job.status === 'pending' || job.status === 'running'
            return (
              <li key={job.id} className="bg-gray-800 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`font-medium ${statusColor[job.status] ?? 'text-gray-300'}`}>
                    {job.status}
                  </span>
                  {canCancel && (
                    <button
                      onClick={() => handleCancel(job.id)}
                      disabled={cancelling.has(job.id)}
                      className="text-sm bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-3 py-1 transition-colors"
                    >
                      {cancelling.has(job.id) ? 'Cancelling...' : 'Cancel'}
                    </button>
                  )}
                </div>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>ID: {job.id}</p>
                  <p>Device: {job.device ?? 'unknown'}</p>
                  {job.stage && <p>Stage: {job.stage}</p>}
                  {job.progress !== undefined && job.progress > 0 && job.status === 'running' && (
                    <div className="space-y-1">
                      <div className="h-1.5 bg-gray-700">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${Math.min(100, job.progress * 100)}%` }}
                        />
                      </div>
                      <p>{(job.progress * 100).toFixed(0)}%</p>
                    </div>
                  )}
                  {job.error && <p className="text-red-400">Error: {job.error}</p>}
                  <p>Created: {formatDate(job.created_at)}</p>
                  <p>Updated: {formatDate(job.updated_at)}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

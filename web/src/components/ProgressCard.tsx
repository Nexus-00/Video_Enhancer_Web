import type { JobRow } from '~/types'

interface ProgressCardProps {
  job: JobRow | null
}

export function ProgressCard({ job }: ProgressCardProps) {
  if (!job) return null

  const progress = Math.min(Math.max(job.progress ?? 0, 0), 1)
  const percent = Math.round(progress * 100)

  return (
    <div className="bg-gray-900 p-5 space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Processing</h2>
        <span className="text-sm text-gray-400 capitalize">{job.status}</span>
      </div>

      <div className="h-3 bg-gray-800 overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex justify-between text-sm text-gray-400">
        <span>{job.stage ?? 'Waiting'}</span>
        <span>{percent}%</span>
      </div>

      {job.current_frame != null && job.total_frames != null && (
        <p className="text-sm text-gray-400">
          Frame {job.current_frame} / {job.total_frames}
        </p>
      )}
    </div>
  )
}

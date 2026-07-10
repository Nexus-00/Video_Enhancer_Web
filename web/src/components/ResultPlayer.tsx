import type { JobRow } from '~/types'

interface ResultPlayerProps {
  job: JobRow | null
}

export function ResultPlayer({ job }: ResultPlayerProps) {
  if (!job || job.status !== 'completed' || !job.output_path) return null

  const outputUrl = `/api/output/${job.id}`

  return (
    <div className="bg-gray-900 rounded-xl p-5 space-y-3">
      <h2 className="text-lg font-semibold">Result</h2>
      <video
        src={outputUrl}
        controls
        className="w-full rounded-lg"
        poster=""
      />
      <a
        href={outputUrl}
        download={`enhanced-${job.id}.mp4`}
        className="inline-block w-full text-center bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded-lg transition-colors"
      >
        Download video
      </a>
    </div>
  )
}

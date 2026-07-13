import type { JobRow } from '~/types'

interface LivePreviewProps {
  job: JobRow | null
}

export function LivePreview({ job }: LivePreviewProps) {
  const isProcessing = job && job.status === 'running'
  const previewUrl = job?.preview_base64
    ? `data:image/jpeg;base64,${job.preview_base64}`
    : null

  return (
    <div className="bg-gray-900 p-5">
      <h2 className="text-lg font-semibold mb-3">Live preview</h2>
      <div className="aspect-video bg-gray-800 flex items-center justify-center overflow-hidden">
        {previewUrl ? (
          <img src={previewUrl} alt="Latest frame" className="max-w-full max-h-full" />
        ) : isProcessing ? (
          <span className="text-gray-400">Frame preview will appear here</span>
        ) : (
          <span className="text-gray-500">No active job</span>
        )}
      </div>
    </div>
  )
}

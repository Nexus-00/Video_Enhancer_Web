import type { JobRow } from '~/types'

interface LivePreviewProps {
  job: JobRow | null
}

export function LivePreview({ job }: LivePreviewProps) {
  // previewBase64 is stored in options? No, we need to update the schema or store preview elsewhere.
  // For now, just show a placeholder.
  const isProcessing = job && job.status === 'running'

  return (
    <div className="bg-gray-900 rounded-xl p-5">
      <h2 className="text-lg font-semibold mb-3">Live preview</h2>
      <div className="aspect-video bg-gray-800 rounded-lg flex items-center justify-center overflow-hidden">
        {isProcessing ? (
          <span className="text-gray-400">Frame preview will appear here</span>
        ) : (
          <span className="text-gray-500">No active job</span>
        )}
      </div>
    </div>
  )
}

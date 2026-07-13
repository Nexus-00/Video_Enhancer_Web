import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { ConfigPanel } from '~/components/ConfigPanel'
import { LivePreview } from '~/components/LivePreview'
import { ProgressCard } from '~/components/ProgressCard'
import { ResultPlayer } from '~/components/ResultPlayer'
import { UploadDropzone } from '~/components/UploadDropzone'
import { useJobProgress } from '~/hooks/useJobProgress'
import { ModelManager } from '~/components/ModelManager'
import { JobsList } from '~/components/JobsList'
import type { JobOptions } from '~/types'

export const Route = createFileRoute('/')({
  component: Home,
})

const defaultOptions: JobOptions = {
  device: 'cpu',
  targetFps: 60,
  interpolate: 2,
  interpolationModel: 'rife',
  upscaleScale: 4,
  deblur: true,
  removeDuplicates: true,
  duplicateThreshold: 10,
}

function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [options, setOptions] = useState<JobOptions>(defaultOptions)
  const [jobId, setJobId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const job = useJobProgress(jobId)

  const handleStart = async () => {
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('options', JSON.stringify(options))

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.id) setJobId(data.id)
    } finally {
      setUploading(false)
    }
  }

  return (
    <main className="max-w-[1920px] mx-auto px-4 py-6">
      <header className="text-center space-y-1 mb-6">
        <h1 className="text-3xl font-bold text-blue-400">AI Video Enhancer</h1>
        <p className="text-gray-400 text-sm">Upscale, deblur, and interpolate your videos</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-6">
          <UploadDropzone file={file} onFileSelect={setFile} />

          <ConfigPanel options={options} onChange={setOptions} />

          <button
            onClick={handleStart}
            disabled={!file || uploading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 transition-colors"
          >
            {uploading ? 'Uploading...' : 'Start processing'}
          </button>

          {job && (
            <>
              <ProgressCard job={job} />
              <LivePreview job={job} />
            </>
          )}

          <ModelManager />
          <ResultPlayer job={job} />
        </div>

        <div className="lg:sticky lg:top-6">
          <JobsList />
        </div>
      </div>
    </main>
  )
}

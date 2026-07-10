import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { ConfigPanel } from '~/components/ConfigPanel'
import { LivePreview } from '~/components/LivePreview'
import { ProgressCard } from '~/components/ProgressCard'
import { ResultPlayer } from '~/components/ResultPlayer'
import { UploadDropzone } from '~/components/UploadDropzone'
import { useJobProgress } from '~/hooks/useJobProgress'
import { ModelManager } from '~/components/ModelManager'
import type { JobOptions } from '~/types'

export const Route = createFileRoute('/')({
  component: Home,
})

const defaultOptions: JobOptions = {
  device: 'cpu',
  targetResolution: '1920x1080',
  targetFps: 60,
  interpolate: 2,
  upscale: true,
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
    <main className="max-w-md mx-auto px-4 py-6 space-y-6 md:max-w-2xl">
      <header className="text-center space-y-1">
        <h1 className="text-3xl font-bold text-blue-400">AI Video Enhancer</h1>
        <p className="text-gray-400 text-sm">Upscale, deblur, and interpolate your videos</p>
      </header>

      <UploadDropzone file={file} onFileSelect={setFile} />

      <ConfigPanel options={options} onChange={setOptions} />

      <button
        onClick={handleStart}
        disabled={!file || uploading}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
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
    </main>
  )
}
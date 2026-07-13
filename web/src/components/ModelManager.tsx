import { useEffect, useState } from 'react'

interface DownloadEvent {
  type: 'start' | 'progress' | 'model' | 'done' | 'error' | 'log'
  index?: number
  name?: string
  status?: 'pending' | 'downloading' | 'done' | 'skipped' | 'error'
  percent?: number
  overall?: number
  downloaded?: number
  total?: number
  message?: string
}

export function ModelManager() {
  const [models, setModels] = useState<string[]>([])
  const [downloading, setDownloading] = useState(false)
  const [overall, setOverall] = useState(0)
  const [currentModel, setCurrentModel] = useState<string | null>(null)
  const [modelStatus, setModelStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchModels = () => {
    fetch('/api/models').then((r) => r.json())
      .then(setModels)
      .catch(() => setModels([]))
  }

  useEffect(() => {
    fetchModels()
  }, [])

  const handleDownload = async () => {
    setDownloading(true)
    setOverall(0)
    setCurrentModel(null)
    setModelStatus(null)
    setError(null)

    try {
      const response = await fetch('/api/models', { method: 'POST' })
      if (!response.body) {
        throw new Error('No response body from download stream')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line) as DownloadEvent
            if (event.type === 'start') {
              setOverall(0)
            } else if (event.type === 'progress') {
              if (event.overall !== undefined) setOverall(event.overall)
              if (event.name) setCurrentModel(event.name)
              setModelStatus(`${event.percent?.toFixed(0) ?? 0}%`)
            } else if (event.type === 'model') {
              if (event.name) setCurrentModel(event.name)
              setModelStatus(event.status ?? null)
              if (event.overall !== undefined) setOverall(event.overall)
              if (event.status === 'error' && event.message) {
                setError(event.message)
              }
            } else if (event.type === 'done') {
              setOverall(100)
              setModelStatus('done')
            } else if (event.type === 'error') {
              setError(event.message ?? 'Download failed')
            } else if (event.type === 'log') {
              // ignore verbose logs in UI
            }
          } catch (err) {
            console.error('Failed to parse download event:', line, err)
          }
        }
      }

      fetchModels()
    } catch (err) {
      console.error('Failed to download models:', err)
      setError(err instanceof Error ? err.message : 'Failed to download models')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="bg-gray-900 p-5 space-y-3">
      <h2 className="text-lg font-semibold">Models</h2>
      <p className="text-sm text-gray-400">
        Download pretrained weights for ML-based enhancement. Includes Real-ESRGAN, NAFNet, RIFE, and FLAVR.
      </p>
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-2 transition-colors"
      >
        {downloading ? 'Downloading...' : 'Download models'}
      </button>

      {downloading && (
        <div className="space-y-2">
          <div className="h-2 bg-gray-700">
            <div
              className="h-full bg-green-500 transition-all duration-200"
              style={{ width: `${overall}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>{currentModel ? `Downloading ${currentModel}` : 'Starting...'}</span>
            <span>{modelStatus ? `${modelStatus} (${overall.toFixed(0)}%)` : `${overall.toFixed(0)}%`}</span>
          </div>
        </div>
      )}

      {error && !downloading && (
        <p className="text-sm text-red-400">Error: {error}</p>
      )}

      {models.length > 0 && (
        <div className="text-sm text-gray-400">
          <p className="font-medium text-gray-300">Available models:</p>
          <ul className="list-disc pl-4">
            {models.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

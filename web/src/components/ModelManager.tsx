import { useEffect, useState } from 'react'

export function ModelManager() {
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/models').then((r) => r.json())
      .then(setModels)
      .catch(() => setModels([]))
  }, [loading])

  const handleDownload = async () => {
    setLoading(true)
    try {
      await fetch('/api/models', { method: 'POST' })
      alert('Model download started in the background. You can check back later.')
    } catch (err) {
      console.error('Failed to start downloads:', err)
      alert('Failed to start model downloads.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl p-5 space-y-3">
      <h2 className="text-lg font-semibold">Models</h2>
      <p className="text-sm text-gray-400">
        Download pretrained weights for ML-based enhancement.
      </p>
      <button
        onClick={handleDownload}
        disabled={loading}
        className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition-colors"
      >
        {loading ? 'Starting download...' : 'Download models'}
      </button>
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

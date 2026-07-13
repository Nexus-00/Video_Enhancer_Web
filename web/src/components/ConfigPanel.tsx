import { useEffect, useState } from 'react'
import type { JobOptions } from '~/types'

interface ConfigPanelProps {
  options: JobOptions
  onChange: (options: JobOptions) => void
}

export function ConfigPanel({ options, onChange }: ConfigPanelProps) {
  const [devices, setDevices] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    fetch('/api/devices').then((r) => r.json())
      .then(setDevices)
      .catch(() => setDevices([{ id: 'cpu', name: 'CPU' }]))
  }, [])

  const update = <K extends keyof JobOptions>(key: K, value: JobOptions[K]) => {
    onChange({ ...options, [key]: value })
  }

  return (
    <div className="bg-gray-900 p-5 space-y-4">
      <h2 className="text-lg font-semibold">Enhancement settings</h2>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Processing device</label>
        <select
          value={options.device}
          onChange={(e) => update('device', e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 px-3 py-2"
        >
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Target FPS</label>
        <select
          value={options.targetFps}
          onChange={(e) => update('targetFps', Number(e.target.value))}
          className="w-full bg-gray-800 border border-gray-700 px-3 py-2"
        >
          <option value={30}>30 FPS</option>
          <option value={60}>60 FPS</option>
          <option value={90}>90 FPS</option>
          <option value={120}>120 FPS</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="upscale-scale" className="block text-sm text-gray-400 mb-1">Upscale scale</label>
          <select
            id="upscale-scale"
            value={options.upscaleScale}
            onChange={(e) => update('upscaleScale', Number(e.target.value) as 1 | 2 | 4)}
            className="w-full bg-gray-800 border border-gray-700 px-3 py-2"
          >
            <option value={1}>None</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </div>
        <div>
          <label htmlFor="interpolation-multiplier" className="block text-sm text-gray-400 mb-1">Interpolation multiplier</label>
          <select
            id="interpolation-multiplier"
            value={options.interpolate}
            onChange={(e) => update('interpolate', Number(e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 px-3 py-2"
          >
            <option value={1}>None</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 bg-gray-800 p-3">
        <input
          type="checkbox"
          checked={options.deblur}
          onChange={(e) => update('deblur', e.target.checked)}
        />
        <span className="text-sm">Deblur</span>
      </label>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={options.removeDuplicates}
          onChange={(e) => update('removeDuplicates', e.target.checked)}
        />
        <span className="text-sm">Remove duplicate frames</span>
      </label>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Interpolation model</label>
        <select
          value={options.interpolationModel}
          onChange={(e) => update('interpolationModel', e.target.value as 'rife' | 'flavr')}
          className="w-full bg-gray-800 border border-gray-700 px-3 py-2"
        >
          <option value="rife">RIFE (latest, CUDA)</option>
          <option value="flavr">FLAVR (multi-frame, single-shot)</option>
        </select>
      </div>

      {options.removeDuplicates && (
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            Duplicate threshold (MSE)
          </label>
          <input
            type="number"
            value={options.duplicateThreshold}
            onChange={(e) => update('duplicateThreshold', Number(e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 px-3 py-2"
          />
          <p className="text-xs text-gray-500 mt-1">
            Lower values are stricter. A frame is dropped when its mean-squared error to the previous kept frame is below this number. Try 5–15 for near-identical frames.
          </p>
        </div>
      )}
    </div>
  )
}

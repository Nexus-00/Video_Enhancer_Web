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
    <div className="bg-gray-900 rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Enhancement settings</h2>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Processing device</label>
        <select
          value={options.device}
          onChange={(e) => update('device', e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
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
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
        >
          <option value={30}>30 FPS</option>
          <option value={60}>60 FPS</option>
          <option value={120}>120 FPS</option>
        </select>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Interpolation multiplier</label>
        <select
          value={options.interpolate}
          onChange={(e) => update('interpolate', Number(e.target.value))}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
        >
          <option value={1}>None</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex items-center gap-2 bg-gray-800 rounded-lg p-3">
          <input
            type="checkbox"
            checked={options.upscale}
            onChange={(e) => update('upscale', e.target.checked)}
          />
          <span className="text-sm">Upscale</span>
        </label>
        <label className="flex items-center gap-2 bg-gray-800 rounded-lg p-3">
          <input
            type="checkbox"
            checked={options.deblur}
            onChange={(e) => update('deblur', e.target.checked)}
          />
          <span className="text-sm">Deblur</span>
        </label>
      </div>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={options.removeDuplicates}
          onChange={(e) => update('removeDuplicates', e.target.checked)}
        />
        <span className="text-sm">Remove duplicate frames</span>
      </label>

      {options.removeDuplicates && (
        <div>
          <label className="block text-sm text-gray-400 mb-1">Duplicate threshold</label>
          <input
            type="number"
            value={options.duplicateThreshold}
            onChange={(e) => update('duplicateThreshold', Number(e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
          />
        </div>
      )}
    </div>
  )
}

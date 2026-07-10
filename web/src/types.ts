export interface JobOptions {
  device: string
  targetResolution: string
  targetFps: number
  interpolate: number
  upscale: boolean
  deblur: boolean
  removeDuplicates: boolean
  duplicateThreshold: number
}

export interface JobRow {
  id: string
  status: string
  stage: string | null
  progress: number
  current_frame: number | null
  total_frames: number | null
  eta_seconds: number | null
  device: string | null
  options: string | null
  input_path: string | null
  output_path: string | null
  error: string | null
  created_at: number
  updated_at: number
}

export interface DeviceInfo {
  id: string
  name: string
  type: "cuda" | "mps" | "cpu"
}

import { useCallback } from 'react'

interface UploadDropzoneProps {
  file: File | null
  onFileSelect: (file: File) => void
}

export function UploadDropzone({ file, onFileSelect }: UploadDropzoneProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const dropped = e.dataTransfer.files[0]
      if (dropped && dropped.type.startsWith('video/')) {
        onFileSelect(dropped)
      }
    },
    [onFileSelect]
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) onFileSelect(selected)
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 transition-colors"
    >
      <input
        type="file"
        accept="video/*"
        onChange={handleChange}
        className="hidden"
        id="video-upload"
      />
      <label htmlFor="video-upload" className="block cursor-pointer">
        <div className="text-4xl mb-2">📁</div>
        <p className="font-medium">
          {file ? file.name : 'Drop a video here or tap to browse'}
        </p>
        <p className="text-sm text-gray-400 mt-1">MP4, MOV, MKV up to 2 GB</p>
      </label>
    </div>
  )
}

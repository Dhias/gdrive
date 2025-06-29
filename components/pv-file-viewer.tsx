"use client"

interface FileItem {
  id: string
  name: string
  url: string
  contentType: string
}

interface PVFileViewerProps {
  file: FileItem
  isOpen: boolean
  onClose: () => void
  onViewOriginal: (originalFile: FileItem) => void
}

export default function PVFileViewer({ file, isOpen, onClose, onViewOriginal }: PVFileViewerProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-4xl max-h-screen overflow-auto">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="text-lg font-semibold">{file.name}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {file.contentType.startsWith("image/") ? (
          <img src={file.url || "/placeholder.svg"} alt={file.name} className="w-full" />
        ) : file.contentType === "application/pdf" ? (
          <iframe src={file.url} className="w-full h-[600px]"></iframe>
        ) : (
          <p className="p-4">Unsupported file type.</p>
        )}

        <div className="p-4 border-t flex justify-end">
          <button
            onClick={() => onViewOriginal(file)}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            View Original
          </button>
        </div>
      </div>
    </div>
  )
}

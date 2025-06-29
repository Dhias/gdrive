"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Download, FileIcon, FileText, ImageIcon, Music, Video, Calendar, HardDrive, FileType } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface SharedFilePageProps {
  params: {
    fileId: string
  }
}

interface FileData {
  fileName: string
  fileType: string
  publicUrl: string
  extension: string
  fileSize: number
  formattedSize: string
  lastModified?: string
  expiresAt?: string
  deleteAfterDownload?: boolean
}

export default function SharedFilePage({ params }: SharedFilePageProps) {
  const [fileData, setFileData] = useState<FileData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isDownloaded, setIsDownloaded] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)

  useEffect(() => {
    const fetchFileData = async () => {
      try {
        const response = await fetch(`/api/share/${params.fileId}`)

        if (!response.ok) {
          throw new Error("File not found")
        }

        const data = await response.json()
        setFileData(data)
      } catch (err) {
        setError("The requested file could not be found or has expired")
      } finally {
        setIsLoading(false)
      }
    }

    fetchFileData()
  }, [params.fileId])

  const getFileIcon = () => {
    if (!fileData) return <FileIcon className="h-16 w-16 text-gray-400" />

    if (fileData.fileType.startsWith("image/")) {
      return <ImageIcon className="h-16 w-16 text-purple-500" />
    } else if (fileData.fileType.startsWith("video/")) {
      return <Video className="h-16 w-16 text-blue-500" />
    } else if (fileData.fileType.startsWith("audio/")) {
      return <Music className="h-16 w-16 text-green-500" />
    } else if (
      fileData.fileType === "application/pdf" ||
      fileData.fileType.includes("document") ||
      fileData.fileType.includes("text/")
    ) {
      return <FileText className="h-16 w-16 text-orange-500" />
    } else {
      return <FileIcon className="h-16 w-16 text-gray-500" />
    }
  }

  const renderPreview = () => {
    if (!fileData) return null

    if (fileData.fileType.startsWith("image/")) {
      return (
        <div className="flex justify-center mb-6">
          <img
            src={fileData.publicUrl || "/placeholder.svg"}
            alt={fileData.fileName}
            className="max-w-full max-h-64 object-contain rounded-lg shadow-md"
          />
        </div>
      )
    }

    return <div className="flex justify-center mb-6">{getFileIcon()}</div>
  }

  // Format date
  const formatDate = (dateString?: string) => {
    if (!dateString) return "Unknown date"
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  // Handle file download
  const handleDownload = async () => {
    if (!fileData) return

    setIsDownloading(true)
    setDownloadProgress(0)

    try {
      // Use the direct download API endpoint instead of the public URL
      const response = await fetch(`/api/download/${params.fileId}`)

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`)
      }

      // Get the total size for progress calculation
      const contentLength = response.headers.get("Content-Length")
      const total = contentLength ? Number.parseInt(contentLength, 10) : 0

      // Create a reader to read the stream
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error("Failed to get response reader")
      }

      // Create a new response with the same headers
      const newResponse = new Response(
        new ReadableStream({
          async start(controller) {
            let receivedLength = 0

            try {
              while (true) {
                const { done, value } = await reader.read()

                if (done) {
                  controller.close()
                  break
                }

                receivedLength += value.length
                if (total > 0) {
                  setDownloadProgress(Math.round((receivedLength / total) * 100))
                }

                controller.enqueue(value)
              }
            } catch (error) {
              controller.error(error)
            }
          },
        }),
        response,
      )

      // Get the blob from the response
      const blob = await newResponse.blob()

      // Create a blob URL
      const url = URL.createObjectURL(blob)

      // Create a temporary anchor element
      const a = document.createElement("a")
      a.href = url
      a.download = fileData.fileName
      document.body.appendChild(a)

      // Trigger the download
      a.click()

      // Clean up
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 100)

      // Mark as downloaded
      setIsDownloaded(true)

      // Notify the server that the file was downloaded
      if (fileData.deleteAfterDownload) {
        try {
          await fetch(`/api/downloaded/${params.fileId}`, { method: "POST" })
        } catch (error) {
          console.error("Failed to notify server about download:", error)
        }
      }
    } catch (error) {
      console.error("Download error:", error)
      alert("Failed to download the file. Please try again.")
    } finally {
      setIsDownloading(false)
    }
  }

  // Calculate expiration time remaining
  const getExpirationInfo = () => {
    if (!fileData?.expiresAt) return null

    const expiresAt = new Date(fileData.expiresAt)
    const now = new Date()

    if (expiresAt <= now) {
      return "This file has expired"
    }

    const diffMs = expiresAt.getTime() - now.getTime()
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

    if (diffHrs > 0) {
      return `Expires in ${diffHrs} hour${diffHrs > 1 ? "s" : ""} and ${diffMins} minute${diffMins > 1 ? "s" : ""}`
    } else {
      return `Expires in ${diffMins} minute${diffMins > 1 ? "s" : ""}`
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-red-600">File Not Found</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" onClick={() => window.close()} className="w-full">
              Close
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">{getFileIcon()}</div>
          <CardTitle className="text-xl">{fileData?.fileName}</CardTitle>
          <div className="flex justify-center mt-2">
            <Badge variant="outline" className="mr-2">
              {fileData?.extension.toUpperCase()}
            </Badge>
            <Badge variant="secondary">{fileData?.formattedSize}</Badge>
          </div>
          <CardDescription className="mt-2">Shared via LocalDrive</CardDescription>
        </CardHeader>
        <CardContent>
          {renderPreview()}

          <div className="space-y-2 text-sm text-gray-500">
            <div className="flex items-center">
              <FileType className="h-4 w-4 mr-2" />
              <span>Type: {fileData?.fileType}</span>
            </div>
            <div className="flex items-center">
              <HardDrive className="h-4 w-4 mr-2" />
              <span>Size: {fileData?.formattedSize}</span>
            </div>
            <div className="flex items-center">
              <Calendar className="h-4 w-4 mr-2" />
              <span>Uploaded: {formatDate(fileData?.lastModified)}</span>
            </div>

            {isDownloaded ? (
              <div className="bg-green-50 text-green-700 p-3 rounded-md mt-4">
                File has been downloaded.{" "}
                {fileData?.deleteAfterDownload ? "It will be automatically deleted from our servers." : ""}
              </div>
            ) : (
              <div className="bg-blue-50 text-blue-700 p-3 rounded-md mt-4">
                {fileData?.deleteAfterDownload
                  ? "This file will be automatically deleted after it has been downloaded."
                  : getExpirationInfo()}
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col">
          {isDownloading && downloadProgress > 0 && (
            <div className="w-full mb-3">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${downloadProgress}%` }}></div>
              </div>
              <p className="text-xs text-center mt-1">{downloadProgress}% downloaded</p>
            </div>
          )}
          <Button onClick={handleDownload} className="w-full" disabled={isDownloading || isDownloaded}>
            <Download className="mr-2 h-4 w-4" />
            {isDownloading ? "Downloading..." : isDownloaded ? "Downloaded" : "Download File"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

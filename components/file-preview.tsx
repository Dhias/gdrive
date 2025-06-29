"use client"

import { useState, useEffect } from "react"
import { X, Download, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { FileItem } from "@/lib/types"

interface FilePreviewProps {
  file: FileItem
  content: Blob
  isOpen: boolean
  onClose: () => void
}

export default function FilePreview({ file, content, isOpen, onClose }: FilePreviewProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [textContent, setTextContent] = useState<string | null>(null)
  const [decryptedContent, setDecryptedContent] = useState<Blob | null>(null)
  const [isDecrypting, setIsDecrypting] = useState(false)

  useEffect(() => {
    const decryptAndPreview = async () => {
      setIsDecrypting(true)
      try {
        // Check if the file is encrypted
        const isEncrypted = file.encrypted === true

        // Decrypt if needed, otherwise use the original content
        const finalContent = isEncrypted ? await decryptFile(content) : content
        setDecryptedContent(finalContent)

        // For text files, load the text content
        if (file.type.includes("text/") || file.type === "application/json") {
          const reader = new FileReader()
          reader.onload = (e) => {
            setTextContent((e.target?.result as string) || "")
          }
          reader.readAsText(finalContent)
        }
      } catch (error) {
        console.error("Failed to decrypt or process file:", error)
        // If decryption fails, use the original content
        setDecryptedContent(content)
      } finally {
        setIsDecrypting(false)
      }
    }

    if (isOpen && content) {
      decryptAndPreview()
    }

    return () => {
      // Clean up any object URLs when component unmounts
      if (decryptedContent) {
        URL.revokeObjectURL(URL.createObjectURL(decryptedContent))
      }
    }
  }, [file, content, isOpen])

  // Decrypt file using Web Crypto API
  const decryptFile = async (encryptedBlob: Blob): Promise<Blob> => {
    try {
      // Get the encryption key
      const key = await getEncryptionKey()

      // Convert blob to ArrayBuffer
      const encryptedBuffer = await encryptedBlob.arrayBuffer()

      // Extract IV (first 12 bytes) and encrypted data
      const iv = new Uint8Array(encryptedBuffer.slice(0, 12))
      const data = new Uint8Array(encryptedBuffer.slice(12))

      // Decrypt the file
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv,
        },
        key,
        data,
      )

      // Return as Blob with the original file type
      return new Blob([decryptedBuffer], { type: file.type })
    } catch (error) {
      console.error("Decryption error:", error)
      // If decryption fails, return the original blob
      return encryptedBlob
    }
  }

  // Get encryption key
  const getEncryptionKey = async (): Promise<CryptoKey> => {
    // Check if we already have a key in localStorage
    const storedKey = localStorage.getItem("encryptionKey")

    if (!storedKey) {
      throw new Error("Encryption key not found")
    }

    // Convert stored key back to CryptoKey
    const keyBuffer = Uint8Array.from(atob(storedKey), (c) => c.charCodeAt(0))
    return crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
  }

  if (!isOpen || !decryptedContent) return null

  // Create object URL for the file content
  const objectUrl = URL.createObjectURL(decryptedContent)

  // Clean up object URL when component unmounts
  const handleClose = () => {
    URL.revokeObjectURL(objectUrl)
    onClose()
  }

  // Handle download
  const handleDownload = () => {
    const a = document.createElement("a")
    a.href = objectUrl
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // Toggle fullscreen
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
  }

  // Render preview based on file type
  const renderPreview = () => {
    if (isDecrypting) {
      return (
        <div className="flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-500">Decrypting file...</p>
        </div>
      )
    }

    if (file.type.startsWith("image/")) {
      return (
        <img
          src={objectUrl || "/placeholder.svg"}
          alt={file.name}
          className="max-w-full max-h-full object-contain"
          onError={(e) => {
            ;(e.target as HTMLImageElement).src = "/placeholder.svg"
          }}
        />
      )
    } else if (file.type === "application/pdf") {
      return <iframe src={`${objectUrl}#toolbar=0`} className="w-full h-full" title={file.name} />
    } else if (file.type.includes("text/") || file.type === "application/json") {
      return (
        <div className="bg-white p-4 rounded overflow-auto max-h-full w-full">
          <pre className="text-sm whitespace-pre-wrap">{textContent || "Loading text content..."}</pre>
        </div>
      )
    } else if (file.type.includes("video/")) {
      return (
        <video controls className="max-w-full max-h-full">
          <source src={objectUrl} type={file.type} />
          Your browser does not support the video tag.
        </video>
      )
    } else if (file.type.includes("audio/")) {
      return (
        <div className="flex flex-col items-center">
          <audio controls className="w-full max-w-md">
            <source src={objectUrl} type={file.type} />
            Your browser does not support the audio tag.
          </audio>
        </div>
      )
    } else {
      return (
        <div className="flex flex-col items-center justify-center text-center p-8">
          <div className="text-6xl mb-4">📄</div>
          <h3 className="text-xl font-semibold mb-2">{file.name}</h3>
          <p className="text-gray-500 mb-4">Preview not available for this file type</p>
          <Button onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />
            Download File
          </Button>
        </div>
      )
    }
  }

  return (
    <div
      className={`fixed inset-0 bg-black/80 z-50 flex items-center justify-center ${
        isFullscreen ? "p-0" : "p-4 md:p-8"
      }`}
      onClick={handleClose}
    >
      <div
        className={`bg-gray-100 rounded-lg overflow-hidden flex flex-col ${
          isFullscreen ? "w-full h-full" : "max-w-4xl w-full max-h-[90vh]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 bg-white border-b">
          <h3 className="font-medium truncate max-w-md">{file.name}</h3>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
              {isFullscreen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleDownload}>
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto flex items-center justify-center p-4">{renderPreview()}</div>
      </div>
    </div>
  )
}

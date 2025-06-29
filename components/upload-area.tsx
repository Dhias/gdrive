"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Upload, X, LinkIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { saveFile } from "@/lib/db"
import type { Folder } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { isPVFile } from "@/lib/pv-format"
import PVImportDialog from "@/components/pv-import-dialog"
import { importPVFile } from "@/lib/pv-format"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

interface UploadAreaProps {
  currentFolder: Folder | null
  refreshData: () => void
}

export default function UploadArea({ currentFolder, refreshData }: UploadAreaProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [isUrlDialogOpen, setIsUrlDialogOpen] = useState(false)
  const [fileUrl, setFileUrl] = useState("")
  const [isUrlLoading, setIsUrlLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropAreaRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const [isPVImportDialogOpen, setIsPVImportDialogOpen] = useState(false)
  const [pvFileToImport, setPvFileToImport] = useState<File | null>(null)
  const [pvError, setPvError] = useState<string | null>(null)

  // Set up global drag and drop handlers
  useEffect(() => {
    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Only set dragging state if files are being dragged
      if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
        setIsDragging(true)
      }
    }

    const handleGlobalDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Check if the drag leave event is leaving the window
      if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        setIsDragging(false)
      }
    }

    const handleGlobalDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
    }

    // Add global event listeners
    window.addEventListener("dragover", handleGlobalDragOver)
    window.addEventListener("dragleave", handleGlobalDragLeave)
    window.addEventListener("drop", handleGlobalDrop)

    // Set up paste event listener for URLs
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        // Handle image paste
        if (items[i].type.indexOf("image") !== -1) {
          const blob = items[i].getAsFile()
          if (blob) {
            await handleFiles([blob])
          }
        }
        // Handle URL paste
        else if (items[i].type === "text/plain") {
          items[i].getAsString(async (text) => {
            if (isValidUrl(text)) {
              setFileUrl(text)
              setIsUrlDialogOpen(true)
            }
          })
        }
      }
    }

    document.addEventListener("paste", handlePaste)

    return () => {
      // Clean up event listeners
      window.removeEventListener("dragover", handleGlobalDragOver)
      window.removeEventListener("dragleave", handleGlobalDragLeave)
      window.removeEventListener("drop", handleGlobalDrop)
      document.removeEventListener("paste", handlePaste)
    }
  }, [])

  // Check if string is a valid URL
  const isValidUrl = (urlString: string): boolean => {
    try {
      const url = new URL(urlString)
      return url.protocol === "http:" || url.protocol === "https:"
    } catch (e) {
      return false
    }
  }

  // Handle drag events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)

    // Check if there are any URLs in the drag data
    if (e.dataTransfer.types.includes("text/uri-list") || e.dataTransfer.types.includes("text/plain")) {
      e.dataTransfer.dropEffect = "copy"
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Only set dragging to false if we're leaving the drop area itself
    if (e.currentTarget === dropAreaRef.current) {
      setIsDragging(false)
    }
  }

  // Handle file drop
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    // Handle dropped files
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFiles(Array.from(e.dataTransfer.files))
      return
    }

    // Handle dropped URLs
    const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain")
    if (url && isValidUrl(url)) {
      setFileUrl(url)
      setIsUrlDialogOpen(true)
    }
  }

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files))
    }
  }

  // Download file from URL
  const downloadFileFromUrl = async () => {
    if (!fileUrl || !isValidUrl(fileUrl)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL",
        variant: "destructive",
      })
      return
    }

    setIsUrlLoading(true)

    try {
      // Create a proxy URL to bypass CORS issues
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(fileUrl)}`

      // Fetch the file
      const response = await fetch(proxyUrl)

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`)
      }

      // Get file name from URL
      let fileName = fileUrl.split("/").pop() || "downloaded-file"

      // Remove query parameters from filename
      fileName = fileName.split("?")[0]

      // If filename is empty or doesn't have an extension, try to add one
      if (!fileName || fileName === "" || !fileName.includes(".")) {
        const contentType = response.headers.get("Content-Type")
        if (contentType) {
          const ext = getExtensionFromMimeType(contentType)
          if (ext) {
            fileName = `${fileName || "downloaded-file"}.${ext}`
          }
        }
      }

      // Get the blob
      const blob = await response.blob()

      // Create a File object
      const file = new File([blob], fileName, {
        type: blob.type || getMimeTypeFromExtension(fileName),
      })

      // Handle the file
      await handleFiles([file])

      // Close the dialog
      setIsUrlDialogOpen(false)
      setFileUrl("")

      toast({
        title: "Download Complete",
        description: `Successfully downloaded ${fileName}`,
      })
    } catch (error) {
      console.error("Error downloading file:", error)
      toast({
        title: "Download Failed",
        description: `Failed to download file from URL: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      })
    } finally {
      setIsUrlLoading(false)
    }
  }

  // Get extension from MIME type
  const getExtensionFromMimeType = (mimeType: string): string => {
    const mimeToExt: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "image/svg+xml": "svg",
      "application/pdf": "pdf",
      "text/plain": "txt",
      "text/html": "html",
      "application/json": "json",
      "application/zip": "zip",
      "application/x-rar-compressed": "rar",
      "audio/mpeg": "mp3",
      "video/mp4": "mp4",
    }

    return mimeToExt[mimeType] || ""
  }

  // Process files
  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return

    setPvError(null) // Clear any previous errors
    setIsUploading(true)
    setUploadProgress(0)

    const totalFiles = files.length
    let processedFiles = 0
    let failedFiles = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setCurrentFile(file.name)

      try {
        // Check if it's a PV file and handle it automatically
        if (isPVFile(file)) {
          // Try to import and decrypt the PV file
          const result = await importPVFile(file)

          if (result.success && result.file) {
            // Save the decrypted file to IndexedDB
            await saveFile({
              name: result.file.name,
              type: result.file.type,
              size: result.file.size,
              lastModified: result.file.lastModified,
              content: result.file.content as Blob,
              folderId: currentFolder ? currentFolder.id : null,
              encrypted: false, // It's already been decrypted
            })

            processedFiles++
            setUploadProgress((processedFiles / totalFiles) * 100)
          } else {
            // Handle PV import failure
            failedFiles++
            setPvError(result.error || "Failed to decrypt PV file. The seed phrase may not match.")
          }
        } else {
          // Handle regular files as before
          // Encrypt the file before saving
          const encryptedFile = await encryptFile(file)

          // Simulate chunked upload with progress
          await processFileWithProgress(file)

          // Save file to IndexedDB
          await saveFile({
            name: file.name,
            type: file.type || getMimeTypeFromExtension(file.name),
            size: file.size,
            lastModified: new Date(file.lastModified),
            content: encryptedFile,
            folderId: currentFolder ? currentFolder.id : null,
            encrypted: true,
          })

          processedFiles++
          setUploadProgress((processedFiles / totalFiles) * 100)
        }
      } catch (error) {
        console.error(`Failed to upload file ${file.name}:`, error)
        failedFiles++
        toast({
          title: "Upload Failed",
          description: `Failed to upload ${file.name}`,
          variant: "destructive",
        })
      }
    }

    // Reset state and refresh data
    setTimeout(() => {
      setIsUploading(false)
      setCurrentFile(null)
      refreshData() // This already exists, but make sure it's being called

      if (failedFiles === 0) {
        toast({
          title: "Upload Complete",
          description: `Successfully uploaded ${processedFiles} file(s)`,
        })
      } else {
        toast({
          title: "Upload Partially Complete",
          description: `Uploaded ${processedFiles} file(s), ${failedFiles} failed`,
          variant: "destructive",
        })
      }
    }, 500)
  }

  // Encrypt file using Web Crypto API
  const encryptFile = async (file: File): Promise<Blob> => {
    try {
      // Get the encryption key
      const key = await getEncryptionKey()

      // Convert file to ArrayBuffer
      const fileBuffer = await file.arrayBuffer()

      // Generate a random IV
      const iv = crypto.getRandomValues(new Uint8Array(12))

      // Encrypt the file
      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv,
        },
        key,
        fileBuffer,
      )

      // Combine IV and encrypted data
      const combinedBuffer = new Uint8Array(iv.length + encryptedBuffer.byteLength)
      combinedBuffer.set(iv, 0)
      combinedBuffer.set(new Uint8Array(encryptedBuffer), iv.length)

      // Return as Blob
      return new Blob([combinedBuffer], { type: "application/encrypted" })
    } catch (error) {
      console.error("Encryption error:", error)
      // If encryption fails, return the original file
      return file
    }
  }

  // Get or generate encryption key
  const getEncryptionKey = async (): Promise<CryptoKey> => {
    // Check if we already have a key in localStorage
    const storedKey = localStorage.getItem("encryptionKey")

    if (storedKey) {
      // Convert stored key back to CryptoKey
      const keyBuffer = Uint8Array.from(atob(storedKey), (c) => c.charCodeAt(0))
      return crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
    } else {
      // Generate a new key
      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])

      // Export the key to store it
      const exportedKey = await crypto.subtle.exportKey("raw", key)

      // Store the key in localStorage
      const keyString = btoa(String.fromCharCode(...new Uint8Array(exportedKey)))
      localStorage.setItem("encryptionKey", keyString)

      return key
    }
  }

  // Try to determine MIME type from file extension
  const getMimeTypeFromExtension = (filename: string): string => {
    const ext = filename.split(".").pop()?.toLowerCase() || ""

    const mimeTypes: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      txt: "text/plain",
      csv: "text/csv",
      html: "text/html",
      css: "text/css",
      js: "text/javascript",
      json: "application/json",
      xml: "application/xml",
      zip: "application/zip",
      rar: "application/x-rar-compressed",
      mp3: "audio/mpeg",
      mp4: "video/mp4",
      avi: "video/x-msvideo",
      mov: "video/quicktime",
      wav: "audio/wav",
    }

    return mimeTypes[ext] || "application/octet-stream"
  }

  // Simulate chunked upload with progress
  const processFileWithProgress = (file: File): Promise<void> => {
    return new Promise((resolve) => {
      const chunkSize = 1024 * 1024 // 1MB chunks
      const chunks = Math.ceil(file.size / chunkSize)
      let processedChunks = 0

      // For small files, resolve immediately
      if (file.size < chunkSize) {
        setTimeout(resolve, 300)
        return
      }

      // Simulate processing chunks
      const processChunk = () => {
        processedChunks++
        setUploadProgress((processedChunks / chunks) * 100)

        if (processedChunks >= chunks) {
          resolve()
        } else {
          setTimeout(processChunk, 100)
        }
      }

      setTimeout(processChunk, 100)
    })
  }

  // Cancel upload
  const cancelUpload = () => {
    setIsUploading(false)
    setCurrentFile(null)
    setUploadProgress(0)
    toast({
      title: "Upload Cancelled",
      description: "File upload was cancelled",
    })
  }

  return (
    <>
      <div
        ref={dropAreaRef}
        onDragOver={(e) => {
          e.preventDefault()
          const types = Array.from(e.dataTransfer.items).map((item) => item.type)
          // Accept all file types including PV files
          if (
            types.some(
              (type) =>
                type.startsWith("application/") ||
                type.startsWith("image/") ||
                type.startsWith("text/") ||
                type.startsWith("audio/") ||
                type.startsWith("video/") ||
                type === "application/x-pv-encrypted",
            )
          ) {
            setIsDragging(true)
          }
        }}
        className={`p-4 border-b border-gray-200 transition-all ${
          isDragging ? "bg-blue-50 border-blue-300 border-2 border-dashed" : "bg-white"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isUploading ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium truncate max-w-md">Uploading: {currentFile}</div>
              <Button variant="ghost" size="icon" onClick={cancelUpload} className="h-6 w-6">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Progress value={uploadProgress} className="h-2" />
            <div className="text-xs text-gray-500">{Math.round(uploadProgress)}% complete</div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h2 className="text-lg font-semibold">{currentFolder ? `Folder: ${currentFolder.name}` : "All Files"}</h2>
              <p className="text-sm text-gray-500">
                {isDragging
                  ? "Drop files or URLs here to upload"
                  : "Drag and drop files or URLs here, paste a URL, or click upload"}
              </p>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={() => setIsUrlDialogOpen(true)}>
                <LinkIcon className="mr-2 h-4 w-4" />
                URL
              </Button>
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Files
              </Button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              onChange={handleFileInputChange}
              accept="*/*" // Accept all file types
            />
          </div>
        )}
        {pvError && (
          <Alert variant="destructive" className="mt-2">
            <AlertCircle className="h-4 w-4 mr-2" />
            <AlertDescription>{pvError}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* URL Upload Dialog */}
      <Dialog open={isUrlDialogOpen} onOpenChange={setIsUrlDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload from URL</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label htmlFor="url-input" className="text-sm font-medium">
                Enter the URL of the file you want to upload:
              </label>
              <Input
                id="url-input"
                placeholder="https://example.com/file.jpg"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") downloadFileFromUrl()
                }}
              />
              <p className="text-xs text-gray-500">The file will be downloaded and stored in your local drive.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUrlDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={downloadFileFromUrl} disabled={isUrlLoading}>
              {isUrlLoading ? "Downloading..." : "Download"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* PV Import Dialog */}
      <PVImportDialog
        isOpen={isPVImportDialogOpen}
        onClose={() => setIsPVImportDialogOpen(false)}
        onComplete={refreshData}
        file={pvFileToImport}
        currentFolderId={currentFolder ? currentFolder.id : null}
      />
    </>
  )
}

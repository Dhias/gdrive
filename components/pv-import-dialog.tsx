"use client"

import { useState, useRef, type ChangeEvent, useEffect } from "react"
import { FileKey, AlertCircle, Check, Shield, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/use-toast"
import { isPVFile, importPVFile, importStreamingPVFile } from "@/lib/pv-format"
import type { FileItem } from "@/lib/types"
import { addFile } from "@/lib/db"

interface PVImportDialogProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
  currentFolderId: number | null
}

export default function PVImportDialog({ isOpen, onClose, onComplete, currentFolderId }: PVImportDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<"idle" | "importing" | "success" | "error">("idle")
  const [message, setMessage] = useState("")
  const [detailedMessage, setDetailedMessage] = useState("")
  const [importedFiles, setImportedFiles] = useState<FileItem[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const [memoryWarning, setMemoryWarning] = useState(false)
  const [sizeWarning, setSizeWarning] = useState(false)
  const [useStreaming, setUseStreaming] = useState(false)

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setStatus("idle")
      setProgress(0)
      setMessage("")
      setDetailedMessage("")
      setMemoryWarning(false)
      setSizeWarning(false)
      setUseStreaming(false)
    }
  }, [isOpen])

  // Handle file selection
  const handleSelectFiles = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  // Check file size warnings
  const checkFileWarnings = (fileSize: number) => {
    // Show warning for files larger than 100MB
    if (fileSize > 100 * 1024 * 1024) {
      setMemoryWarning(true)
    } else {
      setMemoryWarning(false)
    }

    // Show warning for files approaching 2GB
    if (fileSize > 1.8 * 1024 * 1024 * 1024) {
      setSizeWarning(true)
      setUseStreaming(true) // Automatically enable streaming for very large files
    } else {
      setSizeWarning(false)
    }
  }

  // Get browser info
  const getBrowserInfo = () => {
    const userAgent = navigator.userAgent
    let browserName = "Unknown"
    let browserVersion = ""

    if (userAgent.indexOf("Chrome") > -1) {
      browserName = "Chrome"
      const match = userAgent.match(/Chrome\/(\d+)/)
      if (match) browserVersion = match[1]
    } else if (userAgent.indexOf("Safari") > -1) {
      browserName = "Safari"
      const match = userAgent.match(/Version\/(\d+)/)
      if (match) browserVersion = match[1]
    } else if (userAgent.indexOf("Firefox") > -1) {
      browserName = "Firefox"
      const match = userAgent.match(/Firefox\/(\d+)/)
      if (match) browserVersion = match[1]
    } else if (userAgent.indexOf("Edge") > -1) {
      browserName = "Edge"
      const match = userAgent.match(/Edge\/(\d+)/)
      if (match) browserVersion = match[1]
    }

    return { name: browserName, version: browserVersion }
  }

  // Handle file input change
  const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) {
      return
    }

    setIsLoading(true)
    setStatus("importing")
    setProgress(10)
    setMessage(`Processing ${files.length} PV file(s)...`)

    let successCount = 0
    let failedCount = 0
    const newImportedFiles: FileItem[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      // Check if it's a PV file
      if (!isPVFile(file)) {
        failedCount++
        continue
      }

      // Check file size warnings
      checkFileWarnings(file.size)

      try {
        // Update progress based on file index and size
        const progressPerFile = 80 / files.length
        const fileProgress = 10 + Math.floor(i * progressPerFile)
        setProgress(fileProgress)
        setMessage(`Importing ${file.name}...`)
        setDetailedMessage(`Reading file (${(file.size / (1024 * 1024)).toFixed(2)} MB)`)

        // Create a persistent file reference to avoid permission issues
        const fileClone = new File([file], file.name, {
          type: file.type,
          lastModified: file.lastModified,
        })

        // Import the PV file with detailed progress updates
        setDetailedMessage(useStreaming ? "Streaming decryption in progress..." : "Decrypting file...")

        // Use streaming import for very large files or if streaming is enabled
        const result =
          useStreaming || file.size > 1.8 * 1024 * 1024 * 1024
            ? await importStreamingPVFile(fileClone)
            : await importPVFile(fileClone)

        if (result.success && result.file) {
          setDetailedMessage("Adding file to database...")
          // Add the file to IndexedDB
          const fileId = await addFile({
            ...result.file,
            folderId: currentFolderId,
          })

          // Add to imported files list
          newImportedFiles.push({
            ...result.file,
            id: fileId,
          })

          successCount++

          // Update progress to show completion for this file
          setProgress(fileProgress + Math.floor(progressPerFile * 0.8))
          setDetailedMessage("File imported successfully")
        } else {
          failedCount++
          console.error(`Failed to import ${file.name}:`, result.error)
          setDetailedMessage(`Error: ${result.error}`)

          // Show browser-specific recommendations
          const browser = getBrowserInfo()
          let recommendation = ""

          if (file.size > 100 * 1024 * 1024) {
            if (browser.name === "Safari") {
              recommendation = "Safari has stricter memory limits. Try using Chrome for large PV files."
            } else if (browser.name === "Firefox") {
              recommendation = "Try using a smaller file or switch to Chrome for very large files."
            } else if (browser.name === "Edge") {
              recommendation = "Try using Chrome for better compatibility with large files."
            } else {
              recommendation = "Try using a smaller file or ensure you have enough free memory."
            }

            setDetailedMessage(`Error: ${result.error}. ${recommendation}`)
          }
        }
      } catch (error) {
        console.error(`Error importing ${file.name}:`, error)
        failedCount++
        setDetailedMessage(`Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`)
      }
    }

    if (successCount > 0) {
      setProgress(100)
      setStatus("success")
      setMessage(`Successfully imported ${successCount} PV file(s)${failedCount > 0 ? `, ${failedCount} failed` : ""}`)
      setImportedFiles(newImportedFiles)

      toast({
        title: "Import Complete",
        description: `Successfully imported ${successCount} PV file(s)${failedCount > 0 ? `, ${failedCount} failed` : ""}`,
      })

      // Wait a moment before closing
      setTimeout(() => {
        onComplete()
      }, 1500)
    } else {
      setStatus("error")
      setMessage("Failed to import any PV files")

      toast({
        title: "Import Failed",
        description: "Failed to import any PV files. Make sure they were encrypted with your current seed phrase.",
        variant: "destructive",
      })
    }

    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }

    setIsLoading(false)
  }

  // Reset state and close dialog
  const handleClose = () => {
    setIsLoading(false)
    setProgress(0)
    setStatus("idle")
    setMessage("")
    setDetailedMessage("")
    setImportedFiles([])
    onClose()
  }

  // Toggle streaming mode
  const toggleStreaming = () => {
    setUseStreaming(!useStreaming)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import PV Encrypted Files</DialogTitle>
          <DialogDescription>Import files that were encrypted with your seed phrase in .pv format</DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="p-3 bg-blue-50 rounded-md flex items-start">
            <Shield className="h-5 w-5 text-blue-500 mr-2 mt-0.5" />
            <div>
              <p className="text-sm text-blue-800 font-medium">Secure PV Files</p>
              <p className="text-xs text-blue-600 mt-1">
                PV files can only be decrypted with the same seed phrase that was used to encrypt them. Files that were
                encrypted with a different seed phrase cannot be imported.
              </p>
            </div>
          </div>

          {sizeWarning && (
            <div className="p-3 bg-red-50 rounded-md flex items-start">
              <AlertCircle className="h-5 w-5 text-red-500 mr-2 mt-0.5" />
              <div>
                <p className="text-sm text-red-800 font-medium">Large File Detected</p>
                <p className="text-xs text-red-600 mt-1">
                  Files larger than 2GB require special handling. Streaming mode has been automatically enabled to
                  process this file.
                </p>
              </div>
            </div>
          )}

          {memoryWarning && !sizeWarning && (
            <div className="p-3 bg-yellow-50 rounded-md flex items-start">
              <Info className="h-5 w-5 text-yellow-500 mr-2 mt-0.5" />
              <div>
                <p className="text-sm text-yellow-800 font-medium">Large File Warning</p>
                <p className="text-xs text-yellow-600 mt-1">
                  You're importing a large file which may require significant memory. Consider enabling streaming mode
                  for better performance.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="streaming-mode"
              checked={useStreaming}
              onChange={toggleStreaming}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              disabled={sizeWarning || isLoading}
            />
            <label htmlFor="streaming-mode" className="text-sm text-gray-700">
              Use streaming mode for large files
            </label>
            <Info
              className="h-4 w-4 text-gray-400 cursor-help"
              title="Streaming mode processes files in small chunks to handle very large files more efficiently"
            />
          </div>

          {status === "importing" && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{message}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              {detailedMessage && <p className="text-xs text-gray-500">{detailedMessage}</p>}
            </div>
          )}

          {status === "success" && (
            <Alert className="bg-green-50 border-green-200 text-green-800">
              <Check className="h-4 w-4" />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          {status === "error" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{message}</AlertDescription>
              {detailedMessage && <p className="text-xs mt-2">{detailedMessage}</p>}
            </Alert>
          )}

          {currentFolderId !== null && (
            <div className="text-sm text-gray-500">Files will be imported to the current folder</div>
          )}

          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".pv,application/x-pv-encrypted"
            multiple
            onChange={handleFileInputChange}
          />
        </div>

        <DialogFooter className="flex justify-between">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            {status === "success" ? "Close" : "Cancel"}
          </Button>
          <Button onClick={handleSelectFiles} disabled={isLoading || status === "success"}>
            {isLoading ? (
              <>
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Importing...
              </>
            ) : (
              <>
                <FileKey className="mr-2 h-4 w-4" />
                Select PV Files
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

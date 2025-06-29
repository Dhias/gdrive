"use client"

import { useState, useRef, type ChangeEvent } from "react"
import { FolderOpen, Upload, HardDrive, AlertCircle, Check, X, FileKey, Filter } from "lucide-react"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import {
  importFilesFromSystem,
  importDirectoryFromSystem,
  isFileSystemAccessSupported,
  checkStoragePersistence,
  requestStoragePersistence,
  getStorageEstimate,
} from "@/lib/external-storage"
import { isPVFile, importPVFile } from "@/lib/pv-format"
import type { Folder, FileItem } from "@/lib/types"
import { addFile } from "@/lib/db"

interface ExternalStorageDialogProps {
  isOpen: boolean
  onClose: () => void
  onComplete: () => void
  currentFolder: Folder | null
}

export default function ExternalStorageDialog({
  isOpen,
  onClose,
  onComplete,
  currentFolder,
}: ExternalStorageDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<"idle" | "importing" | "success" | "error">("idle")
  const [message, setMessage] = useState("")
  const [isPersisted, setIsPersisted] = useState<boolean | null>(null)
  const [storageEstimate, setStorageEstimate] = useState<{ quota: number; usage: number; available: number } | null>(
    null,
  )
  const [importMode, setImportMode] = useState<"all" | "pv-only" | "exclude-pv">("all")
  const [importedPVFiles, setImportedPVFiles] = useState<FileItem[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // Check browser support and storage persistence on open
  const checkSupport = async () => {
    const persisted = await checkStoragePersistence()
    setIsPersisted(persisted)

    const estimate = await getStorageEstimate()
    setStorageEstimate(estimate)
  }

  // Request storage persistence
  const handleRequestPersistence = async () => {
    const result = await requestStoragePersistence()
    setIsPersisted(result)

    if (result) {
      toast({
        title: "Storage Persistence Granted",
        description: "Your browser will now preserve your storage data between sessions.",
      })
    } else {
      toast({
        title: "Storage Persistence Denied",
        description: "Your browser may clear storage data when disk space is low.",
        variant: "destructive",
      })
    }
  }

  // Import files from system
  const handleImportFiles = async () => {
    setIsLoading(true)
    setStatus("importing")
    setProgress(10)
    setMessage("Selecting files...")

    try {
      // If we're in PV-only mode, use the file input to select PV files
      if (importMode === "pv-only") {
        if (fileInputRef.current) {
          fileInputRef.current.accept = ".pv,application/x-pv-encrypted"
          fileInputRef.current.click()
        }
        return
      }

      const result = await importFilesFromSystem(
        currentFolder?.id || null,
        importMode === "exclude-pv" ? (file: File) => !isPVFile(file) : undefined,
      )

      if (result.success) {
        setProgress(100)
        setStatus("success")
        setMessage(`Successfully imported ${result.count} file(s)`)

        toast({
          title: "Import Complete",
          description: `Successfully imported ${result.count} file(s)`,
        })

        // Wait a moment before closing
        setTimeout(() => {
          onComplete()
          handleClose()
        }, 1500)
      } else {
        setStatus("error")
        setMessage(result.error || "Failed to import files")

        toast({
          title: "Import Failed",
          description: result.error || "Failed to import files",
          variant: "destructive",
        })
      }
    } catch (error) {
      setStatus("error")
      setMessage(error instanceof Error ? error.message : "Unknown error")

      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Handle file input change for PV files
  const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) {
      setIsLoading(false)
      return
    }

    setProgress(20)
    setMessage(`Processing ${files.length} PV file(s)...`)

    let successCount = 0
    let failedCount = 0
    const importedFiles: FileItem[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      try {
        // Update progress
        setProgress(20 + Math.floor((i / files.length) * 60))
        setMessage(`Importing ${file.name}...`)

        // Import the PV file
        const result = await importPVFile(file)

        if (result.success && result.file) {
          // Add the file to IndexedDB
          const fileId = await addFile({
            ...result.file,
            folderId: currentFolder?.id || null,
          })

          // Add to imported files list
          importedFiles.push({
            ...result.file,
            id: fileId,
          })

          successCount++
        } else {
          failedCount++
        }
      } catch (error) {
        console.error(`Error importing ${file.name}:`, error)
        failedCount++
      }
    }

    if (successCount > 0) {
      setProgress(100)
      setStatus("success")
      setMessage(`Successfully imported ${successCount} PV file(s)${failedCount > 0 ? `, ${failedCount} failed` : ""}`)
      setImportedPVFiles(importedFiles)

      toast({
        title: "Import Complete",
        description: `Successfully imported ${successCount} PV file(s)${failedCount > 0 ? `, ${failedCount} failed` : ""}`,
      })

      // Wait a moment before closing
      setTimeout(() => {
        onComplete()
        handleClose()
      }, 1500)
    } else {
      setStatus("error")
      setMessage("Failed to import any PV files")

      toast({
        title: "Import Failed",
        description: "Failed to import any PV files",
        variant: "destructive",
      })
    }

    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }

    setIsLoading(false)
  }

  // Import directory from system
  const handleImportDirectory = async () => {
    setIsLoading(true)
    setStatus("importing")
    setProgress(10)
    setMessage("Selecting directory...")

    try {
      const result = await importDirectoryFromSystem(
        currentFolder?.id || null,
        importMode === "exclude-pv" ? (file: File) => !isPVFile(file) : undefined,
      )

      if (result.success) {
        setProgress(100)
        setStatus("success")
        setMessage(`Successfully imported directory with ${result.count} file(s)`)

        toast({
          title: "Import Complete",
          description: `Successfully imported directory with ${result.count} file(s)`,
        })

        // Wait a moment before closing
        setTimeout(() => {
          onComplete()
          handleClose()
        }, 1500)
      } else {
        setStatus("error")
        setMessage(result.error || "Failed to import directory")

        toast({
          title: "Import Failed",
          description: result.error || "Failed to import directory",
          variant: "destructive",
        })
      }
    } catch (error) {
      setStatus("error")
      setMessage(error instanceof Error ? error.message : "Unknown error")

      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Reset state and close dialog
  const handleClose = () => {
    setIsLoading(false)
    setProgress(0)
    setStatus("idle")
    setMessage("")
    setImportedPVFiles([])
    onClose()
  }

  // Format bytes to human-readable format
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose} onOpenAutoFocus={checkSupport}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>External Storage Integration</DialogTitle>
          <DialogDescription>Import files and folders from your device's file system</DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {!isFileSystemAccessSupported() && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Your browser doesn't support the File System Access API. Some features may be limited.
              </AlertDescription>
            </Alert>
          )}

          {isPersisted !== null && (
            <div className="flex items-center justify-between bg-gray-100 p-3 rounded-md">
              <div className="flex items-center">
                <HardDrive className="h-5 w-5 mr-2 text-gray-600" />
                <span className="text-sm">Storage Persistence:</span>
              </div>
              <div className="flex items-center">
                {isPersisted ? (
                  <span className="text-sm text-green-600 flex items-center">
                    <Check className="h-4 w-4 mr-1" /> Enabled
                  </span>
                ) : (
                  <>
                    <span className="text-sm text-amber-600 flex items-center mr-2">
                      <X className="h-4 w-4 mr-1" /> Disabled
                    </span>
                    <Button size="sm" variant="outline" onClick={handleRequestPersistence}>
                      Enable
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {storageEstimate && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Storage Usage</div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>Used: {formatBytes(storageEstimate.usage)}</span>
                  <span>Available: {formatBytes(storageEstimate.available)}</span>
                </div>
                <Progress value={(storageEstimate.usage / storageEstimate.quota) * 100} className="h-2" />
              </div>
            </div>
          )}

          <Tabs defaultValue="all" onValueChange={(value) => setImportMode(value as "all" | "pv-only" | "exclude-pv")}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">All Files</TabsTrigger>
              <TabsTrigger value="pv-only">PV Files Only</TabsTrigger>
              <TabsTrigger value="exclude-pv">Exclude PV Files</TabsTrigger>
            </TabsList>
            <TabsContent value="all">
              <div className="p-2 bg-gray-50 rounded-md">
                <p className="text-sm text-gray-600">Import all files, including PV encrypted files.</p>
              </div>
            </TabsContent>
            <TabsContent value="pv-only">
              <div className="p-2 bg-blue-50 rounded-md flex items-start">
                <FileKey className="h-5 w-5 text-blue-500 mr-2 mt-0.5" />
                <div>
                  <p className="text-sm text-blue-800 font-medium">PV Encrypted Files Only</p>
                  <p className="text-xs text-blue-600 mt-1">
                    Only import .pv files that were encrypted with your seed phrase.
                  </p>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="exclude-pv">
              <div className="p-2 bg-gray-50 rounded-md flex items-start">
                <Filter className="h-5 w-5 text-gray-500 mr-2 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-800 font-medium">Exclude PV Files</p>
                  <p className="text-xs text-gray-600 mt-1">Import all files except .pv encrypted files.</p>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {status === "importing" && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{message}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
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
            </Alert>
          )}

          {currentFolder && (
            <div className="text-sm text-gray-500">
              Importing to folder: <span className="font-medium">{currentFolder.name}</span>
            </div>
          )}

          {/* Hidden file input for PV files */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".pv,application/x-pv-encrypted"
            multiple
            onChange={handleFileInputChange}
          />
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={handleImportFiles}
              disabled={isLoading || status === "success"}
              className="flex-1"
            >
              <Upload className="mr-2 h-4 w-4" />
              Import Files
            </Button>
            <Button
              variant="outline"
              onClick={handleImportDirectory}
              disabled={isLoading || status === "success" || !isFileSystemAccessSupported() || importMode === "pv-only"}
              className="flex-1"
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              Import Folder
            </Button>
          </div>
          <Button variant="ghost" onClick={handleClose} disabled={isLoading}>
            {status === "success" ? "Close" : "Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

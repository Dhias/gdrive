"use client"

import { useState, useEffect } from "react"
import { Folder, FolderPlus, HardDrive, Check, AlertCircle, Trash2, RefreshCw, FileKey, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import type { FileItem } from "@/lib/types"
import {
  isFileSystemAccessSupported,
  exportFilesToExternalFolder,
  exportFilesToSpecificFolder,
  saveFolderHandle,
  getSavedFolderHandles,
  verifyFolderPermission,
} from "@/lib/external-export"

interface ExternalFolderDialogProps {
  isOpen: boolean
  onClose: () => void
  selectedFiles: FileItem[]
}

interface SavedFolder {
  handle: FileSystemDirectoryHandle
  name: string
  addedAt: Date
  hasPermission?: boolean
}

export default function ExternalFolderDialog({ isOpen, onClose, selectedFiles }: ExternalFolderDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [savedFolders, setSavedFolders] = useState<SavedFolder[]>([])
  const [newFolderName, setNewFolderName] = useState("")
  const [isAddingFolder, setIsAddingFolder] = useState(false)
  const [exportStatus, setExportStatus] = useState<{ success: number; failed: number } | null>(null)
  const [exportMode, setExportMode] = useState<"normal" | "pv">("normal")
  const { toast } = useToast()

  // Load saved folders when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadSavedFolders()
    }
  }, [isOpen])

  const loadSavedFolders = async () => {
    if (!isFileSystemAccessSupported()) return

    try {
      const handles = await getSavedFolderHandles()

      // Check permissions for each folder
      const foldersWithPermissions = await Promise.all(
        handles.map(async (folder) => {
          const hasPermission = await verifyFolderPermission(folder.handle)
          return { ...folder, hasPermission }
        }),
      )

      setSavedFolders(foldersWithPermissions)
    } catch (error) {
      console.error("Error loading saved folders:", error)
    }
  }

  const handleAddFolder = async () => {
    if (!isFileSystemAccessSupported()) {
      toast({
        title: "Not Supported",
        description: "Your browser doesn't support the File System Access API",
        variant: "destructive",
      })
      return
    }

    setIsAddingFolder(true)

    try {
      // Use File System Access API to select a directory
      const dirHandle = await window.showDirectoryPicker()

      // Generate a default name if none provided
      const folderName = newFolderName.trim() || dirHandle.name

      // Save the folder handle
      await saveFolderHandle(dirHandle, folderName)

      // Refresh the list
      await loadSavedFolders()

      setNewFolderName("")

      toast({
        title: "Folder Added",
        description: `Folder "${folderName}" has been added to your external folders`,
      })
    } catch (error) {
      console.error("Error adding folder:", error)

      // Don't show error for user cancellation
      if (error instanceof Error && error.name !== "AbortError") {
        toast({
          title: "Error",
          description: "Failed to add folder",
          variant: "destructive",
        })
      }
    } finally {
      setIsAddingFolder(false)
    }
  }

  const handleExportToFolder = async (folder: SavedFolder) => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select files to export",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    setExportStatus(null)

    try {
      // Verify we still have permission
      const hasPermission = await verifyFolderPermission(folder.handle)

      if (!hasPermission) {
        toast({
          title: "Permission Denied",
          description: `You no longer have permission to access "${folder.name}"`,
          variant: "destructive",
        })

        // Update the folder's permission status
        setSavedFolders((prev) => prev.map((f) => (f.name === folder.name ? { ...f, hasPermission: false } : f)))

        setIsLoading(false)
        return
      }

      // Export the files
      const result = await exportFilesToSpecificFolder(selectedFiles, folder.handle, exportMode === "pv")
      setExportStatus(result)

      if (result.success > 0) {
        toast({
          title: "Export Complete",
          description: `Successfully exported ${result.success} file(s) to "${folder.name}"${
            result.failed > 0 ? `, ${result.failed} failed` : ""
          }${exportMode === "pv" ? " as PV encrypted files" : ""}`,
        })
      } else {
        toast({
          title: "Export Failed",
          description: "Failed to export any files",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error exporting to folder:", error)
      toast({
        title: "Export Error",
        description: "An error occurred while exporting files",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportToNewFolder = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select files to export",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    setExportStatus(null)

    try {
      const result = await exportFilesToExternalFolder(selectedFiles, exportMode === "pv")
      setExportStatus(result)

      if (result.success > 0) {
        toast({
          title: "Export Complete",
          description: `Successfully exported ${result.success} file(s)${
            result.failed > 0 ? `, ${result.failed} failed` : ""
          }${exportMode === "pv" ? " as PV encrypted files" : ""}`,
        })
      } else {
        toast({
          title: "Export Failed",
          description: "Failed to export any files",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error exporting to new folder:", error)
      toast({
        title: "Export Error",
        description: "An error occurred while exporting files",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemoveFolder = async (folder: SavedFolder) => {
    try {
      // Open the database
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("ExternalFolderHandlesDB", 1)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })

      // Delete the folder handle
      const transaction = db.transaction(["folderHandles"], "readwrite")
      const store = transaction.objectStore("folderHandles")

      await new Promise<void>((resolve, reject) => {
        const request = store.delete(folder.name)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })

      db.close()

      // Update the UI
      setSavedFolders((prev) => prev.filter((f) => f.name !== folder.name))

      toast({
        title: "Folder Removed",
        description: `Folder "${folder.name}" has been removed from your external folders`,
      })
    } catch (error) {
      console.error("Error removing folder:", error)
      toast({
        title: "Error",
        description: "Failed to remove folder",
        variant: "destructive",
      })
    }
  }

  // Format date
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export to External Folder</DialogTitle>
          <DialogDescription>
            Export {selectedFiles.length} selected file(s) to an external folder on your device
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {!isFileSystemAccessSupported() && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Your browser doesn't support the File System Access API. Please use a modern browser like Chrome, Edge,
                or Opera.
              </AlertDescription>
            </Alert>
          )}

          {exportStatus && (
            <Alert
              variant={exportStatus.failed > 0 ? "destructive" : "default"}
              className={exportStatus.failed > 0 ? "" : "bg-green-50 border-green-200 text-green-800"}
            >
              <AlertDescription>
                {exportStatus.success > 0 && `Successfully exported ${exportStatus.success} file(s). `}
                {exportStatus.failed > 0 && `Failed to export ${exportStatus.failed} file(s).`}
              </AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="normal" onValueChange={(value) => setExportMode(value as "normal" | "pv")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="normal">Normal Export</TabsTrigger>
              <TabsTrigger value="pv">PV Encrypted Export</TabsTrigger>
            </TabsList>
            <TabsContent value="normal">
              <div className="p-2 bg-gray-50 rounded-md mb-4">
                <p className="text-sm text-gray-600">Export files in their original format to an external folder.</p>
              </div>
            </TabsContent>
            <TabsContent value="pv">
              <div className="p-2 bg-blue-50 rounded-md mb-4 flex items-start">
                <Shield className="h-5 w-5 text-blue-500 mr-2 mt-0.5" />
                <div>
                  <p className="text-sm text-blue-800 font-medium">PV Encrypted Export</p>
                  <p className="text-xs text-blue-600 mt-1">
                    Files will be encrypted with your seed phrase and saved with the .pv extension. Only someone with
                    your seed phrase can decrypt these files.
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {isFileSystemAccessSupported() && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium">Saved Folders</h3>
                  <Button variant="ghost" size="sm" onClick={loadSavedFolders}>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Refresh
                  </Button>
                </div>

                {savedFolders.length > 0 ? (
                  <ScrollArea className="h-[200px] border rounded-md p-2">
                    <div className="space-y-2">
                      {savedFolders.map((folder) => (
                        <div
                          key={folder.name}
                          className="flex items-center justify-between p-2 border rounded-md hover:bg-gray-50"
                        >
                          <div className="flex items-center">
                            <Folder className="h-4 w-4 mr-2 text-blue-500" />
                            <div>
                              <div className="font-medium">{folder.name}</div>
                              <div className="text-xs text-gray-500">Added {formatDate(folder.addedAt)}</div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleExportToFolder(folder)}
                              disabled={isLoading || !folder.hasPermission}
                            >
                              {exportMode === "pv" ? (
                                <>
                                  <FileKey className="h-3 w-3 mr-1" />
                                  Export PV
                                </>
                              ) : (
                                "Export"
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveFolder(folder)}
                              disabled={isLoading}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="border rounded-md p-4 text-center text-gray-500">
                    <HardDrive className="h-8 w-8 mx-auto mb-2" />
                    <p>No saved folders yet</p>
                    <p className="text-xs">Add a folder to quickly export files</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Add New Folder</h3>
                <div className="flex space-x-2">
                  <Input
                    placeholder="Folder name (optional)"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    disabled={isAddingFolder}
                  />
                  <Button onClick={handleAddFolder} disabled={isAddingFolder}>
                    {isAddingFolder ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                        Adding...
                      </>
                    ) : (
                      <>
                        <FolderPlus className="h-4 w-4 mr-2" />
                        Add
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-gray-500">You'll be prompted to select a folder on your device</p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleExportToNewFolder}
            disabled={isLoading || !isFileSystemAccessSupported() || selectedFiles.length === 0}
          >
            {isLoading ? (
              <>
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Exporting...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                {exportMode === "pv" ? "Export as PV to New Folder" : "Export to New Folder"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import type React from "react"

import { useEffect, useState } from "react"
import {
  File,
  FileText,
  ImageIcon,
  MoreVertical,
  Download,
  Trash2,
  Edit,
  FolderOpen,
  FolderInput,
  Grid,
  List,
  CheckSquare,
  Square,
  X,
  Share2,
  RefreshCw,
  Video,
  Music,
  HardDrive,
  FileKey,
  ArrowUpDown,
} from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import type { FileItem, Folder } from "@/lib/types"
import { getFiles, getAllFiles, deleteFile, updateFileName, getFileContent, moveFile, getFolders } from "@/lib/db"
import { useToast } from "@/hooks/use-toast"
import FilePreview from "@/components/file-preview"
import ShareDialog from "@/components/share-dialog"
import type { CategoryType } from "@/components/sidebar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import ExternalFolderDialog from "@/components/external-folder-dialog"
// Add import for PV format utilities
import { exportFileToPV } from "@/lib/pv-format"
import PVImportDialog from "@/components/pv-import-dialog"
// Add PVFileViewer import at the top with other imports
import PVFileViewer from "@/components/pv-file-viewer"

// Define the ViewMode type
type ViewMode = "grid" | "list"

// Update the FileGalleryProps interface to include the new props
interface FileGalleryProps {
  currentFolder: Folder | null
  currentCategory: CategoryType
  searchQuery: string
  refreshTrigger: number
  refreshData: () => void
  onExternalFolderExport?: () => void
  showPVFolder?: boolean
  setShowPVFolder?: (show: boolean) => void
  onPVFilesCountChange?: (count: number) => void
}

// Update the component parameters to include the new props with defaults
export default function FileGallery({
  currentFolder,
  currentCategory,
  searchQuery,
  refreshTrigger,
  refreshData,
  onExternalFolderExport = () => {},
  showPVFolder = false,
  setShowPVFolder = () => {},
  onPVFilesCountChange = () => {},
}: FileGalleryProps) {
  const [files, setFiles] = useState<FileItem[]>([])
  const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null)
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)
  const [fileToShare, setFileToShare] = useState<FileItem | null>(null)
  const [newFileName, setNewFileName] = useState("")
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewContent, setPreviewContent] = useState<Blob | null>(null)
  const [folders, setFolders] = useState<Folder[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set())
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [thumbnailCache, setThumbnailCache] = useState<Map<number, string>>(new Map())
  const { toast } = useToast()
  const [isExternalFolderDialogOpen, setIsExternalFolderDialogOpen] = useState(false)
  // Add state for PV import dialog
  const [isPVImportDialogOpen, setIsPVImportDialogOpen] = useState(false)
  // Add these new state variables inside the FileGallery component
  const [isPVFileViewerOpen, setIsPVFileViewerOpen] = useState(false)
  const [selectedPVFile, setSelectedPVFile] = useState<FileItem | null>(null)
  const [isPVFilePreview, setIsPVFilePreview] = useState(false)
  const [pvFiles, setPVFiles] = useState<FileItem[]>([])
  // Add these state variables inside the FileGallery component
  const [sortBy, setSortBy] = useState<"name" | "size" | "date">("name")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")

  // Load files when folder changes, category changes, or refresh is triggered
  useEffect(() => {
    loadFiles()
  }, [currentFolder, currentCategory, refreshTrigger])

  // Load folders for move dialog
  useEffect(() => {
    const loadFolderList = async () => {
      try {
        const folderList = await getFolders()
        setFolders(folderList)
      } catch (error) {
        console.error("Failed to load folders:", error)
      }
    }

    loadFolderList()
  }, [])

  // Filter files when search query changes
  useEffect(() => {
    filterFiles()
  }, [searchQuery, files, currentCategory, sortBy, sortOrder])

  // Clean up thumbnail cache when component unmounts
  useEffect(() => {
    return () => {
      // Revoke all object URLs to prevent memory leaks
      thumbnailCache.forEach((url) => {
        URL.revokeObjectURL(url)
      })
    }
  }, [])

  // Add this useEffect to detect PV files when files are loaded
  useEffect(() => {
    // Detect PV files in the loaded files
    const detectedPVFiles = files.filter(
      (file) => file.name.toLowerCase().endsWith(".pv") || file.type === "application/x-pv-encrypted",
    )
    setPVFiles(detectedPVFiles)

    // Update the PV files count
    onPVFilesCountChange(detectedPVFiles.length)

    // If showPVFolder is true from props, keep it that way
    if (!showPVFolder && detectedPVFiles.length > 0 && currentFolder === null && currentCategory === null) {
      setShowPVFolder(true)
    }
  }, [files, currentFolder, currentCategory, onPVFilesCountChange, showPVFolder])

  const loadFiles = async () => {
    setIsLoading(true)
    try {
      let fileList: FileItem[] = []

      if (currentCategory === "all") {
        // If viewing "All Files", get all files regardless of folder
        fileList = await getAllFiles()
      } else if (currentCategory === null && currentFolder !== null) {
        // If viewing a specific folder
        fileList = await getFiles(currentFolder.id)
      } else if (currentCategory === null && currentFolder === null) {
        // If viewing "All Files" (root level)
        fileList = await getAllFiles()
      } else {
        // If viewing a category, get all files and filter by type
        fileList = await getAllFiles()
      }

      setFiles(fileList)

      // Reset selection when loading new files
      setSelectedFiles(new Set())
      setIsSelectionMode(false)

      // Pre-generate thumbnails for image files
      fileList.forEach(async (file) => {
        if (file.type.startsWith("image/")) {
          await generateThumbnail(file)
        }
      })
    } catch (error) {
      console.error("Failed to load files:", error)
      toast({
        title: "Error",
        description: "Failed to load files",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Generate and cache thumbnails for image files
  const generateThumbnail = async (file: FileItem): Promise<string> => {
    // Check if we already have a cached thumbnail
    if (thumbnailCache.has(file.id)) {
      return thumbnailCache.get(file.id)!
    }

    try {
      // Get file content
      const content = await getFileContent(file.id)

      // Decrypt if needed
      let decryptedContent: Blob
      if (file.encrypted) {
        decryptedContent = await decryptFile(content)
      } else {
        decryptedContent = content
      }

      // Create object URL
      const objectUrl = URL.createObjectURL(decryptedContent)

      // Cache the URL
      setThumbnailCache((prev) => new Map(prev).set(file.id, objectUrl))

      return objectUrl
    } catch (error) {
      console.error("Failed to generate thumbnail:", error)
      return "/placeholder.svg"
    }
  }

  // Add this function to handle PV file preview
  const handlePVFilePreview = (file: FileItem) => {
    setSelectedPVFile(file)
    setIsPVFilePreview(true)
  }

  // Add this function to handle viewing the original file from a PV file
  const handleViewOriginalFile = (originalFile: FileItem) => {
    setIsPVFileViewerOpen(false)
    setPreviewContent(originalFile.content as Blob)
    setSelectedFile(originalFile)
    setIsPreviewOpen(true)
  }

  // Filter files based on search query and category
  // Modify the handlePreviewFile function to handle PV files
  const handlePreviewFile = async (file: FileItem) => {
    if (isSelectionMode) {
      toggleFileSelection(file.id)
      return
    }

    if (file.externalSource) {
      await handleExternalFileOperation(file, "open")
      return
    }

    // Check if it's a PV file
    if (file.name.toLowerCase().endsWith(".pv") || file.type === "application/x-pv-encrypted") {
      setSelectedPVFile(file)
      setIsPVFileViewerOpen(true)
      return
    }

    try {
      const content = await getFileContent(file.id)
      setPreviewContent(content)
      setSelectedFile(file)
      setIsPreviewOpen(true)
    } catch (error) {
      console.error("Failed to load file content:", error)
      toast({
        title: "Error",
        description: "Failed to load file preview",
        variant: "destructive",
      })
    }
  }

  // Modify the filterFiles function to include sorting
  const filterFiles = () => {
    let filtered = [...files]

    // If showing PV folder, only show PV files
    if (showPVFolder) {
      filtered = filtered.filter(
        (file) => file.name.toLowerCase().endsWith(".pv") || file.type === "application/x-pv-encrypted",
      )
    }
    // Apply category filter
    else if (currentCategory === "images") {
      filtered = filtered.filter((file) => file.type.startsWith("image/"))
    } else if (currentCategory === "videos") {
      filtered = filtered.filter((file) => file.type.startsWith("video/"))
    } else if (currentCategory === "audio") {
      filtered = filtered.filter((file) => file.type.startsWith("audio/"))
    } else if (currentCategory === "documents") {
      filtered = filtered.filter(
        (file) =>
          file.type === "application/pdf" ||
          file.type.includes("document") ||
          file.type.includes("text/") ||
          file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          file.type === "application/msword" ||
          file.type === "application/vnd.ms-excel" ||
          file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
    } else if (currentCategory === "other") {
      filtered = filtered.filter(
        (file) =>
          !file.type.startsWith("image/") &&
          !file.type.startsWith("video/") &&
          !file.type.startsWith("audio/") &&
          !file.type.includes("document") &&
          !file.type.includes("text/") &&
          file.type !== "application/pdf" &&
          file.type !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
          file.type !== "application/msword" &&
          file.type !== "application/vnd.ms-excel" &&
          file.type !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
    }

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter((file) => file.name.toLowerCase().includes(searchQuery.toLowerCase()))
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === "name") {
        return sortOrder === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      } else if (sortBy === "size") {
        return sortOrder === "asc" ? a.size - b.size : b.size - a.size
      } else if (sortBy === "date") {
        return sortOrder === "asc"
          ? a.lastModified.getTime() - b.lastModified.getTime()
          : b.lastModified.getTime() - a.lastModified.getTime()
      }
      return 0
    })

    setFilteredFiles(filtered)
  }

  // Toggle selection mode
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode)
    setSelectedFiles(new Set())
  }

  // Toggle file selection
  const toggleFileSelection = (fileId: number, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
    }

    const newSelection = new Set(selectedFiles)
    if (newSelection.has(fileId)) {
      newSelection.delete(fileId)
    } else {
      newSelection.add(fileId)
    }
    setSelectedFiles(newSelection)
  }

  // Select all files
  const selectAllFiles = () => {
    const allFileIds = filteredFiles.map((file) => file.id)
    setSelectedFiles(new Set(allFileIds))
  }

  // Deselect all files
  const deselectAllFiles = () => {
    setSelectedFiles(new Set())
  }

  // Handle bulk delete
  const handleBulkDelete = () => {
    if (selectedFiles.size === 0) return
    setIsDeleteConfirmOpen(true)
  }

  // Confirm and execute bulk delete
  const confirmBulkDelete = async () => {
    try {
      const deletePromises = Array.from(selectedFiles).map((fileId) => deleteFile(fileId))
      await Promise.all(deletePromises)

      toast({
        title: "Success",
        description: `Deleted ${selectedFiles.size} file(s)`,
      })

      setIsDeleteConfirmOpen(false)
      setSelectedFiles(new Set())
      setIsSelectionMode(false)
      loadFiles()
      refreshData()
    } catch (error) {
      console.error("Failed to delete files:", error)
      toast({
        title: "Error",
        description: "Failed to delete some files",
        variant: "destructive",
      })
    }
  }

  // Handle single file deletion
  const handleDeleteFile = async (file: FileItem) => {
    if (confirm(`Are you sure you want to delete ${file.name}?`)) {
      try {
        await deleteFile(file.id)
        loadFiles()
        refreshData()

        toast({
          title: "Success",
          description: `File ${file.name} deleted`,
        })
      } catch (error) {
        console.error("Failed to delete file:", error)
        toast({
          title: "Error",
          description: "Failed to delete file",
          variant: "destructive",
        })
      }
    }
  }

  // Handle file rename
  const handleRenameFile = (file: FileItem) => {
    setSelectedFile(file)
    setNewFileName(file.name)
    setIsRenameDialogOpen(true)
  }

  const saveNewFileName = async () => {
    if (!selectedFile || !newFileName.trim()) {
      toast({
        title: "Error",
        description: "File name cannot be empty",
        variant: "destructive",
      })
      return
    }

    try {
      await updateFileName(selectedFile.id, newFileName)
      setIsRenameDialogOpen(false)
      loadFiles()

      toast({
        title: "Success",
        description: "File renamed successfully",
      })
    } catch (error) {
      console.error("Failed to rename file:", error)
      toast({
        title: "Error",
        description: "Failed to rename file",
        variant: "destructive",
      })
    }
  }

  // Handle file share
  const handleShareFile = (file: FileItem) => {
    setFileToShare(file)
    setIsShareDialogOpen(true)
  }

  // Handle file move
  const handleMoveFile = async (file: FileItem) => {
    setSelectedFile(file)

    // Refresh folders list before opening the dialog
    try {
      const folderList = await getFolders()
      setFolders(folderList)
    } catch (error) {
      console.error("Failed to load folders:", error)
      toast({
        title: "Error",
        description: "Failed to load folders",
        variant: "destructive",
      })
    }

    setSelectedFolderId(file.folderId ? String(file.folderId) : null)
    setIsMoveDialogOpen(true)
  }

  const saveFileMove = async () => {
    if (!selectedFile) return

    try {
      const targetFolderId = selectedFolderId ? Number.parseInt(selectedFolderId) : null
      await moveFile(selectedFile.id, targetFolderId)
      setIsMoveDialogOpen(false)
      loadFiles()
      refreshData()

      toast({
        title: "Success",
        description: "File moved successfully",
      })
    } catch (error) {
      console.error("Failed to move file:", error)
      toast({
        title: "Error",
        description: "Failed to move file",
        variant: "destructive",
      })
    }
  }

  // Handle external file operations
  const handleExternalFileOperation = async (file: FileItem, operation: "open" | "download") => {
    if (!file.externalSource) {
      // Not an external file, handle normally
      if (operation === "open") {
        handlePreviewFile(file)
      } else {
        handleDownloadFile(file)
      }
      return
    }

    try {
      // Get file content
      const content = await getFileContent(file.id)

      // Decrypt if needed
      let decryptedContent: Blob
      if (file.encrypted) {
        decryptedContent = await decryptFile(content)
      } else {
        decryptedContent = content
      }

      if (operation === "open") {
        // For opening, we'll still use the preview
        setPreviewContent(content)
        setSelectedFile(file)
        setIsPreviewOpen(true)
      } else {
        // For download, use the exportFileToSystem function
        const { exportFileToSystem } = await import("@/lib/external-storage")
        const success = await exportFileToSystem(file.id, file.name, decryptedContent)

        if (success) {
          toast({
            title: "File Exported",
            description: `${file.name} has been exported to your file system`,
          })
        } else {
          toast({
            title: "Export Failed",
            description: "Failed to export file to your file system",
            variant: "destructive",
          })
        }
      }
    } catch (error) {
      console.error("Failed to handle external file:", error)
      toast({
        title: "Error",
        description: "Failed to access external file",
        variant: "destructive",
      })
    }
  }

  // Handle file preview
  // Modify the getViewTitle function to handle the PV folder view
  const getViewTitle = () => {
    if (showPVFolder) return "PV Encrypted Files"
    if (currentCategory === "images") return "Images"
    if (currentCategory === "videos") return "Videos"
    if (currentCategory === "audio") return "Audio"
    if (currentCategory === "documents") return "Documents"
    if (currentCategory === "other") return "Other Files"
    if (currentCategory === "all" || (currentCategory === null && currentFolder === null)) return "All Files"
    if (currentFolder) return currentFolder.name
    return "All Files"
  }

  // Handle file download
  const handleDownloadFile = async (file: FileItem) => {
    if (file.externalSource) {
      await handleExternalFileOperation(file, "download")
      return
    }

    try {
      const encryptedContent = await getFileContent(file.id)

      // Decrypt the file if it's encrypted
      let content = encryptedContent
      if (file.encrypted) {
        content = await decryptFile(encryptedContent)
      }

      // Create download link
      const url = URL.createObjectURL(content)
      const a = document.createElement("a")
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()

      // Clean up
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 100)
    } catch (error) {
      console.error("Failed to download file:", error)
      toast({
        title: "Error",
        description: "Failed to download file",
        variant: "destructive",
      })
    }
  }

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
      return new Blob([decryptedBuffer], { type: selectedFile?.type || "application/octet-stream" })
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

  // Get file icon based on type
  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith("image/")) {
      return <ImageIcon className="h-6 w-6 text-purple-500" />
    } else if (fileType.startsWith("video/")) {
      return <Video className="h-6 w-6 text-blue-500" />
    } else if (fileType.startsWith("audio/")) {
      return <Music className="h-6 w-6 text-green-500" />
    } else if (
      fileType === "application/pdf" ||
      fileType.includes("document") ||
      fileType.includes("text/") ||
      fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || // docx
      fileType === "application/msword" || // doc
      fileType === "application/vnd.ms-excel" || // xls
      fileType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" // xlsx
    ) {
      return <FileText className="h-6 w-6 text-orange-500" />
    } else {
      return <File className="h-6 w-6 text-gray-500" />
    }
  }

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  // Format date
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date)
  }

  // Format date

  // Add this useEffect to respond to changes in the showPVFolder prop
  useEffect(() => {
    if (showPVFolder) {
      filterFiles()
    }
  }, [showPVFolder])

  // Render file item in grid view
  const renderGridItem = (file: FileItem) => (
    <div
      key={file.id}
      className={`border rounded-lg overflow-hidden hover:shadow-md transition-shadow group ${
        selectedFiles.has(file.id) ? "border-blue-500 bg-blue-50" : "border-gray-200"
      }`}
      onClick={() => handlePreviewFile(file)}
    >
      <div className="relative">
        {isSelectionMode && (
          <div className="absolute top-2 left-2 z-10" onClick={(e) => toggleFileSelection(file.id, e)}>
            {selectedFiles.has(file.id) ? (
              <CheckSquare className="h-6 w-6 text-blue-500 bg-white rounded" />
            ) : (
              <Square className="h-6 w-6 text-gray-400 bg-white bg-opacity-70 rounded" />
            )}
          </div>
        )}

        <div className="h-32 bg-gray-100 flex items-center justify-center cursor-pointer">
          {file.type.startsWith("image/") ? (
            <div className="w-full h-full">
              <img
                src={thumbnailCache.get(file.id) || "/placeholder.svg"}
                alt={file.name}
                className="w-full h-full object-contain"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).src = "/placeholder.svg"
                }}
              />
            </div>
          ) : (
            <div className="text-4xl">{getFileIcon(file.type)}</div>
          )}
        </div>
      </div>

      <div className="p-3">
        <div className="flex items-start justify-between">
          <div className="truncate mr-2">
            <div className="font-medium truncate" title={file.name}>
              {file.name}
              {file.encrypted && <span className="ml-1 text-xs text-green-600">🔒</span>}
            </div>
            <div className="text-xs text-gray-500">
              {formatFileSize(file.size)} • {formatDate(file.lastModified)}
            </div>
          </div>

          {!isSelectionMode && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    handlePreviewFile(file)
                  }}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Preview
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    handleShareFile(file)
                  }}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDownloadFile(file)
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    handleExportFileToExternalFolder(file)
                  }}
                >
                  <HardDrive className="mr-2 h-4 w-4" />
                  Export to Folder
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRenameFile(file)
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMoveFile(file)
                  }}
                >
                  <FolderInput className="mr-2 h-4 w-4" />
                  Move to Folder
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteFile(file)
                  }}
                  className="text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    handleExportToPV(file)
                  }}
                >
                  <FileKey className="mr-2 h-4 w-4" />
                  Export as PV File
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  )

  // Render file item in list view
  const renderListItem = (file: FileItem) => (
    <div
      key={file.id}
      className={`border rounded-lg p-3 hover:shadow-md transition-shadow group flex items-center ${
        selectedFiles.has(file.id) ? "border-blue-500 bg-blue-50" : "border-gray-200"
      }`}
      onClick={() => handlePreviewFile(file)}
    >
      {isSelectionMode && (
        <div className="flex-shrink-0 mr-2" onClick={(e) => toggleFileSelection(file.id, e)}>
          {selectedFiles.has(file.id) ? (
            <CheckSquare className="h-5 w-5 text-blue-500" />
          ) : (
            <Square className="h-5 w-5 text-gray-400" />
          )}
        </div>
      )}

      <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center mr-3">
        {file.type.startsWith("image/") ? (
          <div className="w-10 h-10 rounded overflow-hidden">
            <img
              src={thumbnailCache.get(file.id) || "/placeholder.svg"}
              alt={file.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                ;(e.target as HTMLImageElement).src = "/placeholder.svg"
              }}
            />
          </div>
        ) : (
          <div>{getFileIcon(file.type)}</div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-medium truncate" title={file.name}>
          {file.name}
          {file.encrypted && <span className="ml-1 text-xs text-green-600">🔒</span>}
        </div>
        <div className="text-xs text-gray-500">
          {formatFileSize(file.size)} • {formatDate(file.lastModified)}
        </div>
      </div>

      {!isSelectionMode && (
        <div className="flex items-center space-x-2 ml-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation()
              handlePreviewFile(file)
            }}
          >
            <FileText className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation()
              handleShareFile(file)
            }}
          >
            <Share2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation()
              handleDownloadFile(file)
            }}
          >
            <Download className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleExportFileToExternalFolder(file)
                }}
              >
                <HardDrive className="mr-2 h-4 w-4" />
                Export to Folder
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleRenameFile(file)
                }}
              >
                <Edit className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleMoveFile(file)
                }}
              >
                <FolderInput className="mr-2 h-4 w-4" />
                Move to Folder
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteFile(file)
                }}
                className="text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  handleExportToPV(file)
                }}
              >
                <FileKey className="mr-2 h-4 w-4" />
                Export as PV File
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )

  const handleManualRefresh = () => {
    setIsLoading(true)
    loadFiles()
    refreshData()
    toast({
      title: "Refreshed",
      description: "Files and folders have been refreshed",
    })
  }

  const handleExportToExternalFolder = () => {
    if (selectedFiles.size === 0) {
      // If no files are selected, use the prop to open the dialog from the parent
      onExternalFolderExport()
      return
    }

    // Get the selected files
    const filesToExport = filteredFiles.filter((file) => selectedFiles.has(file.id))

    // Open the external folder dialog
    setIsExternalFolderDialogOpen(true)
  }

  const handleExportFileToExternalFolder = (file: FileItem) => {
    // Set the selected file and open the external folder dialog
    setSelectedFiles(new Set([file.id]))
    setIsExternalFolderDialogOpen(true)
  }

  // Add this function to handle PV export
  const handleExportToPV = async (file: FileItem) => {
    try {
      setIsLoading(true)

      // Export the file to PV format
      const pvBlob = await exportFileToPV(file)

      // Create a download link
      const url = URL.createObjectURL(pvBlob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${file.name}.pv`
      document.body.appendChild(a)
      a.click()

      // Clean up
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 100)

      toast({
        title: "Export Complete",
        description: `${file.name} has been exported as a PV encrypted file`,
      })
    } catch (error) {
      console.error("Failed to export to PV format:", error)
      toast({
        title: "Export Failed",
        description: "Failed to export file to PV format",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Add this function to handle bulk PV export
  const handleBulkExportToPV = async () => {
    if (selectedFiles.size === 0) return

    try {
      setIsLoading(true)

      // Get the selected files
      const filesToExport = filteredFiles.filter((file) => selectedFiles.has(file.id))

      // Export each file
      for (const file of filesToExport) {
        // Export the file to PV format
        const pvBlob = await exportFileToPV(file)

        // Create a download link
        const url = URL.createObjectURL(pvBlob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${file.name}.pv`
        document.body.appendChild(a)
        a.click()

        // Clean up
        setTimeout(() => {
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        }, 100)
      }

      toast({
        title: "Export Complete",
        description: `${filesToExport.length} file(s) have been exported as PV encrypted files`,
      })
    } catch (error) {
      console.error("Failed to export to PV format:", error)
      toast({
        title: "Export Failed",
        description: "Failed to export files to PV format",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">{getViewTitle()}</h2>
          {currentCategory && (
            <p className="text-sm text-gray-500">
              Showing all{" "}
              {currentCategory === "images"
                ? "image"
                : currentCategory === "documents"
                  ? "document"
                  : currentCategory === "videos"
                    ? "video"
                    : currentCategory === "audio"
                      ? "audio"
                      : currentCategory === "all"
                        ? ""
                        : "other"}{" "}
              files
            </p>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-2 mr-4">
            <span className="text-sm text-gray-500">Sort by:</span>
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as "name" | "size" | "date")}>
              <SelectTrigger className="w-[120px] h-8">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="size">Size</SelectItem>
                <SelectItem value="date">Date</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              title={sortOrder === "asc" ? "Ascending" : "Descending"}
            >
              <ArrowUpDown className="h-4 w-4 mr-1" />
              {sortOrder === "asc" ? "Asc" : "Desc"}
            </Button>
          </div>

          <Button variant="outline" size="sm" onClick={handleManualRefresh} title="Refresh files and folders">
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          {isSelectionMode ? (
            <>
              <div className="text-sm mr-2">{selectedFiles.size} selected</div>
              <Button variant="outline" size="sm" onClick={selectAllFiles} disabled={filteredFiles.length === 0}>
                Select All
              </Button>
              {selectedFiles.size > 0 && (
                <Button variant="outline" size="sm" onClick={deselectAllFiles}>
                  Deselect All
                </Button>
              )}
              {selectedFiles.size > 0 && (
                <Button variant="outline" size="sm" onClick={handleExportToExternalFolder}>
                  <HardDrive className="h-4 w-4 mr-1" />
                  Export to Folder
                </Button>
              )}
              {selectedFiles.size > 0 && (
                <Button variant="outline" size="sm" onClick={handleBulkExportToPV}>
                  <FileKey className="h-4 w-4 mr-1" />
                  Export as PV
                </Button>
              )}
              <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={selectedFiles.size === 0}>
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Selected
              </Button>
              <Button variant="ghost" size="icon" onClick={toggleSelectionMode}>
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={toggleSelectionMode} disabled={filteredFiles.length === 0}>
                <CheckSquare className="h-4 w-4 mr-1" />
                Select
              </Button>
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(value) => value && setViewMode(value as ViewMode)}
              >
                <ToggleGroupItem value="grid" aria-label="Grid view">
                  <Grid className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="List view">
                  <List className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </>
          )}
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-230px)]">
        {filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <FolderOpen className="h-16 w-16 mb-4" />
            <h3 className="text-lg font-medium">No files found</h3>
            <p className="text-sm">
              {searchQuery
                ? "Try a different search term"
                : currentCategory
                  ? `No ${currentCategory} files found`
                  : "Upload files or create folders to get started"}
            </p>
          </div>
        ) : (
          <div className="p-4">
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredFiles.map(renderGridItem)}
              </div>
            ) : (
              <div className="flex flex-col space-y-2">{filteredFiles.map(renderListItem)}</div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Rename Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveNewFileName()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveNewFileName}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move File Dialog */}
      <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move File to Folder</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label htmlFor="folder-select" className="text-sm font-medium">
                Select destination folder:
              </label>
              {folders.length > 0 ? (
                <Select value={selectedFolderId || ""} onValueChange={setSelectedFolderId}>
                  <SelectTrigger id="folder-select">
                    <SelectValue placeholder="Select a folder" />
                  </SelectTrigger>
                  <SelectContent>
                    {folders.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id.toString()}>
                        {folder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-gray-500">No folders available. Please create a folder first.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMoveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveFileMove} disabled={!selectedFolderId || folders.length === 0}>
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedFiles.size} file(s)? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmBulkDelete}>
              Delete Files
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Preview Dialog */}
      {selectedFile && previewContent && (
        <FilePreview
          file={selectedFile}
          content={previewContent}
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
        />
      )}

      {/* Share Dialog */}
      <ShareDialog file={fileToShare} isOpen={isShareDialogOpen} onClose={() => setIsShareDialogOpen(false)} />

      {/* External Folder Dialog */}
      <ExternalFolderDialog
        isOpen={isExternalFolderDialogOpen}
        onClose={() => setIsExternalFolderDialogOpen(false)}
        selectedFiles={filteredFiles.filter((file) => selectedFiles.has(file.id))}
      />
      {/* PV Import Dialog */}
      <PVImportDialog
        isOpen={isPVImportDialogOpen}
        onClose={() => setIsPVImportDialogOpen(false)}
        onComplete={refreshData}
        currentFolderId={currentFolder?.id || null}
      />
      {/* PV File Viewer */}
      {selectedPVFile && (
        <PVFileViewer
          file={selectedPVFile}
          isOpen={isPVFileViewerOpen}
          onClose={() => setIsPVFileViewerOpen(false)}
          onViewOriginal={handleViewOriginalFile}
        />
      )}
    </div>
  )
}

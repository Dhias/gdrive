"use client"

import type React from "react"

import { useEffect, useState } from "react"
import {
  FolderPlus,
  Home,
  ImageIcon,
  File,
  FileText,
  Trash2,
  ChevronRight,
  ChevronDown,
  Video,
  Music,
  RefreshCw,
  FileKey,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import type { Folder } from "@/lib/types"
import { createFolder, getFolders, deleteFolder } from "@/lib/db"
import { useToast } from "@/hooks/use-toast"

// Update the CategoryType type definition
export type CategoryType = "all" | "images" | "documents" | "videos" | "audio" | "other" | null

// Format bytes to human-readable format
const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

interface StorageStats {
  used: number
  total: number
  fileCount: number
}

interface SidebarProps {
  currentFolder: Folder | null
  setCurrentFolder: (folder: Folder | null) => void
  refreshData: () => void
  currentCategory: CategoryType
  setCurrentCategory: (category: CategoryType) => void
  pvFilesCount: number
  stats: StorageStats
}

export default function Sidebar({
  currentFolder,
  setCurrentFolder,
  refreshData,
  currentCategory,
  setCurrentCategory,
  pvFilesCount,
  stats,
}: SidebarProps) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set())
  const { toast } = useToast()

  // Load folders
  useEffect(() => {
    loadFolders()
  }, [])

  const loadFolders = async () => {
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
  }

  // Handle folder creation
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast({
        title: "Error",
        description: "Folder name cannot be empty",
        variant: "destructive",
      })
      return
    }

    try {
      const parentId = currentFolder ? currentFolder.id : null
      await createFolder(newFolderName, parentId)
      setNewFolderName("")
      setIsCreateFolderOpen(false)
      loadFolders()
      refreshData()

      toast({
        title: "Success",
        description: `Folder "${newFolderName}" created`,
      })
    } catch (error) {
      console.error("Failed to create folder:", error)
      toast({
        title: "Error",
        description: "Failed to create folder",
        variant: "destructive",
      })
    }
  }

  // Handle folder deletion
  const handleDeleteFolder = async (folderId: number, event: React.MouseEvent) => {
    event.stopPropagation()

    if (confirm("Are you sure you want to delete this folder and all its contents?")) {
      try {
        await deleteFolder(folderId)

        // If the deleted folder is the current folder, go back to root
        if (currentFolder && currentFolder.id === folderId) {
          setCurrentFolder(null)
        }

        loadFolders()
        refreshData()

        toast({
          title: "Success",
          description: "Folder deleted",
        })
      } catch (error) {
        console.error("Failed to delete folder:", error)
        toast({
          title: "Error",
          description: "Failed to delete folder",
          variant: "destructive",
        })
      }
    }
  }

  // Toggle folder expansion
  const toggleFolderExpansion = (folderId: number) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(folderId)) {
        newSet.delete(folderId)
      } else {
        newSet.add(folderId)
      }
      return newSet
    })
  }

  // Handle category selection
  const handleCategorySelect = (category: CategoryType) => {
    setCurrentCategory(category)
    // When selecting a category, we clear the folder selection
    setCurrentFolder(null)
  }

  // Recursive function to render folder tree
  const renderFolderTree = (folderList: Folder[], parentId: number | null = null, level = 0) => {
    const filteredFolders = folderList.filter((folder) => folder.parentId === parentId)

    return filteredFolders.map((folder) => {
      const hasChildren = folderList.some((f) => f.parentId === folder.id)
      const isExpanded = expandedFolders.has(folder.id)
      const isActive = currentFolder?.id === folder.id && currentCategory === null

      return (
        <div key={folder.id} className="ml-2">
          <div
            className={`flex items-center py-1 px-2 rounded-md cursor-pointer ${
              isActive ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100"
            }`}
            onClick={() => {
              setCurrentFolder(folder)
              setCurrentCategory(null)
            }}
          >
            {hasChildren ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 p-0 mr-1"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleFolderExpansion(folder.id)
                }}
              >
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            ) : (
              <div className="w-6"></div>
            )}
            <div className="flex-1 flex items-center">
              <Home className="h-4 w-4 mr-2" />
              <span className="text-sm truncate">{folder.name}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600"
              onClick={(e) => handleDeleteFolder(folder.id, e)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          {hasChildren && isExpanded && (
            <div className="ml-4 pl-2 border-l border-gray-200">
              {renderFolderTree(folderList, folder.id, level + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  const handleRefreshFolders = async () => {
    try {
      await loadFolders()
      toast({
        title: "Folders Refreshed",
        description: "Folder list has been updated",
      })
    } catch (error) {
      console.error("Failed to refresh folders:", error)
      toast({
        title: "Error",
        description: "Failed to refresh folders",
        variant: "destructive",
      })
    }
  }

  // Add this function to handle PV folder selection
  const handlePVFolderSelect = () => {
    setCurrentFolder(null)
    setCurrentCategory(null)
    // Signal to the parent that we want to show PV files
    // We'll use a custom event for this
    const event = new CustomEvent("showPVFolder", { detail: true })
    window.dispatchEvent(event)
  }

  return (
    <div className="w-64 border-r border-gray-200 bg-white flex flex-col h-full">
      <div className="p-4">
        <Button className="w-full justify-start" onClick={() => setIsCreateFolderOpen(true)}>
          <FolderPlus className="mr-2 h-4 w-4" />
          New Folder
        </Button>
      </div>

      <div className="px-4 py-2">
        <div
          className={`flex items-center py-1 px-2 rounded-md cursor-pointer ${
            !currentFolder && currentCategory === "all" ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100"
          }`}
          onClick={() => handleCategorySelect("all")}
        >
          <File className="h-4 w-4 mr-2" />
          <span className="text-sm font-medium">All Files</span>
        </div>
      </div>

      <div className="px-4 py-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Categories</div>
        <div className="mt-2 space-y-1">
          <div
            className={`flex items-center py-1 px-2 rounded-md cursor-pointer ${
              currentCategory === "images" ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100"
            }`}
            onClick={() => handleCategorySelect("images")}
          >
            <ImageIcon className="h-4 w-4 mr-2" />
            <span className="text-sm">Images</span>
          </div>
          <div
            className={`flex items-center py-1 px-2 rounded-md cursor-pointer ${
              currentCategory === "videos" ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100"
            }`}
            onClick={() => handleCategorySelect("videos")}
          >
            <Video className="h-4 w-4 mr-2" />
            <span className="text-sm">Videos</span>
          </div>
          <div
            className={`flex items-center py-1 px-2 rounded-md cursor-pointer ${
              currentCategory === "audio" ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100"
            }`}
            onClick={() => handleCategorySelect("audio")}
          >
            <Music className="h-4 w-4 mr-2" />
            <span className="text-sm">Audio</span>
          </div>
          <div
            className={`flex items-center py-1 px-2 rounded-md cursor-pointer ${
              currentCategory === "documents" ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100"
            }`}
            onClick={() => handleCategorySelect("documents")}
          >
            <FileText className="h-4 w-4 mr-2" />
            <span className="text-sm">Documents</span>
          </div>
          <div
            className={`flex items-center py-1 px-2 rounded-md cursor-pointer ${
              currentCategory === "other" ? "bg-blue-100 text-blue-700" : "hover:bg-gray-100"
            }`}
            onClick={() => handleCategorySelect("other")}
          >
            <File className="h-4 w-4 mr-2" />
            <span className="text-sm">Other Files</span>
          </div>
        </div>
      </div>

      <div className="px-4 py-2 flex-1 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Folders</div>
          <Button variant="ghost" size="sm" onClick={handleRefreshFolders} title="Refresh folders">
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
        <ScrollArea className="h-[calc(100vh-280px)] mt-2">
          {folders.length > 0 ? (
            renderFolderTree(folders)
          ) : (
            <div className="text-sm text-gray-500 italic p-2">No folders yet</div>
          )}
          {pvFilesCount > 0 && (
            <div
              className={`flex items-center py-1 px-2 rounded-md cursor-pointer hover:bg-gray-100`}
              onClick={handlePVFolderSelect}
            >
              <div className="w-6"></div>
              <div className="flex-1 flex items-center">
                <FileKey className="h-4 w-4 mr-2 text-blue-500" />
                <span className="text-sm truncate">PV Encrypted Files</span>
                <span className="ml-2 text-xs bg-blue-100 text-blue-800 rounded-full px-2 py-0.5">{pvFilesCount}</span>
              </div>
            </div>
          )}
        </ScrollArea>
      </div>

      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder()
              }}
            />
            {currentFolder && (
              <p className="text-sm text-gray-500 mt-2">Creating folder inside: {currentFolder.name}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateFolderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="mt-auto pt-4 px-4 border-t border-gray-200">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Storage</div>
        <div className="bg-gray-100 rounded-md p-3">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-600">Used</span>
            <span className="text-xs font-medium">{formatBytes(stats.used)}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full"
              style={{ width: `${Math.min((stats.used / stats.total) * 100, 100)}%` }}
            ></div>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-xs text-gray-600">Total</span>
            <span className="text-xs font-medium">{formatBytes(stats.total)}</span>
          </div>
          <div className="mt-2 text-center">
            <span className="text-xs text-gray-600">{stats.fileCount} files</span>
          </div>
        </div>
      </div>
    </div>
  )
}

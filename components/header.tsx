"use client"

import { useState } from "react"
import { Search, Settings, User, Trash, Trash2, HardDrive, FileKey } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { StorageStats } from "@/lib/types"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
// Add import for PV Import Dialog
import PVImportDialog from "@/components/pv-import-dialog"

interface HeaderProps {
  searchQuery: string
  setSearchQuery: (query: string) => void
  stats: StorageStats
  onDeleteAllData: () => void
  onOpenTrash: () => void
  onOpenExternalStorage: () => void
  onOpenExternalFolderExport: () => void
}

export default function Header({
  searchQuery,
  setSearchQuery,
  stats,
  onDeleteAllData,
  onOpenTrash,
  onOpenExternalStorage,
  onOpenExternalFolderExport,
}: HeaderProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const { toast } = useToast()
  // Add state for PV import dialog
  const [isPVImportDialogOpen, setIsPVImportDialogOpen] = useState(false)

  // Calculate percentage of storage used
  const usedPercentage = stats.total > 0 ? (stats.used / stats.total) * 100 : 0

  // Format bytes to human-readable format
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  // Handle delete all data
  const handleDeleteAllData = () => {
    onDeleteAllData()
    setShowDeleteConfirm(false)
    toast({
      title: "Data Deleted",
      description: "All your data has been deleted successfully",
    })
  }

  return (
    <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-2 flex items-center">
      <div className="flex items-center mr-8">
        <svg className="w-8 h-8 mr-2 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95C8.08 7.14 9.94 6 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11c1.56.1 2.78 1.41 2.78 2.96 0 1.65-1.35 3-3 3z"></path>
        </svg>
        <h1 className="text-xl font-bold">LocalDrive</h1>
      </div>

      <div className="relative flex-1 max-w-xl">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          <Search className="h-4 w-4 text-gray-400" />
        </div>
        <Input
          type="search"
          placeholder="Search files and folders..."
          className="pl-10 bg-gray-100 border-none"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="flex items-center ml-4 space-x-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowDeleteConfirm(true)} className="text-red-600">
              <Trash className="mr-2 h-4 w-4" />
              Delete All Data
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon">
          <User className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onOpenTrash} title="Trash Bin">
          <Trash2 className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onOpenExternalFolderExport} title="Export to External Folder">
          <HardDrive className="h-5 w-5" />
        </Button>
        {/* Add a button to the header for importing PV files */}
        {/* Add this inside the <div className="flex items-center ml-4 space-x-2"> element, before the last Button */}
        <Button variant="ghost" size="icon" onClick={() => setIsPVImportDialogOpen(true)} title="Import PV File">
          <FileKey className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onOpenExternalStorage} title="External Storage">
          <HardDrive className="h-5 w-5" />
        </Button>
      </div>

      {/* Delete All Data Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete All Data</DialogTitle>
            <DialogDescription>
              This will permanently delete all your files, folders, and settings. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <p className="text-sm font-medium text-gray-700">
              Are you sure you want to delete all your data? You will be redirected to the landing page.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteAllData}>
              Delete All Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* PV Import Dialog */}
      <PVImportDialog
        isOpen={isPVImportDialogOpen}
        onClose={() => setIsPVImportDialogOpen(false)}
        onComplete={() => {
          // Refresh data after import
          if (typeof onOpenExternalStorage === "function") {
            onOpenExternalStorage()
          }
        }}
        currentFolderId={null}
      />
    </header>
  )
}

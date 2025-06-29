"use client"

import { useState, useEffect } from "react"
import { Trash2, RefreshCw, RotateCcw, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import type { TrashItem } from "@/lib/types"
import { getTrashItems, restoreFromTrash, deleteFromTrash, emptyTrash } from "@/lib/db"

interface TrashBinProps {
  isOpen: boolean
  onClose: () => void
  onRefresh: () => void
}

export default function TrashBin({ isOpen, onClose, onRefresh }: TrashBinProps) {
  const [trashItems, setTrashItems] = useState<TrashItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEmptyDialogOpen, setIsEmptyDialogOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<TrashItem | null>(null)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (isOpen) {
      loadTrashItems()
    }
  }, [isOpen])

  const loadTrashItems = async () => {
    setIsLoading(true)
    try {
      const items = await getTrashItems()
      // Sort by deletion date, newest first
      items.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime())
      setTrashItems(items)
    } catch (error) {
      console.error("Failed to load trash items:", error)
      toast({
        title: "Error",
        description: "Failed to load trash items",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleRestore = async (item: TrashItem) => {
    try {
      await restoreFromTrash(item.id)
      setTrashItems(trashItems.filter((i) => i.id !== item.id))
      toast({
        title: "Item Restored",
        description: `${item.name} has been restored`,
      })
      onRefresh()
    } catch (error) {
      console.error("Failed to restore item:", error)
      toast({
        title: "Error",
        description: "Failed to restore item",
        variant: "destructive",
      })
    }
  }

  const handleDelete = (item: TrashItem) => {
    setSelectedItem(item)
    setIsDeleteDialogOpen(true)
  }

  const confirmDelete = async () => {
    if (!selectedItem) return

    try {
      await deleteFromTrash(selectedItem.id)
      setTrashItems(trashItems.filter((i) => i.id !== selectedItem.id))
      setIsDeleteDialogOpen(false)
      toast({
        title: "Item Deleted",
        description: `${selectedItem.name} has been permanently deleted`,
      })
    } catch (error) {
      console.error("Failed to delete item:", error)
      toast({
        title: "Error",
        description: "Failed to delete item",
        variant: "destructive",
      })
    }
  }

  const handleEmptyTrash = () => {
    setIsEmptyDialogOpen(true)
  }

  const confirmEmptyTrash = async () => {
    try {
      await emptyTrash()
      setTrashItems([])
      setIsEmptyDialogOpen(false)
      toast({
        title: "Trash Emptied",
        description: "All items have been permanently deleted",
      })
    } catch (error) {
      console.error("Failed to empty trash:", error)
      toast({
        title: "Error",
        description: "Failed to empty trash",
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
      hour: "numeric",
      minute: "numeric",
    }).format(date)
  }

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  // Get icon for item type
  const getItemTypeIcon = (item: TrashItem) => {
    if (item.type === "folder") {
      return "📁"
    } else if (item.fileType.startsWith("image/")) {
      return "🖼️"
    } else if (item.fileType.startsWith("video/")) {
      return "🎬"
    } else if (item.fileType.startsWith("audio/")) {
      return "🎵"
    } else if (
      item.fileType === "application/pdf" ||
      item.fileType.includes("document") ||
      item.fileType.includes("text/")
    ) {
      return "📄"
    } else {
      return "📎"
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl w-full max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Trash2 className="mr-2 h-5 w-5" />
            Trash Bin
          </DialogTitle>
          <DialogDescription>Items in the trash will be automatically deleted after 30 days</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
            </div>
          ) : trashItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <Trash2 className="h-16 w-16 mb-4" />
              <h3 className="text-lg font-medium">Trash is empty</h3>
              <p className="text-sm">Deleted items will appear here</p>
            </div>
          ) : (
            <ScrollArea className="h-[50vh]">
              <div className="space-y-2 p-1">
                {trashItems.map((item) => (
                  <Card key={item.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="text-2xl">{getItemTypeIcon(item)}</div>
                          <div>
                            <h4 className="font-medium">{item.name}</h4>
                            <div className="text-xs text-gray-500">
                              {item.type === "file" ? formatFileSize(item.size) : "Folder"} • Deleted on{" "}
                              {formatDate(item.deletedAt)}
                            </div>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <Button variant="outline" size="sm" onClick={() => handleRestore(item)} title="Restore">
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Restore
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(item)}
                            title="Delete permanently"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="flex justify-between items-center">
          <div>
            <Button variant="outline" size="sm" onClick={loadTrashItems}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>
          <div className="flex space-x-2">
            <Button variant="destructive" onClick={handleEmptyTrash} disabled={trashItems.length === 0}>
              <Trash2 className="h-4 w-4 mr-1" />
              Empty Trash
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Empty Trash Confirmation Dialog */}
      <Dialog open={isEmptyDialogOpen} onOpenChange={setIsEmptyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-red-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Empty Trash
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete all items in the trash? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEmptyDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmEmptyTrash}>
              Empty Trash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Item Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center text-red-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Delete Permanently
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete "{selectedItem?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}

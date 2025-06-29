"use client"

import { useEffect, useState } from "react"
import { initDB, getStorageStats, clearAllData } from "@/lib/db"
import Header from "@/components/header"
import Sidebar, { type CategoryType } from "@/components/sidebar"
import FileGallery from "@/components/file-gallery"
import UploadArea from "@/components/upload-area"
import type { Folder, StorageStats } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"
import LandingPage from "@/components/landing-page"
import PinEntry from "@/components/pin-entry"
import TrashBin from "@/components/trash-bin"
import ExternalStorageDialog from "@/components/external-storage-dialog"
import ExternalFolderDialog from "@/components/external-folder-dialog"
import BrowserCompatibilityNotice from "@/components/browser-compatibility-notice"

export default function FileStorage() {
  const [isLoading, setIsLoading] = useState(true)
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null)
  const [currentCategory, setCurrentCategory] = useState<CategoryType>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [stats, setStats] = useState<StorageStats>({ used: 0, total: 0, fileCount: 0 })
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [appState, setAppState] = useState<"landing" | "pin-entry" | "drive">("landing")
  const { toast } = useToast()
  const [isTrashOpen, setIsTrashOpen] = useState(false)
  const [isExternalStorageOpen, setIsExternalStorageOpen] = useState(false)
  const [isExternalFolderExportOpen, setIsExternalFolderExportOpen] = useState(false)
  // Add state for PV files count
  const [pvFilesCount, setPVFilesCount] = useState(0)
  const [showPVFolder, setShowPVFolder] = useState(false)

  // Add this useEffect to listen for the showPVFolder event
  useEffect(() => {
    const handleShowPVFolder = (event: Event) => {
      setShowPVFolder(true)
    }

    window.addEventListener("showPVFolder", handleShowPVFolder)

    return () => {
      window.removeEventListener("showPVFolder", handleShowPVFolder)
    }
  }, [])

  // Add this function to update PV files count
  const updatePVFilesCount = (count: number) => {
    setPVFilesCount(count)
  }

  // Check if user has already set up the app
  useEffect(() => {
    const usesPin = localStorage.getItem("usesPin")
    const pinHash = localStorage.getItem("pinHash")

    if (usesPin === "true" && pinHash) {
      // User has PIN protection enabled
      setAppState("pin-entry")
    } else if (usesPin === "false") {
      // User has chosen not to use PIN
      setAppState("drive")
    } else {
      // First-time user
      setAppState("landing")
    }
  }, [])

  // Initialize the database
  useEffect(() => {
    if (appState === "drive") {
      const setupDB = async () => {
        try {
          await initDB()
          updateStats()
          setIsLoading(false)
        } catch (error) {
          console.error("Failed to initialize database:", error)
          toast({
            title: "Database Error",
            description: "Failed to initialize the storage database. Please try refreshing the page.",
            variant: "destructive",
          })
        }
      }

      setupDB()
    }
  }, [appState, toast])

  // Update storage statistics
  const updateStats = async () => {
    try {
      const stats = await getStorageStats()
      setStats(stats)
    } catch (error) {
      console.error("Failed to get storage stats:", error)
    }
  }

  // Refresh data after operations
  const refreshData = () => {
    setRefreshTrigger((prev) => prev + 1)
    updateStats()
  }

  // Handle landing page completion
  const handleLandingComplete = (usesPin: boolean) => {
    setAppState("drive")
  }

  // Handle successful PIN entry
  const handlePinSuccess = () => {
    setAppState("drive")
  }

  // Handle delete all data
  const handleDeleteAllData = async () => {
    try {
      // Clear all data from IndexedDB
      await clearAllData()

      // Clear localStorage settings
      localStorage.removeItem("usesPin")
      localStorage.removeItem("pinHash")
      localStorage.removeItem("encryptionKey")
      localStorage.removeItem("pinAttempts")
      localStorage.removeItem("pinLockEndTime")

      // Reset to landing page
      setAppState("landing")
    } catch (error) {
      console.error("Failed to delete all data:", error)
      toast({
        title: "Error",
        description: "Failed to delete all data. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Handle external storage import completion
  const handleExternalStorageComplete = () => {
    refreshData()
    toast({
      title: "Import Complete",
      description: "External files have been imported successfully",
    })
  }

  // Render appropriate component based on app state
  if (appState === "landing") {
    return <LandingPage onComplete={handleLandingComplete} />
  }

  if (appState === "pin-entry") {
    return <PinEntry onSuccess={handlePinSuccess} />
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-16 h-16 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      <Header
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        stats={stats}
        onDeleteAllData={handleDeleteAllData}
        onOpenTrash={() => setIsTrashOpen(true)}
        onOpenExternalStorage={() => setIsExternalStorageOpen(true)}
        onOpenExternalFolderExport={() => setIsExternalFolderExportOpen(true)}
      />
      <BrowserCompatibilityNotice />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          currentFolder={currentFolder}
          setCurrentFolder={setCurrentFolder}
          refreshData={refreshData}
          currentCategory={currentCategory}
          setCurrentCategory={setCurrentCategory}
          pvFilesCount={pvFilesCount}
          stats={stats}
        />
        <main className="flex-1 overflow-hidden flex flex-col">
          <UploadArea currentFolder={currentFolder} refreshData={refreshData} />
          <FileGallery
            currentFolder={currentFolder}
            currentCategory={currentCategory}
            searchQuery={searchQuery}
            refreshTrigger={refreshTrigger}
            refreshData={refreshData}
            onExternalFolderExport={() => setIsExternalFolderExportOpen(true)}
            showPVFolder={showPVFolder}
            setShowPVFolder={setShowPVFolder}
            onPVFilesCountChange={updatePVFilesCount}
          />
        </main>
      </div>
      {/* Trash Bin */}
      <TrashBin isOpen={isTrashOpen} onClose={() => setIsTrashOpen(false)} onRefresh={refreshData} />

      {/* External Storage Dialog */}
      <ExternalStorageDialog
        isOpen={isExternalStorageOpen}
        onClose={() => setIsExternalStorageOpen(false)}
        onComplete={handleExternalStorageComplete}
        currentFolder={currentFolder}
      />

      {/* External Folder Export Dialog */}
      <ExternalFolderDialog
        isOpen={isExternalFolderExportOpen}
        onClose={() => setIsExternalFolderExportOpen(false)}
        selectedFiles={[]} // We'll pass an empty array since this is opened from the header
      />
    </div>
  )
}

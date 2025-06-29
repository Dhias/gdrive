"use client"

import { useState, useEffect } from "react"
import LandingPage from "@/components/landing-page"
import FileStorage from "@/components/file-storage"
import PinEntry from "@/components/pin-entry"
import PWAInstall from "@/components/pwa-install"
import OfflineIndicator from "@/components/offline-indicator"

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [usesPin, setUsesPin] = useState<boolean | null>(null)
  const [showPinEntry, setShowPinEntry] = useState(false)

  useEffect(() => {
    // Check if user has completed setup
    const hasCompletedSetup = localStorage.getItem("setupCompleted")
    const usesPinSetting = localStorage.getItem("usesPin")

    if (hasCompletedSetup) {
      const usesPin = usesPinSetting === "true"
      setUsesPin(usesPin)

      if (usesPin) {
        setShowPinEntry(true)
      } else {
        setIsAuthenticated(true)
      }
    }
  }, [])

  const handleSetupComplete = (usesPin: boolean) => {
    localStorage.setItem("setupCompleted", "true")
    localStorage.setItem("usesPin", usesPin.toString())
    setUsesPin(usesPin)

    if (usesPin) {
      setShowPinEntry(true)
    } else {
      setIsAuthenticated(true)
    }
  }

  const handlePinSuccess = () => {
    setIsAuthenticated(true)
    setShowPinEntry(false)
  }

  if (usesPin === null) {
    return (
      <>
        <LandingPage onComplete={handleSetupComplete} />
        <PWAInstall />
        <OfflineIndicator />
      </>
    )
  }

  if (showPinEntry) {
    return (
      <>
        <PinEntry onSuccess={handlePinSuccess} />
        <PWAInstall />
        <OfflineIndicator />
      </>
    )
  }

  if (isAuthenticated) {
    return (
      <>
        <FileStorage />
        <PWAInstall />
        <OfflineIndicator />
      </>
    )
  }

  return (
    <>
      <LandingPage onComplete={handleSetupComplete} />
      <PWAInstall />
      <OfflineIndicator />
    </>
  )
}

"use client"

import { WifiOff, RefreshCw, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function OfflinePageClient() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto bg-gray-100 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
              <WifiOff className="h-8 w-8 text-gray-600" />
            </div>
            <CardTitle>You're Offline</CardTitle>
            <CardDescription>No internet connection detected. Some features may be limited.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-gray-600 space-y-2">
              <p>
                <strong>Available offline:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>View and manage locally stored files</li>
                <li>Upload files (will sync when online)</li>
                <li>Access your file gallery</li>
                <li>Use security features</li>
              </ul>
            </div>

            <div className="text-sm text-gray-600 space-y-2">
              <p>
                <strong>Requires internet:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Cloud storage integration</li>
                <li>File sharing via links</li>
                <li>External storage access</li>
              </ul>
            </div>

            <div className="flex flex-col space-y-2 pt-4">
              <Button onClick={() => window.location.reload()} className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
              <Button variant="outline" onClick={() => (window.location.href = "/")} className="w-full">
                <Home className="mr-2 h-4 w-4" />
                Go to LocalDrive
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

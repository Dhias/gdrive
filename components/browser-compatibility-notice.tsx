"use client"

import { useState } from "react"
import { AlertCircle, X, Check, Info } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { isFileSystemAccessSupported } from "@/lib/external-storage"

export default function BrowserCompatibilityNotice() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const isCompatible = isFileSystemAccessSupported()

  if (isCompatible) return null

  const browserInfo = [
    { name: "Chrome", version: "86+", supported: true, notes: "Full support for all features" },
    { name: "Edge", version: "86+", supported: true, notes: "Full support for all features" },
    { name: "Opera", version: "72+", supported: true, notes: "Full support for all features" },
    { name: "Firefox", version: "N/A", supported: false, notes: "No support for File System Access API" },
    { name: "Safari", version: "16.4+", supported: true, notes: "Partial support, some features may be limited" },
    { name: "Safari iOS", version: "N/A", supported: false, notes: "No support for File System Access API" },
  ]

  return (
    <>
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4 mr-2" />
        <AlertDescription className="flex items-center justify-between">
          <span>Your browser doesn't support external storage features. Some functionality will be limited.</span>
          <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(true)}>
            Learn More
          </Button>
        </AlertDescription>
      </Alert>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Browser Compatibility Information</DialogTitle>
            <DialogDescription>
              LocalDrive uses modern web APIs for enhanced storage capabilities. Here's a comparison of browser support:
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border px-4 py-2 text-left">Browser</th>
                    <th className="border px-4 py-2 text-left">Version</th>
                    <th className="border px-4 py-2 text-left">Supported</th>
                    <th className="border px-4 py-2 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {browserInfo.map((browser, index) => (
                    <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="border px-4 py-2">{browser.name}</td>
                      <td className="border px-4 py-2">{browser.version}</td>
                      <td className="border px-4 py-2">
                        {browser.supported ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <X className="h-4 w-4 text-red-500" />
                        )}
                      </td>
                      <td className="border px-4 py-2">{browser.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-4 bg-blue-50 rounded-md">
              <div className="flex items-start">
                <Info className="h-5 w-5 text-blue-500 mr-2 mt-0.5" />
                <div>
                  <h3 className="font-medium text-blue-800">What features are affected?</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    Without File System Access API support, you won't be able to:
                  </p>
                  <ul className="list-disc list-inside text-sm text-blue-700 mt-1">
                    <li>Import files directly from your file system</li>
                    <li>Export files to specific folders on your device</li>
                    <li>Save folders for quick access</li>
                    <li>Import entire directories at once</li>
                  </ul>
                  <p className="text-sm text-blue-700 mt-2">
                    We recommend using Chrome, Edge, or Opera for the best experience.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setIsDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

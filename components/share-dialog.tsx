"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Copy, Check, Share2, ExternalLink, Clock, Download } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { FileItem } from "@/lib/types"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface ShareDialogProps {
  file: FileItem | null
  isOpen: boolean
  onClose: () => void
}

type ExpiryOption = "download" | "time"
type ExpiryTime = "15m" | "1h" | "3h" | "6h" | "12h" | "24h"

export default function ShareDialog({ file, isOpen, onClose }: ShareDialogProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [expiryOption, setExpiryOption] = useState<ExpiryOption>("download")
  const [expiryTime, setExpiryTime] = useState<ExpiryTime>("1h")
  const { toast } = useToast()

  const handleShare = async () => {
    if (!file) return

    setIsUploading(true)

    try {
      // Get the file content
      const content = file.content as Blob

      // If the file is encrypted, decrypt it first
      let fileToUpload: Blob
      if (file.encrypted) {
        fileToUpload = await decryptFile(content)
      } else {
        fileToUpload = content
      }

      // Create a File object with the correct name and type
      const fileObj = new File([fileToUpload], file.name, { type: file.type })

      // Create form data
      const formData = new FormData()
      formData.append("file", fileObj)
      formData.append("expiryOption", expiryOption)
      formData.append("expiryTime", expiryTime)

      // Upload to R2 via our API
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Failed to upload file")
      }

      const data = await response.json()

      if (data.success) {
        setShareUrl(data.shareUrl)
        toast({
          title: "File Shared",
          description: "Your file has been shared successfully",
        })
      } else {
        throw new Error(data.error || "Failed to share file")
      }
    } catch (error) {
      console.error("Share error:", error)
      toast({
        title: "Share Failed",
        description: error instanceof Error ? error.message : "Failed to share file",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
    }
  }

  const copyToClipboard = () => {
    if (!shareUrl) return

    navigator.clipboard.writeText(shareUrl)
    setCopied(true)

    toast({
      title: "Link Copied",
      description: "Share link copied to clipboard",
    })

    setTimeout(() => setCopied(false), 2000)
  }

  const openShareUrl = () => {
    if (!shareUrl) return
    window.open(shareUrl, "_blank")
  }

  // Reset state when dialog closes
  const handleClose = () => {
    if (!isUploading) {
      setShareUrl(null)
      setCopied(false)
      setExpiryOption("download")
      setExpiryTime("1h")
      onClose()
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
      return new Blob([decryptedBuffer], { type: file?.type || "application/octet-stream" })
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

  // Get human-readable expiry time
  const getExpiryTimeText = (time: ExpiryTime): string => {
    switch (time) {
      case "15m":
        return "15 minutes"
      case "1h":
        return "1 hour"
      case "3h":
        return "3 hours"
      case "6h":
        return "6 hours"
      case "12h":
        return "12 hours"
      case "24h":
        return "24 hours"
      default:
        return "1 hour"
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share File</DialogTitle>
          <DialogDescription>
            {shareUrl
              ? "Your file has been shared. Copy the link below to share it with others."
              : `Share "${file?.name}" with others`}
          </DialogDescription>
        </DialogHeader>

        {!shareUrl ? (
          <div className="py-6 space-y-4">
            <p className="text-sm text-gray-500 mb-4">
              This will upload your file to our secure cloud storage and generate a public link that anyone can access.
            </p>

            {file?.encrypted && (
              <p className="text-sm text-green-600 mb-4">
                Your file will be decrypted before sharing so recipients can access it.
              </p>
            )}

            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-3">When should this file expire?</h4>
                <RadioGroup
                  value={expiryOption}
                  onValueChange={(value) => setExpiryOption(value as ExpiryOption)}
                  className="space-y-3"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="download" id="option-download" />
                    <Label htmlFor="option-download" className="flex items-center cursor-pointer">
                      <Download className="h-4 w-4 mr-2" />
                      Delete after download
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="time" id="option-time" />
                    <Label htmlFor="option-time" className="flex items-center cursor-pointer">
                      <Clock className="h-4 w-4 mr-2" />
                      Delete after time period
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {expiryOption === "time" && (
                <div className="pl-6">
                  <Label htmlFor="expiry-time" className="text-sm font-medium mb-2 block">
                    Expire after:
                  </Label>
                  <Select value={expiryTime} onValueChange={(value) => setExpiryTime(value as ExpiryTime)}>
                    <SelectTrigger id="expiry-time" className="w-full">
                      <SelectValue placeholder="Select expiry time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15m">15 minutes</SelectItem>
                      <SelectItem value="1h">1 hour</SelectItem>
                      <SelectItem value="3h">3 hours</SelectItem>
                      <SelectItem value="6h">6 hours</SelectItem>
                      <SelectItem value="12h">12 hours</SelectItem>
                      <SelectItem value="24h">24 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center space-x-2 py-4">
            <div className="grid flex-1 gap-2">
              <Input value={shareUrl} readOnly className="w-full" />
              <p className="text-xs text-gray-500">
                {expiryOption === "download"
                  ? "This file will be deleted after it's downloaded."
                  : `This file will expire after ${getExpiryTimeText(expiryTime)}.`}
              </p>
            </div>
            <Button size="icon" onClick={copyToClipboard}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          {!shareUrl ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isUploading}>
                Cancel
              </Button>
              <Button onClick={handleShare} disabled={isUploading}>
                {isUploading ? (
                  <>
                    <div className="mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share File
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button onClick={openShareUrl} className="ml-auto">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Link
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

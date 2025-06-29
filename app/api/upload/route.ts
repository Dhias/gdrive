import { type NextRequest, NextResponse } from "next/server"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

// Configure S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: "auto",
  endpoint: "https://e0e5e32248d2813718e01a03f06983ef.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
})

// Function to generate a short ID (8 characters, alphanumeric)
function generateShortId(length = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)

  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomValues[i] % chars.length)
  }

  return result
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const expiryOption = (formData.get("expiryOption") as string) || "download"
    const expiryTime = (formData.get("expiryTime") as string) || "1h"

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Generate a short file ID (8 characters)
    const fileId = generateShortId(8)

    // Create a safe filename
    const originalName = file.name
    // Get the extension from the original filename
    const extension = originalName.split(".").pop() || "bin"
    const safeFileName = `${fileId}.${extension}`

    // Calculate expiry time if needed
    let expiresAt: Date | null = null
    const deleteAfterDownload = expiryOption === "download"

    if (expiryOption === "time") {
      expiresAt = new Date()

      switch (expiryTime) {
        case "15m":
          expiresAt.setMinutes(expiresAt.getMinutes() + 15)
          break
        case "1h":
          expiresAt.setHours(expiresAt.getHours() + 1)
          break
        case "3h":
          expiresAt.setHours(expiresAt.getHours() + 3)
          break
        case "6h":
          expiresAt.setHours(expiresAt.getHours() + 6)
          break
        case "12h":
          expiresAt.setHours(expiresAt.getHours() + 12)
          break
        case "24h":
          expiresAt.setHours(expiresAt.getHours() + 24)
          break
        default:
          expiresAt.setHours(expiresAt.getHours() + 1)
      }
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer())

    // Upload to R2 with proper metadata
    const command = new PutObjectCommand({
      Bucket: "lodri",
      Key: safeFileName,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
      Metadata: {
        originalname: originalName,
        extension: extension,
        filesize: String(file.size),
        filetype: file.type || "application/octet-stream",
        deleteafterdownload: String(deleteAfterDownload),
        expiryoption: expiryOption,
        expirytime: expiryTime,
        expiresat: expiresAt ? expiresAt.toISOString() : "",
      },
    })

    await s3Client.send(command)

    // Generate public URL
    const publicUrl = `https://pub-c7b3ddaf861d477486885ca7fb26281d.r2.dev/${safeFileName}`

    // Generate share URL
    const shareUrl = `${request.nextUrl.origin}/share/${fileId}`

    return NextResponse.json({
      success: true,
      fileId,
      publicUrl,
      shareUrl,
      fileName: originalName,
      extension: extension,
      deleteAfterDownload,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 })
  }
}

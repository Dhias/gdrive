import { type NextRequest, NextResponse } from "next/server"
import { S3Client, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"

// Configure S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: "auto",
  endpoint: "https://e0e5e32248d2813718e01a03f06983ef.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
})

// Update the GET function to handle shorter file IDs
export async function GET(request: NextRequest, { params }: { params: { fileId: string } }) {
  try {
    const fileId = params.fileId

    if (!fileId) {
      return NextResponse.json({ error: "Invalid file ID" }, { status: 404 })
    }

    // Find the file in the bucket by listing objects with the fileId prefix
    // Since we're using shorter IDs, we need to be more specific with the search
    const listCommand = new ListObjectsV2Command({
      Bucket: "lodri",
      Prefix: fileId,
      MaxKeys: 10, // Increase this to handle potential collisions
    })

    const listResponse = await s3Client.send(listCommand)

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // Find the exact file that starts with the fileId and has a dot after it
    const objectKey = listResponse.Contents.find(
      (item) => item.Key?.startsWith(fileId) && item.Key.charAt(fileId.length) === ".",
    )?.Key

    if (!objectKey) {
      return NextResponse.json({ error: "File key not found" }, { status: 404 })
    }

    // Get the object metadata
    const headCommand = new HeadObjectCommand({
      Bucket: "lodri",
      Key: objectKey,
    })

    const headResponse = await s3Client.send(headCommand)

    // Get metadata
    const metadata = headResponse.Metadata || {}
    const originalName = metadata.originalname || `file.${objectKey.split(".").pop() || "bin"}`
    const fileSize = Number.parseInt(metadata.filesize || "0", 10)
    const fileType = metadata.filetype || headResponse.ContentType || "application/octet-stream"
    const deleteAfterDownload = metadata.deleteafterdownload === "true"
    const expiryOption = metadata.expiryoption || "download"
    const expiryTime = metadata.expirytime || "1h"
    const expiresAt = metadata.expiresat || null

    // Check if the file has expired
    if (expiryOption === "time" && expiresAt) {
      const expiryDate = new Date(expiresAt)
      if (expiryDate < new Date()) {
        return NextResponse.json({ error: "File has expired" }, { status: 404 })
      }
    }

    // Format file size
    const formattedSize = formatFileSize(fileSize)

    // Construct the public URL
    const publicUrl = `https://pub-c7b3ddaf861d477486885ca7fb26281d.r2.dev/${objectKey}`

    return NextResponse.json({
      fileName: originalName,
      fileType: fileType,
      publicUrl: publicUrl,
      extension: objectKey.split(".").pop() || "bin",
      fileSize: fileSize,
      formattedSize: formattedSize,
      lastModified: headResponse.LastModified,
      deleteAfterDownload,
      expiryOption,
      expiryTime,
      expiresAt,
    })
  } catch (error) {
    console.error("Error fetching shared file:", error)
    return NextResponse.json({ error: "File not found" }, { status: 404 })
  }
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

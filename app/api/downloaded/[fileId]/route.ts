import { type NextRequest, NextResponse } from "next/server"
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"

// Configure S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: "auto",
  endpoint: "https://e0e5e32248d2813718e01a03f06983ef.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
})

// Update the POST function to handle shorter file IDs
export async function POST(request: NextRequest, { params }: { params: { fileId: string } }) {
  try {
    const fileId = params.fileId

    if (!fileId) {
      return NextResponse.json({ error: "Invalid file ID" }, { status: 400 })
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

    // Delete the file if it's set to be deleted after download
    const deleteCommand = new DeleteObjectCommand({
      Bucket: "lodri",
      Key: objectKey,
    })

    await s3Client.send(deleteCommand)

    return NextResponse.json({ success: true, message: "File marked as downloaded and deleted" })
  } catch (error) {
    console.error("Error processing download notification:", error)
    return NextResponse.json({ error: "Failed to process download notification" }, { status: 500 })
  }
}

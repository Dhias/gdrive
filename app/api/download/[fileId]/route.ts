import { type NextRequest, NextResponse } from "next/server"
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"

// Configure S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: "auto",
  endpoint: "https://e0e5e32248d2813718e01a03f06983ef.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
})

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

    // Get the object from R2
    const getCommand = new GetObjectCommand({
      Bucket: "lodri",
      Key: objectKey,
    })

    const response = await s3Client.send(getCommand)

    // Get metadata
    const metadata = response.Metadata || {}
    const originalName = metadata.originalname || objectKey.split("/").pop() || "download"
    const contentType = response.ContentType || "application/octet-stream"

    // Convert the stream to a Response
    if (!response.Body) {
      return NextResponse.json({ error: "File content not found" }, { status: 404 })
    }

    // @ts-ignore - The Body is a ReadableStream but TypeScript doesn't recognize it
    const stream = response.Body.transformToWebStream()

    // Create a new response with the stream
    const newResponse = new Response(stream, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(originalName)}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    })

    return newResponse
  } catch (error) {
    console.error("Error downloading file:", error)
    return NextResponse.json({ error: "Failed to download file" }, { status: 500 })
  }
}

// PV Format Utilities
// This file handles the export and import of encrypted .pv files

import { getFileContent } from "@/lib/db"
import type { FileItem } from "@/lib/types"

// PV file structure
interface PVFileStructure {
  salt: Uint8Array
  iv: Uint8Array
  metadata: {
    name: string
    type: string
    size: number
    lastModified: number
  }
  ciphertext: ArrayBuffer
}

// Constants
const SALT_LENGTH = 16 // 16 bytes for salt
const IV_LENGTH = 12 // 12 bytes for IV
const ITERATION_COUNT = 100000 // Iterations for PBKDF2
const PV_HEADER = "PVENC01" // Header to identify PV files
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024 // 50MB threshold for large files
const CHUNK_SIZE = 1 * 1024 * 1024 // 1MB chunks for processing
const MAX_DECRYPT_SIZE = 1.8 * 1024 * 1024 * 1024 // 1.8GB max size for decryption (below 2GB limit)
const VERY_LARGE_FILE_THRESHOLD = 1.8 * 1024 * 1024 * 1024 // 1.8GB threshold for very large files
const MAX_SEGMENT_SIZE = 1.5 * 1024 * 1024 * 1024 // 1.5GB max segment size (below 2GB limit)

// Get seed phrase from IndexedDB
export const getSeedPhrase = async (): Promise<string> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("LocalDriveSecurityDB", 1)

    request.onsuccess = async (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      const transaction = db.transaction(["security"], "readonly")
      const store = transaction.objectStore("security")
      const getRequest = store.get("seedPhrase")

      getRequest.onsuccess = async (event) => {
        try {
          const encryptedData = (event.target as IDBRequest).result as ArrayBuffer
          if (!encryptedData) {
            reject(new Error("Seed phrase not found"))
            return
          }

          // Get the encryption key
          const key = await getOrCreateEncryptionKey()

          // Decrypt the stored seed phrase
          const decryptedPhrase = await decryptData(encryptedData, key)
          resolve(decryptedPhrase)
        } catch (error) {
          console.error("Error retrieving seed phrase:", error)
          reject(error)
        }
      }

      getRequest.onerror = () => {
        reject(new Error("Error getting seed phrase from IndexedDB"))
      }

      transaction.oncomplete = () => {
        db.close()
      }
    }

    request.onerror = () => {
      reject(new Error("Error opening security database"))
    }
  })
}

// Get or create encryption key (reused from existing code)
const getOrCreateEncryptionKey = async (): Promise<CryptoKey> => {
  // Check if we already have a key in localStorage
  const storedKey = localStorage.getItem("encryptionKey")

  if (storedKey) {
    // Convert stored key back to CryptoKey
    const keyBuffer = Uint8Array.from(atob(storedKey), (c) => c.charCodeAt(0))
    return crypto.subtle.importKey("raw", keyBuffer, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
  } else {
    // Generate a new key
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])

    // Export the key to store it
    const exportedKey = await crypto.subtle.exportKey("raw", key)

    // Store the key in localStorage
    const keyString = btoa(String.fromCharCode(...new Uint8Array(exportedKey)))
    localStorage.setItem("encryptionKey", keyString)

    return key
  }
}

// Decrypt data using AES-256 (reused from existing code)
const decryptData = async (encryptedData: ArrayBuffer, key: CryptoKey): Promise<string> => {
  try {
    // Extract IV (first 12 bytes) and encrypted data
    const iv = new Uint8Array(encryptedData.slice(0, 12))
    const data = new Uint8Array(encryptedData.slice(12))

    // Decrypt the data
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      data,
    )

    // Convert decrypted buffer to string
    const decoder = new TextDecoder()
    return decoder.decode(decryptedBuffer)
  } catch (error) {
    console.error("Decryption error:", error)
    throw error
  }
}

// Derive encryption key from seed phrase and salt
export const deriveKeyFromSeedPhrase = async (seedPhrase: string, salt: Uint8Array): Promise<CryptoKey> => {
  // Convert seed phrase to raw key material
  const encoder = new TextEncoder()
  const seedPhraseBuffer = encoder.encode(seedPhrase)

  // Import as raw key material
  const keyMaterial = await crypto.subtle.importKey("raw", seedPhraseBuffer, { name: "PBKDF2" }, false, [
    "deriveBits",
    "deriveKey",
  ])

  // Derive the actual encryption key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: ITERATION_COUNT,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

// Export a file to PV format
export const exportFileToPV = async (file: FileItem): Promise<Blob> => {
  try {
    // For large files, use a different approach to avoid memory issues
    if (file.size > LARGE_FILE_THRESHOLD) {
      return await exportLargeFileToPV(file)
    }

    // For smaller files, use the standard approach
    // Get file content from IndexedDB
    const encryptedContent = await getFileContent(file.id)

    // Decrypt the file if it's already encrypted in the database
    let fileContent: Blob
    if (file.encrypted) {
      fileContent = await decryptFileContent(encryptedContent)
    } else {
      fileContent = encryptedContent
    }

    // Get the seed phrase
    const seedPhrase = await getSeedPhrase()

    // Generate a random salt
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))

    // Generate a random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

    // Derive encryption key from seed phrase and salt
    const encryptionKey = await deriveKeyFromSeedPhrase(seedPhrase, salt)

    // Prepare metadata
    const metadata = {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified.getTime(),
      originalFilename: file.name, // Store the original filename explicitly
    }

    // Serialize metadata
    const metadataString = JSON.stringify(metadata)
    const metadataBuffer = new TextEncoder().encode(metadataString)

    // Convert file content to ArrayBuffer
    const fileBuffer = await fileContent.arrayBuffer()

    // Encrypt the file content
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
        tagLength: 128, // 16 bytes for authentication tag
      },
      encryptionKey,
      fileBuffer,
    )

    // Create the PV file structure
    // Format: HEADER + SALT + IV + METADATA_LENGTH (4 bytes) + METADATA + CIPHERTEXT
    const headerBuffer = new TextEncoder().encode(PV_HEADER)
    const metadataLengthBuffer = new Uint32Array([metadataBuffer.length])

    // Combine all parts into a single buffer
    const combinedBuffer = new Uint8Array(
      headerBuffer.length +
        salt.length +
        iv.length +
        4 + // 4 bytes for metadata length
        metadataBuffer.length +
        encryptedBuffer.byteLength,
    )

    let offset = 0
    combinedBuffer.set(headerBuffer, offset)
    offset += headerBuffer.length
    combinedBuffer.set(salt, offset)
    offset += salt.length
    combinedBuffer.set(iv, offset)
    offset += iv.length
    combinedBuffer.set(new Uint8Array(metadataLengthBuffer.buffer), offset)
    offset += 4
    combinedBuffer.set(metadataBuffer, offset)
    offset += metadataBuffer.length
    combinedBuffer.set(new Uint8Array(encryptedBuffer), offset)

    // Return as Blob with .pv MIME type
    return new Blob([combinedBuffer], { type: "application/x-pv-encrypted" })
  } catch (error) {
    console.error("Error exporting to PV format:", error)
    throw error
  }
}

// New function to handle large file exports to PV format
const exportLargeFileToPV = async (file: FileItem): Promise<Blob> => {
  try {
    // Get file content from IndexedDB
    const encryptedContent = await getFileContent(file.id)

    // Decrypt the file if it's already encrypted in the database
    let fileContent: Blob
    if (file.encrypted) {
      fileContent = await decryptFileContent(encryptedContent)
    } else {
      fileContent = encryptedContent
    }

    // Get the seed phrase
    const seedPhrase = await getSeedPhrase()

    // Generate a random salt
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))

    // Generate a random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

    // Derive encryption key from seed phrase and salt
    const encryptionKey = await deriveKeyFromSeedPhrase(seedPhrase, salt)

    // Prepare metadata
    const metadata = {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified.getTime(),
      originalFilename: file.name, // Store the original filename explicitly
    }

    // Serialize metadata
    const metadataString = JSON.stringify(metadata)
    const metadataBuffer = new TextEncoder().encode(metadataString)

    // Create the PV file structure header
    const headerBuffer = new TextEncoder().encode(PV_HEADER)
    const metadataLengthBuffer = new Uint32Array([metadataBuffer.length])

    // Calculate header size
    const headerSize = headerBuffer.length + salt.length + iv.length + 4 + metadataBuffer.length

    // Create a temporary array buffer for the header
    const headerArrayBuffer = new ArrayBuffer(headerSize)
    const headerView = new Uint8Array(headerArrayBuffer)

    let offset = 0
    headerView.set(headerBuffer, offset)
    offset += headerBuffer.length
    headerView.set(salt, offset)
    offset += salt.length
    headerView.set(iv, offset)
    offset += iv.length
    headerView.set(new Uint8Array(metadataLengthBuffer.buffer), offset)
    offset += 4
    headerView.set(metadataBuffer, offset)

    // Process the file in smaller chunks to avoid memory issues
    const fileSize = fileContent.size
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE)

    // Create an array to hold all the encrypted chunks
    const encryptedChunks: Blob[] = [new Blob([headerView])]

    // Process each chunk
    for (let i = 0; i < totalChunks; i++) {
      // Extract chunk
      const start = i * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, fileSize)
      const chunk = fileContent.slice(start, end)

      // Convert chunk to ArrayBuffer
      const chunkBuffer = await chunk.arrayBuffer()

      // Encrypt the chunk
      const encryptedChunk = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: iv,
          tagLength: 128,
        },
        encryptionKey,
        chunkBuffer,
      )

      // Add the encrypted chunk to our array
      encryptedChunks.push(new Blob([encryptedChunk]))

      // Add a small delay to prevent UI freezing
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    // Combine all chunks into a single blob
    return new Blob(encryptedChunks, { type: "application/x-pv-encrypted" })
  } catch (error) {
    console.error("Error exporting large file to PV format:", error)
    throw error
  }
}

// Decrypt file content (for files already encrypted in the database)
const decryptFileContent = async (encryptedBlob: Blob): Promise<Blob> => {
  try {
    // Get the encryption key
    const key = await getOrCreateEncryptionKey()

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
    return new Blob([decryptedBuffer])
  } catch (error) {
    console.error("Decryption error:", error)
    // If decryption fails, return the original blob
    return encryptedBlob
  }
}

// Helper function to read a file as ArrayBuffer with better error handling
const readFileAsArrayBuffer = async (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result)
      } else {
        reject(new Error("Failed to read file as ArrayBuffer"))
      }
    }

    reader.onerror = () => {
      reject(new Error(`Error reading file: ${reader.error?.message || "Unknown error"}`))
    }

    // Use readAsArrayBuffer for better performance with large files
    reader.readAsArrayBuffer(file)
  })
}

// Helper function to read a slice of a file as ArrayBuffer
const readFileSliceAsArrayBuffer = async (file: File, start: number, end: number): Promise<ArrayBuffer> => {
  const slice = file.slice(start, end)
  return readFileAsArrayBuffer(slice)
}

// Import a PV file
export const importPVFile = async (pvFile: File): Promise<{ success: boolean; file?: FileItem; error?: string }> => {
  try {
    // Check if it's a very large file (over 1.8GB)
    if (pvFile.size > VERY_LARGE_FILE_THRESHOLD) {
      return await importStreamingPVFile(pvFile)
    }

    // Check if it's a large file
    if (pvFile.size > LARGE_FILE_THRESHOLD) {
      return await importLargePVFile(pvFile)
    }

    // For smaller files, use the standard approach
    // Create a copy of the file to prevent permission issues
    const fileBuffer = await readFileAsArrayBuffer(pvFile)
    const fileData = new Uint8Array(fileBuffer)

    // Check header
    const headerLength = PV_HEADER.length
    const header = new TextDecoder().decode(fileData.slice(0, headerLength))

    if (header !== PV_HEADER) {
      return { success: false, error: "Invalid PV file format" }
    }

    // Extract salt, IV, and metadata
    let offset = headerLength
    const salt = fileData.slice(offset, offset + SALT_LENGTH)
    offset += SALT_LENGTH

    const iv = fileData.slice(offset, offset + IV_LENGTH)
    offset += IV_LENGTH

    // Read metadata length (4 bytes)
    const metadataLength = new Uint32Array(fileData.slice(offset, offset + 4).buffer)[0]
    offset += 4

    // Read metadata
    const metadataBytes = fileData.slice(offset, offset + metadataLength)
    const metadataString = new TextDecoder().decode(metadataBytes)
    const metadata = JSON.parse(metadataString)
    offset += metadataLength

    // Extract ciphertext
    const ciphertext = fileData.slice(offset)

    // Get the seed phrase
    const seedPhrase = await getSeedPhrase()

    // Derive key from seed phrase and salt
    const decryptionKey = await deriveKeyFromSeedPhrase(seedPhrase, salt)

    // Attempt to decrypt
    let decryptedContent: ArrayBuffer
    try {
      decryptedContent = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: iv,
          tagLength: 128, // 16 bytes for authentication tag
        },
        decryptionKey,
        ciphertext,
      )
    } catch (error) {
      console.error("Decryption failed:", error)
      return {
        success: false,
        error: "Decryption failed. This file was likely encrypted with a different seed phrase.",
      }
    }

    // Create a file item from the decrypted content
    const decryptedFile: Omit<FileItem, "id"> = {
      name: metadata.originalFilename || metadata.name, // Use the original filename if available
      type: metadata.type,
      size: metadata.size,
      lastModified: new Date(metadata.lastModified),
      content: new Blob([decryptedContent], { type: metadata.type }),
      folderId: null,
      encrypted: false, // We're storing the decrypted content
      externalSource: {
        type: "pv",
        path: pvFile.name,
        lastAccessed: new Date(),
      },
    }

    return { success: true, file: decryptedFile as FileItem }
  } catch (error) {
    console.error("Error importing PV file:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error importing PV file",
    }
  }
}

// Function to handle large PV file imports
const importLargePVFile = async (pvFile: File): Promise<{ success: boolean; file?: FileItem; error?: string }> => {
  try {
    console.log("Starting large PV file import process for:", pvFile.name, "Size:", pvFile.size)

    // Check if file is too large for browser limitations
    if (pvFile.size > 2.1 * 1024 * 1024 * 1024) {
      // Over 2.1GB
      return {
        success: false,
        error: "File is too large to decrypt in browser (over 2GB). Please use the streaming import option.",
      }
    }

    // Create a copy of the file to prevent permission issues
    const fileCopy = new File([pvFile], pvFile.name, {
      type: pvFile.type,
      lastModified: pvFile.lastModified,
    })

    // First, read just the header portion to extract metadata
    // We'll read the first 1MB which should be more than enough for the header
    const headerChunk = fileCopy.slice(0, 1024 * 1024)

    console.log("Reading header chunk...")
    const headerBuffer = await readFileAsArrayBuffer(headerChunk)
    const headerData = new Uint8Array(headerBuffer)

    // Check header
    const headerLength = PV_HEADER.length
    const header = new TextDecoder().decode(headerData.slice(0, headerLength))

    if (header !== PV_HEADER) {
      console.error("Invalid PV file format")
      return { success: false, error: "Invalid PV file format" }
    }

    // Extract salt, IV, and metadata
    let offset = headerLength
    const salt = headerData.slice(offset, offset + SALT_LENGTH)
    offset += SALT_LENGTH

    const iv = headerData.slice(offset, offset + IV_LENGTH)
    offset += IV_LENGTH

    // Read metadata length (4 bytes)
    const metadataLength = new Uint32Array(headerData.slice(offset, offset + 4).buffer)[0]
    offset += 4

    // Read metadata
    const metadataBytes = headerData.slice(offset, offset + metadataLength)
    const metadataString = new TextDecoder().decode(metadataBytes)
    const metadata = JSON.parse(metadataString)

    console.log("Extracted metadata:", {
      name: metadata.name,
      type: metadata.type,
      size: metadata.size,
    })

    // Calculate the total header size
    const totalHeaderSize = headerLength + SALT_LENGTH + IV_LENGTH + 4 + metadataLength

    // Get the seed phrase
    console.log("Getting seed phrase...")
    const seedPhrase = await getSeedPhrase()

    // Derive key from seed phrase and salt
    console.log("Deriving key from seed phrase...")
    const decryptionKey = await deriveKeyFromSeedPhrase(seedPhrase, salt)

    // For files approaching 2GB, we need to handle them differently
    if (pvFile.size - totalHeaderSize > MAX_DECRYPT_SIZE) {
      console.log("File is approaching 2GB limit, using streaming approach...")
      return await importStreamingPVFile(pvFile)
    }

    // For files under 2GB, we can still use the direct approach
    console.log("Reading entire file...")
    const entireFileBuffer = await readFileAsArrayBuffer(fileCopy)

    // Extract just the ciphertext portion
    console.log("Extracting ciphertext...")
    const ciphertext = new Uint8Array(entireFileBuffer.slice(totalHeaderSize))

    console.log("Ciphertext size:", ciphertext.length)

    // Attempt to decrypt
    console.log("Attempting decryption...")
    let decryptedContent: ArrayBuffer
    try {
      decryptedContent = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: iv,
          tagLength: 128,
        },
        decryptionKey,
        ciphertext,
      )
      console.log("Decryption successful")
    } catch (error) {
      console.error("Decryption failed:", error)
      return {
        success: false,
        error: "Decryption failed. This file was likely encrypted with a different seed phrase.",
      }
    }

    console.log("Creating file item from decrypted content...")
    // Create a file item from the decrypted content
    const decryptedFile: Omit<FileItem, "id"> = {
      name: metadata.originalFilename || metadata.name,
      type: metadata.type,
      size: metadata.size,
      lastModified: new Date(metadata.lastModified),
      content: new Blob([decryptedContent], { type: metadata.type }),
      folderId: null,
      encrypted: false,
      externalSource: {
        type: "pv",
        path: pvFile.name,
        lastAccessed: new Date(),
      },
    }

    console.log("Large PV file import successful")
    return { success: true, file: decryptedFile as FileItem }
  } catch (error) {
    console.error("Error importing large PV file:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error importing large PV file",
    }
  }
}

// Derive a unique IV for a segment based on the base IV and segment index
function deriveSegmentIv(baseIv: Uint8Array, segmentIndex: number): Uint8Array {
  // Create a new IV by XORing the last 4 bytes of the base IV with the segment index
  const segmentIv = new Uint8Array(baseIv)
  const indexBytes = new Uint8Array(4)

  // Convert segment index to bytes
  indexBytes[0] = (segmentIndex >> 24) & 0xff
  indexBytes[1] = (segmentIndex >> 16) & 0xff
  indexBytes[2] = (segmentIndex >> 8) & 0xff
  indexBytes[3] = segmentIndex & 0xff

  // XOR the last 4 bytes of the IV with the segment index bytes
  for (let i = 0; i < 4; i++) {
    segmentIv[segmentIv.length - 4 + i] ^= indexBytes[i]
  }

  return segmentIv
}

// New function to import very large PV files using streaming and Web Workers with segmented approach
export const importStreamingPVFile = async (
  pvFile: File,
): Promise<{ success: boolean; file?: FileItem; error?: string }> => {
  return new Promise(async (resolve) => {
    try {
      console.log("Starting segmented streaming PV file import for:", pvFile.name, "Size:", pvFile.size)

      // Create a copy of the file to prevent permission issues
      const fileCopy = new File([pvFile], pvFile.name, {
        type: pvFile.type,
        lastModified: pvFile.lastModified,
      })

      // First, read just the header portion to extract metadata
      const headerChunk = fileCopy.slice(0, 1024 * 1024)

      console.log("Reading header chunk...")
      const headerBuffer = await readFileAsArrayBuffer(headerChunk)
      const headerData = new Uint8Array(headerBuffer)

      // Check header
      const headerLength = PV_HEADER.length
      const header = new TextDecoder().decode(headerData.slice(0, headerLength))

      if (header !== PV_HEADER) {
        console.error("Invalid PV file format")
        resolve({ success: false, error: "Invalid PV file format" })
        return
      }

      // Extract salt, IV, and metadata
      let offset = headerLength
      const salt = headerData.slice(offset, offset + SALT_LENGTH)
      offset += SALT_LENGTH

      const iv = headerData.slice(offset, offset + IV_LENGTH)
      offset += IV_LENGTH

      // Read metadata length (4 bytes)
      const metadataLength = new Uint32Array(headerData.slice(offset, offset + 4).buffer)[0]
      offset += 4

      // Read metadata
      const metadataBytes = headerData.slice(offset, offset + metadataLength)
      const metadataString = new TextDecoder().decode(metadataBytes)
      const metadata = JSON.parse(metadataString)

      console.log("Extracted metadata:", {
        name: metadata.name,
        type: metadata.type,
        size: metadata.size,
      })

      // Calculate the total header size
      const totalHeaderSize = headerLength + SALT_LENGTH + IV_LENGTH + 4 + metadataLength

      // Get the seed phrase
      console.log("Getting seed phrase...")
      const seedPhrase = await getSeedPhrase()

      // Create a Web Worker for decryption
      console.log("Creating Web Worker for decryption...")
      const worker = new Worker(new URL("./workers/pv-decrypt-worker.ts", import.meta.url), { type: "module" })

      // Create a writable stream to collect the decrypted segments
      const decryptedSegments: ArrayBuffer[] = []
      let error: string | null = null

      // Set up worker message handler
      worker.onmessage = (event) => {
        const { type, ...payload } = event.data

        switch (type) {
          case "initialized":
            console.log("Worker initialized, starting segment processing...")
            processNextSegment(0)
            break

          case "segmentDecrypted":
            // Add the decrypted segment to our collection
            if (payload.decryptedSegment) {
              console.log(`Segment ${payload.segmentIndex} decrypted successfully`)

              // Store the segment at the correct index
              while (decryptedSegments.length <= payload.segmentIndex) {
                decryptedSegments.push(new ArrayBuffer(0))
              }
              decryptedSegments[payload.segmentIndex] = payload.decryptedSegment

              // Process the next segment or finish
              if (payload.isLast) {
                finishProcessing()
              } else {
                processNextSegment(payload.segmentIndex + 1)
              }
            }
            break

          case "progress":
            // Update progress if needed
            if (payload.bytesProcessed) {
              console.log(`Decryption progress: ${payload.bytesProcessed} bytes`)
            }
            break

          case "error":
            console.error("Worker error:", payload.error || "Unknown worker error")
            error = payload.error || "Unknown worker error"
            finishProcessing()
            break

          case "finished":
            console.log("Worker finished")
            break

          default:
            console.warn("Unknown message type from worker:", type)
        }
      }

      // Initialize the worker
      try {
        worker.postMessage({
          type: "init",
          data: {
            seedPhrase,
            salt: Array.from(salt),
            iv: Array.from(iv),
            metadata,
          },
        })
      } catch (err) {
        console.error("Error initializing worker:", err)
        error = err instanceof Error ? err.message : "Unknown error initializing worker"
        finishProcessing()
      }

      // Calculate the total ciphertext size and number of segments
      const ciphertextSize = fileCopy.size - totalHeaderSize
      const numSegments = Math.ceil(ciphertextSize / MAX_SEGMENT_SIZE)
      console.log(`File will be processed in ${numSegments} segments`)

      // Function to process a segment of the file
      async function processNextSegment(segmentIndex: number) {
        try {
          // Calculate segment boundaries
          const segmentStart = totalHeaderSize + segmentIndex * MAX_SEGMENT_SIZE
          const segmentEnd = Math.min(segmentStart + MAX_SEGMENT_SIZE, fileCopy.size)
          const isLast = segmentEnd === fileCopy.size

          console.log(`Processing segment ${segmentIndex + 1}/${numSegments}: ${segmentStart} to ${segmentEnd}`)

          // Read the segment
          const segmentBuffer = await readFileSliceAsArrayBuffer(fileCopy, segmentStart, segmentEnd)

          // Send the segment to the worker for decryption
          worker.postMessage(
            {
              type: "segment",
              data: {
                segment: segmentBuffer,
                segmentIndex,
                isLast,
              },
            },
            [segmentBuffer],
          )
        } catch (err) {
          console.error(`Error processing segment ${segmentIndex}:`, err)
          error = err instanceof Error ? err.message : "Unknown error processing segment"
          finishProcessing()
        }
      }

      // Function to finish processing and clean up
      function finishProcessing() {
        try {
          // Terminate the worker
          worker.terminate()

          if (error) {
            resolve({
              success: false,
              error: `Decryption failed: ${error}`,
            })
            return
          }

          // Filter out empty segments and combine all decrypted segments
          const validSegments = decryptedSegments.filter((segment) => segment.byteLength > 0)
          console.log(`Combining ${validSegments.length} decrypted segments...`)

          // Create a blob from all segments
          const decryptedContent = new Blob(validSegments, { type: metadata.type })

          // Create a file item from the decrypted content
          const decryptedFile: Omit<FileItem, "id"> = {
            name: metadata.originalFilename || metadata.name,
            type: metadata.type,
            size: metadata.size,
            lastModified: new Date(metadata.lastModified),
            content: decryptedContent,
            folderId: null,
            encrypted: false,
            externalSource: {
              type: "pv",
              path: pvFile.name,
              lastAccessed: new Date(),
            },
          }

          console.log("Segmented streaming PV file import successful")
          resolve({ success: true, file: decryptedFile as FileItem })
        } catch (err) {
          console.error("Error finishing processing:", err)
          resolve({
            success: false,
            error: err instanceof Error ? err.message : "Unknown error finishing processing",
          })
        }
      }
    } catch (error) {
      console.error("Error in streaming PV file import:", error)
      resolve({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error in streaming PV file import",
      })
    }
  })
}

// Validate if a file is a PV file
export const isPVFile = (file: File): boolean => {
  return file.name.toLowerCase().endsWith(".pv") || file.type === "application/x-pv-encrypted"
}

// Generate a random filename for PV export
export const generatePVFilename = (): string => {
  // Generate a random hash-like string (16 characters)
  const randomChars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  const randomValues = new Uint8Array(16)
  crypto.getRandomValues(randomValues)

  for (let i = 0; i < 16; i++) {
    result += randomChars[randomValues[i] % randomChars.length]
  }

  return `${result}.pv`
}

// Get decryption attempts remaining
export const getDecryptionAttemptsRemaining = (): number => {
  const attempts = localStorage.getItem("pvDecryptionAttempts")
  if (!attempts) {
    return 5 // Default max attempts
  }

  const { count, timestamp } = JSON.parse(attempts)

  // Reset counter if it's been more than an hour
  if (Date.now() - timestamp > 3600000) {
    return 5
  }

  return Math.max(0, 5 - count)
}

// Record a decryption attempt
export const recordDecryptionAttempt = (success: boolean): void => {
  const attempts = localStorage.getItem("pvDecryptionAttempts")
  let data = { count: 0, timestamp: Date.now() }

  if (attempts) {
    data = JSON.parse(attempts)

    // Reset counter if it's been more than an hour
    if (Date.now() - data.timestamp > 3600000) {
      data = { count: 0, timestamp: Date.now() }
    }
  }

  // Only increment counter for failed attempts
  if (!success) {
    data.count++
  } else {
    // Reset counter on successful attempt
    data.count = 0
  }

  localStorage.setItem("pvDecryptionAttempts", JSON.stringify(data))
}

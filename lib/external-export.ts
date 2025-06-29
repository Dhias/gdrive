// External folder export functionality
import { getFileContent } from "@/lib/db"
import type { FileItem } from "@/lib/types"
import { exportFileToPV, generatePVFilename } from "@/lib/pv-format"

// Check if File System Access API is supported
export const isFileSystemAccessSupported = (): boolean => {
  return "showDirectoryPicker" in window && "showOpenFilePicker" in window
}

// Export a single file to an external folder
export const exportFileToExternalFolder = async (file: FileItem): Promise<boolean> => {
  try {
    // Get file content from IndexedDB
    const encryptedContent = await getFileContent(file.id)

    // Decrypt the file if it's encrypted
    let content = encryptedContent
    if (file.encrypted) {
      content = await decryptFile(encryptedContent, file)
    }

    if (isFileSystemAccessSupported()) {
      // Use File System Access API
      return await exportUsingFileSystemAPI(file, content)
    } else {
      // Fallback for browsers without File System Access API
      return exportUsingDownload(file, content)
    }
  } catch (error) {
    console.error("Error exporting file:", error)
    return false
  }
}

// Export a single file to an external folder as PV format
export const exportFileToPVExternalFolder = async (file: FileItem): Promise<boolean> => {
  try {
    // For large files, use a different approach to avoid memory issues
    if (file.size > 50 * 1024 * 1024) {
      // 50MB threshold
      return await exportLargePVFileToExternalFolder(file)
    }

    // For smaller files, use the standard approach
    // Export the file to PV format
    const pvBlob = await exportFileToPV(file)

    // Generate a random filename for the PV file
    const pvFilename = generatePVFilename()

    if (isFileSystemAccessSupported()) {
      // Use File System Access API
      try {
        // Use File System Access API to select a directory
        const dirHandle = await window.showDirectoryPicker()

        // Create a file in the selected directory
        const fileHandle = await dirHandle.getFileHandle(pvFilename, { create: true })
        const writable = await fileHandle.createWritable()

        // Write the file
        await writable.write(pvBlob)
        await writable.close()

        return true
      } catch (error) {
        console.error("Error using File System Access API:", error)
        // If user cancels the directory picker, don't show error
        if (error instanceof Error && error.name === "AbortError") {
          return false
        }
        // Fall back to download method
        return exportUsingDownload({ ...file, name: pvFilename, type: "application/x-pv-encrypted" }, pvBlob)
      }
    } else {
      // Fallback for browsers without File System Access API
      return exportUsingDownload({ ...file, name: pvFilename, type: "application/x-pv-encrypted" }, pvBlob)
    }
  } catch (error) {
    console.error("Error exporting file as PV:", error)
    return false
  }
}

// New function to handle large PV file exports
const exportLargePVFileToExternalFolder = async (file: FileItem): Promise<boolean> => {
  try {
    // Generate a random filename for the PV file
    const pvFilename = generatePVFilename()

    if (!isFileSystemAccessSupported()) {
      // For browsers without File System Access API, we can't efficiently handle large files
      // Show a warning and fall back to regular export
      console.warn("Large file export not supported in this browser. Falling back to regular download.")
      const pvBlob = await exportFileToPV(file)
      return exportUsingDownload({ ...file, name: pvFilename, type: "application/x-pv-encrypted" }, pvBlob)
    }

    // Use File System Access API to select a directory
    const dirHandle = await window.showDirectoryPicker()

    // Create a file in the selected directory
    const fileHandle = await dirHandle.getFileHandle(pvFilename, { create: true })
    const writable = await fileHandle.createWritable()

    // Get file content from IndexedDB
    const encryptedContent = await getFileContent(file.id)

    // Decrypt the file if it's encrypted in the database
    let fileContent: Blob
    if (file.encrypted) {
      fileContent = await decryptFile(encryptedContent, file)
    } else {
      fileContent = encryptedContent
    }

    // Get the seed phrase and prepare encryption
    const { getSeedPhrase, deriveKeyFromSeedPhrase } = await import("@/lib/pv-format")
    const seedPhrase = await getSeedPhrase()

    // Generate a random salt and IV
    const SALT_LENGTH = 16
    const IV_LENGTH = 12
    const PV_HEADER = "PVENC01"

    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

    // Derive encryption key from seed phrase and salt
    const encryptionKey = await deriveKeyFromSeedPhrase(seedPhrase, salt)

    // Prepare metadata
    const metadata = {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified.getTime(),
      originalFilename: file.name,
    }

    // Serialize metadata
    const metadataString = JSON.stringify(metadata)
    const metadataBuffer = new TextEncoder().encode(metadataString)

    // Create the PV file structure header
    const headerBuffer = new TextEncoder().encode(PV_HEADER)
    const metadataLengthBuffer = new Uint32Array([metadataBuffer.length])

    // Write the header first
    const headerView = new Uint8Array(headerBuffer.length + salt.length + iv.length + 4 + metadataBuffer.length)

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

    // Write the header to the file
    await writable.write(headerView)

    // Process the file content in chunks
    const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB chunks for processing
    const fileSize = fileContent.size
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE)

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

      // Write the encrypted chunk to the file
      await writable.write(new Uint8Array(encryptedChunk))

      // Add a small delay to prevent UI freezing
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    // Close the file
    await writable.close()
    return true
  } catch (error) {
    console.error("Error exporting large PV file:", error)
    return false
  }
}

// Export multiple files to an external folder
export const exportFilesToExternalFolder = async (
  files: FileItem[],
  asPV = false,
): Promise<{ success: number; failed: number }> => {
  if (!isFileSystemAccessSupported()) {
    // For browsers without File System Access API, export one by one
    let success = 0
    let failed = 0

    for (const file of files) {
      const result = asPV ? await exportFileToPVExternalFolder(file) : await exportFileToExternalFolder(file)

      if (result) {
        success++
      } else {
        failed++
      }
    }

    return { success, failed }
  }

  try {
    // Use File System Access API to select a directory
    const dirHandle = await window.showDirectoryPicker()

    let success = 0
    let failed = 0

    for (const file of files) {
      try {
        if (asPV) {
          // For large files, use the specialized function
          if (file.size > 50 * 1024 * 1024) {
            // Use the specialized large file export function
            const result = await exportLargePVFileToFolder(file, dirHandle)
            if (result) {
              success++
            } else {
              failed++
            }
            continue
          }

          // For smaller files, use the standard approach
          // Export as PV file
          const pvBlob = await exportFileToPV(file)

          // Generate a random filename for the PV file
          const pvFilename = generatePVFilename()

          // Create a file in the selected directory
          const fileHandle = await dirHandle.getFileHandle(pvFilename, { create: true })
          const writable = await fileHandle.createWritable()

          // Write the file
          await writable.write(pvBlob)
          await writable.close()
        } else {
          // Get file content from IndexedDB
          const encryptedContent = await getFileContent(file.id)

          // Decrypt the file if it's encrypted
          let content = encryptedContent
          if (file.encrypted) {
            content = await decryptFile(encryptedContent, file)
          }

          // Create a file in the selected directory
          const fileHandle = await dirHandle.getFileHandle(file.name, { create: true })
          const writable = await fileHandle.createWritable()

          // For large files, use chunked writing
          if (content.size > 50 * 1024 * 1024) {
            // 50MB threshold
            const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB chunks
            const totalChunks = Math.ceil(content.size / CHUNK_SIZE)

            for (let i = 0; i < totalChunks; i++) {
              const start = i * CHUNK_SIZE
              const end = Math.min(start + CHUNK_SIZE, content.size)
              const chunk = content.slice(start, end)

              await writable.write(chunk)

              // Add a small delay to prevent UI freezing
              await new Promise((resolve) => setTimeout(resolve, 10))
            }
          } else {
            // For smaller files, write all at once
            await writable.write(content)
          }

          await writable.close()
        }

        success++
      } catch (error) {
        console.error(`Error exporting file ${file.name}:`, error)
        failed++
      }
    }

    return { success, failed }
  } catch (error) {
    console.error("Error exporting files:", error)
    return { success: 0, failed: files.length }
  }
}

// New function to handle large PV file exports to a specific folder
const exportLargePVFileToFolder = async (file: FileItem, dirHandle: FileSystemDirectoryHandle): Promise<boolean> => {
  try {
    // Generate a random filename for the PV file
    const pvFilename = generatePVFilename()

    // Create a file in the selected directory
    const fileHandle = await dirHandle.getFileHandle(pvFilename, { create: true })
    const writable = await fileHandle.createWritable()

    // Get file content from IndexedDB
    const encryptedContent = await getFileContent(file.id)

    // Decrypt the file if it's encrypted in the database
    let fileContent: Blob
    if (file.encrypted) {
      fileContent = await decryptFile(encryptedContent, file)
    } else {
      fileContent = encryptedContent
    }

    // Get the seed phrase and prepare encryption
    const { getSeedPhrase, deriveKeyFromSeedPhrase } = await import("@/lib/pv-format")
    const seedPhrase = await getSeedPhrase()

    // Generate a random salt and IV
    const SALT_LENGTH = 16
    const IV_LENGTH = 12
    const PV_HEADER = "PVENC01"

    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

    // Derive encryption key from seed phrase and salt
    const encryptionKey = await deriveKeyFromSeedPhrase(seedPhrase, salt)

    // Prepare metadata
    const metadata = {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified.getTime(),
      originalFilename: file.name,
    }

    // Serialize metadata
    const metadataString = JSON.stringify(metadata)
    const metadataBuffer = new TextEncoder().encode(metadataString)

    // Create the PV file structure header
    const headerBuffer = new TextEncoder().encode(PV_HEADER)
    const metadataLengthBuffer = new Uint32Array([metadataBuffer.length])

    // Write the header first
    const headerView = new Uint8Array(headerBuffer.length + salt.length + iv.length + 4 + metadataBuffer.length)

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

    // Write the header to the file
    await writable.write(headerView)

    // Process the file content in chunks
    const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB chunks for processing
    const fileSize = fileContent.size
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE)

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

      // Write the encrypted chunk to the file
      await writable.write(new Uint8Array(encryptedChunk))

      // Add a small delay to prevent UI freezing
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    // Close the file
    await writable.close()
    return true
  } catch (error) {
    console.error("Error exporting large PV file to folder:", error)
    return false
  }
}

// Update the exportUsingFileSystemAPI function to handle large files with chunking
const exportUsingFileSystemAPI = async (file: FileItem, content: Blob): Promise<boolean> => {
  try {
    // Use File System Access API to select a directory
    const dirHandle = await window.showDirectoryPicker()

    // Create a file in the selected directory
    const fileHandle = await dirHandle.getFileHandle(file.name, { create: true })
    const writable = await fileHandle.createWritable()

    // For large files, use chunked writing
    if (content.size > 50 * 1024 * 1024) {
      // 50MB threshold
      const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB chunks
      const totalChunks = Math.ceil(content.size / CHUNK_SIZE)

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, content.size)
        const chunk = content.slice(start, end)

        await writable.write(chunk)

        // Add a small delay to prevent UI freezing
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    } else {
      // For smaller files, write all at once
      await writable.write(content)
    }

    await writable.close()
    return true
  } catch (error) {
    console.error("Error using File System Access API:", error)
    return false
  }
}

// Fallback export using download
const exportUsingDownload = (file: FileItem, content: Blob): boolean => {
  try {
    const url = URL.createObjectURL(content)
    const a = document.createElement("a")
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    return true
  } catch (error) {
    console.error("Error using download fallback:", error)
    return false
  }
}

// Decrypt file using Web Crypto API
const decryptFile = async (encryptedBlob: Blob, file: FileItem): Promise<Blob> => {
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
    return new Blob([decryptedBuffer], { type: file.type })
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

// Update the exportFilesToSpecificFolder function to handle large PV files
export const exportFilesToSpecificFolder = async (
  files: FileItem[],
  folderHandle: FileSystemDirectoryHandle,
  asPV = false,
): Promise<{ success: number; failed: number }> => {
  let success = 0
  let failed = 0

  for (const file of files) {
    try {
      if (asPV) {
        // For large files, use the specialized function
        if (file.size > 50 * 1024 * 1024) {
          const result = await exportLargePVFileToFolder(file, folderHandle)
          if (result) {
            success++
          } else {
            failed++
          }
          continue
        }

        // For smaller files, use the standard approach
        // Export as PV file
        const pvBlob = await exportFileToPV(file)

        // Generate a random filename for the PV file
        const pvFilename = generatePVFilename()

        // Create a file in the specified directory
        const fileHandle = await folderHandle.getFileHandle(pvFilename, { create: true })
        const writable = await fileHandle.createWritable()

        // Write the file
        await writable.write(pvBlob)
        await writable.close()
      } else {
        // Get file content from IndexedDB
        const encryptedContent = await getFileContent(file.id)

        // Decrypt the file if it's encrypted
        let content = encryptedContent
        if (file.encrypted) {
          content = await decryptFile(encryptedContent, file)
        }

        // Create a file in the specified directory
        const fileHandle = await folderHandle.getFileHandle(file.name, { create: true })
        const writable = await fileHandle.createWritable()

        // For large files, use chunked writing
        if (content.size > 50 * 1024 * 1024) {
          // 50MB threshold
          const CHUNK_SIZE = 5 * 1024 * 1024 // 5MB chunks
          const totalChunks = Math.ceil(content.size / CHUNK_SIZE)

          for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE
            const end = Math.min(start + CHUNK_SIZE, content.size)
            const chunk = content.slice(start, end)

            await writable.write(chunk)

            // Add a small delay to prevent UI freezing
            await new Promise((resolve) => setTimeout(resolve, 10))
          }
        } else {
          // For smaller files, write all at once
          await writable.write(content)
        }

        await writable.close()
      }

      success++
    } catch (error) {
      console.error(`Error exporting file ${file.name}:`, error)
      failed++
    }
  }

  return { success, failed }
}

// Save folder handle for future use
export const saveFolderHandle = async (handle: FileSystemDirectoryHandle, name: string): Promise<void> => {
  try {
    // Store the folder handle in IndexedDB for future use
    const db = await openFolderHandleDB()
    const transaction = db.transaction(["folderHandles"], "readwrite")
    const store = transaction.objectStore("folderHandles")

    await new Promise<void>((resolve, reject) => {
      const request = store.put({
        handle,
        name,
        addedAt: new Date(),
      })

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })

    db.close()
  } catch (error) {
    console.error("Error saving folder handle:", error)
    throw error
  }
}

// Get saved folder handles
export const getSavedFolderHandles = async (): Promise<
  { handle: FileSystemDirectoryHandle; name: string; addedAt: Date }[]
> => {
  try {
    const db = await openFolderHandleDB()
    const transaction = db.transaction(["folderHandles"], "readonly")
    const store = transaction.objectStore("folderHandles")

    const handles = await new Promise<{ handle: FileSystemDirectoryHandle; name: string; addedAt: Date }[]>(
      (resolve, reject) => {
        const request = store.getAll()

        request.onsuccess = () => {
          const results = request.result || []
          resolve(
            results.map((item) => ({
              ...item,
              addedAt: new Date(item.addedAt),
            })),
          )
        }

        request.onerror = () => reject(request.error)
      },
    )

    db.close()
    return handles
  } catch (error) {
    console.error("Error getting saved folder handles:", error)
    return []
  }
}

// Open folder handle database
const openFolderHandleDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ExternalFolderHandlesDB", 1)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains("folderHandles")) {
        db.createObjectStore("folderHandles", { keyPath: "name" })
      }
    }

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result)
    }

    request.onerror = () => {
      reject(new Error("Failed to open folder handles database"))
    }
  })
}

// Verify permission for a folder handle
export const verifyFolderPermission = async (handle: FileSystemDirectoryHandle): Promise<boolean> => {
  try {
    // Check if we still have permission to access the folder
    const options = { mode: "readwrite" } as const
    const state = await handle.queryPermission(options)

    if (state === "granted") {
      return true
    }

    // Request permission if not already granted
    const requestState = await handle.requestPermission(options)
    return requestState === "granted"
  } catch (error) {
    console.error("Error verifying folder permission:", error)
    return false
  }
}

// Update the getMimeTypeFromExtension function to include ISO and other binary formats
const getMimeTypeFromExtension = (filename: string): string => {
  const ext = filename.split(".").pop()?.toLowerCase()
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    csv: "text/csv",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "text/javascript",
    json: "application/json",
    xml: "application/xml",
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    pv: "application/x-pv-encrypted",
    // Add ISO and other binary formats
    iso: "application/x-iso9660-image",
    bin: "application/octet-stream",
    img: "application/octet-stream",
    dmg: "application/x-apple-diskimage",
    vhd: "application/x-virtualbox-vhd",
    vmdk: "application/x-vmdk",
    exe: "application/x-msdownload",
    dll: "application/x-msdownload",
    msi: "application/x-msi",
  }

  return ext && ext in mimeTypes ? mimeTypes[ext] : "application/octet-stream"
}

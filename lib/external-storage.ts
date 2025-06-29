// External storage integration
import { addFile } from "@/lib/db"
import type { ExternalSource } from "@/lib/types"

// Check if File System Access API is supported
export const isFileSystemAccessSupported = (): boolean => {
  return "showDirectoryPicker" in window && "showOpenFilePicker" in window
}

// Import files from system
export const importFilesFromSystem = async (
  folderId: number | null = null,
  fileFilter?: (file: File) => boolean,
): Promise<{ success: boolean; count: number; error?: string }> => {
  try {
    if (!isFileSystemAccessSupported()) {
      // Fallback for browsers without File System Access API
      return await importUsingFileInput(folderId, fileFilter)
    }

    // Use File System Access API
    const fileHandles = await window.showOpenFilePicker({
      multiple: true,
    })

    if (fileHandles.length === 0) {
      return { success: true, count: 0 }
    }

    let importedCount = 0

    for (const fileHandle of fileHandles) {
      try {
        const file = await fileHandle.getFile()

        // Apply filter if provided
        if (fileFilter && !fileFilter(file)) {
          continue
        }

        // Create external source metadata
        const externalSource: ExternalSource = {
          type: "file",
          path: file.name,
          lastAccessed: new Date(),
        }

        // Add file to IndexedDB
        await addFile({
          name: file.name,
          type: file.type || getMimeTypeFromExtension(file.name),
          size: file.size,
          lastModified: new Date(file.lastModified),
          content: file,
          folderId,
          encrypted: false,
          externalSource,
        })

        importedCount++
      } catch (error) {
        console.error("Error importing file:", error)
      }
    }

    return { success: true, count: importedCount }
  } catch (error) {
    console.error("Error importing files:", error)
    // Don't show error for user cancellation
    if (error instanceof Error && error.name === "AbortError") {
      return { success: true, count: 0 }
    }
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// Import directory from system
export const importDirectoryFromSystem = async (
  folderId: number | null = null,
  fileFilter?: (file: File) => boolean,
): Promise<{ success: boolean; count: number; error?: string }> => {
  try {
    if (!isFileSystemAccessSupported()) {
      return { success: false, error: "File System Access API not supported" }
    }

    // Use File System Access API to select a directory
    const dirHandle = await window.showDirectoryPicker()

    // Process the directory
    const result = await processDirectory(dirHandle, "", folderId, fileFilter)

    return { success: true, count: result.count }
  } catch (error) {
    console.error("Error importing directory:", error)
    // Don't show error for user cancellation
    if (error instanceof Error && error.name === "AbortError") {
      return { success: true, count: 0 }
    }
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// Process directory recursively
const processDirectory = async (
  dirHandle: FileSystemDirectoryHandle,
  path: string,
  folderId: number | null,
  fileFilter?: (file: File) => boolean,
): Promise<{ count: number }> => {
  let count = 0

  for await (const [name, handle] of dirHandle.entries()) {
    const newPath = path ? `${path}/${name}` : name

    if (handle.kind === "file") {
      try {
        const file = await handle.getFile()

        // Apply filter if provided
        if (fileFilter && !fileFilter(file)) {
          continue
        }

        // Create external source metadata
        const externalSource: ExternalSource = {
          type: "directory",
          path: newPath,
          lastAccessed: new Date(),
        }

        // Add file to IndexedDB
        await addFile({
          name: file.name,
          type: file.type || getMimeTypeFromExtension(file.name),
          size: file.size,
          lastModified: new Date(file.lastModified),
          content: file,
          folderId,
          encrypted: false,
          externalSource,
        })

        count++
      } catch (error) {
        console.error(`Error processing file ${newPath}:`, error)
      }
    } else if (handle.kind === "directory") {
      // Process subdirectory
      const subResult = await processDirectory(handle, newPath, folderId, fileFilter)
      count += subResult.count
    }
  }

  return { count }
}

// Fallback import using file input
const importUsingFileInput = async (
  folderId: number | null,
  fileFilter?: (file: File) => boolean,
): Promise<{ success: boolean; count: number; error?: string }> => {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.multiple = true

    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files
      if (!files || files.length === 0) {
        resolve({ success: true, count: 0 })
        return
      }

      let importedCount = 0

      for (let i = 0; i < files.length; i++) {
        const file = files[i]

        // Apply filter if provided
        if (fileFilter && !fileFilter(file)) {
          continue
        }

        try {
          // Create external source metadata
          const externalSource: ExternalSource = {
            type: "file",
            path: file.name,
            lastAccessed: new Date(),
          }

          // Add file to IndexedDB
          await addFile({
            name: file.name,
            type: file.type || getMimeTypeFromExtension(file.name),
            size: file.size,
            lastModified: new Date(file.lastModified),
            content: file,
            folderId,
            encrypted: false,
            externalSource,
          })

          importedCount++
        } catch (error) {
          console.error("Error importing file:", error)
        }
      }

      resolve({ success: true, count: importedCount })
    }

    input.onerror = () => {
      resolve({ success: false, error: "File selection failed" })
    }

    input.click()
  })
}

// Export file to system
export const exportFileToSystem = async (fileId: number, fileName: string, content: Blob): Promise<boolean> => {
  try {
    if (isFileSystemAccessSupported()) {
      // Use File System Access API
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: fileName,
      })

      const writable = await fileHandle.createWritable()
      await writable.write(content)
      await writable.close()

      return true
    } else {
      // Fallback for browsers without File System Access API
      const url = URL.createObjectURL(content)
      const a = document.createElement("a")
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      return true
    }
  } catch (error) {
    console.error("Error exporting file:", error)
    // Don't show error for user cancellation
    if (error instanceof Error && error.name === "AbortError") {
      return false
    }
    return false
  }
}

// Check storage persistence
export const checkStoragePersistence = async (): Promise<boolean> => {
  if (navigator.storage && navigator.storage.persisted) {
    return await navigator.storage.persisted()
  }
  return false
}

// Request storage persistence
export const requestStoragePersistence = async (): Promise<boolean> => {
  if (navigator.storage && navigator.storage.persist) {
    return await navigator.storage.persist()
  }
  return false
}

// Get storage estimate
export const getStorageEstimate = async (): Promise<{ quota: number; usage: number; available: number }> => {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate()
    const quota = estimate.quota || 0
    const usage = estimate.usage || 0
    return {
      quota,
      usage,
      available: quota - usage,
    }
  }
  return {
    quota: 0,
    usage: 0,
    available: 0,
  }
}

// Get MIME type from file extension
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
  }

  return ext && ext in mimeTypes ? mimeTypes[ext] : "application/octet-stream"
}

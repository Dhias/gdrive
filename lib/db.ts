// IndexedDB database implementation
import type { FileItem, Folder, StorageStats, TrashItem } from "@/lib/types"

const DB_NAME = "LocalDriveDB"
const DB_VERSION = 2 // Increased version for schema update
const FILE_STORE = "files"
const FOLDER_STORE = "folders"
const TRASH_STORE = "trash" // New store for trash items

// Initialize the database
export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = (event) => {
      reject("Database error: " + (event.target as IDBRequest).error)
    }

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      const oldVersion = event.oldVersion

      // Create files store if it doesn't exist
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        const fileStore = db.createObjectStore(FILE_STORE, { keyPath: "id", autoIncrement: true })
        fileStore.createIndex("folderId", "folderId", { unique: false })
        fileStore.createIndex("name", "name", { unique: false })
        fileStore.createIndex("type", "type", { unique: false })
      }

      // Create folders store if it doesn't exist
      if (!db.objectStoreNames.contains(FOLDER_STORE)) {
        const folderStore = db.createObjectStore(FOLDER_STORE, { keyPath: "id", autoIncrement: true })
        folderStore.createIndex("parentId", "parentId", { unique: false })
        folderStore.createIndex("name", "name", { unique: false })
      }

      // Create trash store if it doesn't exist (for version 2+)
      if (oldVersion < 2 && !db.objectStoreNames.contains(TRASH_STORE)) {
        const trashStore = db.createObjectStore(TRASH_STORE, { keyPath: "id", autoIncrement: true })
        trashStore.createIndex("originalId", "originalId", { unique: false })
        trashStore.createIndex("type", "type", { unique: false }) // 'file' or 'folder'
        trashStore.createIndex("deletedAt", "deletedAt", { unique: false })
      }
    }
  })
}

// Get database connection
const getDB = async (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = (event) => {
      reject("Database error: " + (event.target as IDBRequest).error)
    }

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result)
    }
  })
}

// File operations
export const saveFile = async (file: Omit<FileItem, "id">): Promise<number> => {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FILE_STORE], "readwrite")
    const store = transaction.objectStore(FILE_STORE)

    const request = store.add(file)

    request.onsuccess = (event) => {
      resolve((event.target as IDBRequest).result as number)
    }

    request.onerror = (event) => {
      reject("Error saving file: " + (event.target as IDBRequest).error)
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

export const getFiles = async (folderId: number | null = null): Promise<FileItem[]> => {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FILE_STORE], "readonly")
    const store = transaction.objectStore(FILE_STORE)
    const index = store.index("folderId")

    const request = index.getAll(folderId)

    request.onsuccess = (event) => {
      const files = (event.target as IDBRequest).result as FileItem[]
      // Convert lastModified from timestamp to Date if needed
      const processedFiles = files.map((file) => ({
        ...file,
        lastModified: file.lastModified instanceof Date ? file.lastModified : new Date(file.lastModified),
      }))
      resolve(processedFiles)
    }

    request.onerror = (event) => {
      reject("Error getting files: " + (event.target as IDBRequest).error)
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

export const getFileContent = async (fileId: number): Promise<Blob> => {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FILE_STORE], "readonly")
    const store = transaction.objectStore(FILE_STORE)

    const request = store.get(fileId)

    request.onsuccess = (event) => {
      const file = (event.target as IDBRequest).result as FileItem
      if (file) {
        resolve(file.content as Blob)
      } else {
        reject("File not found")
      }
    }

    request.onerror = (event) => {
      reject("Error getting file: " + (event.target as IDBRequest).error)
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

// Modified to move file to trash instead of deleting
export const deleteFile = async (fileId: number): Promise<void> => {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FILE_STORE, TRASH_STORE], "readwrite")
    const fileStore = transaction.objectStore(FILE_STORE)
    const trashStore = transaction.objectStore(TRASH_STORE)

    // First get the file to move to trash
    const getRequest = fileStore.get(fileId)

    getRequest.onsuccess = (event) => {
      const file = (event.target as IDBRequest).result as FileItem
      if (file) {
        // Create trash item
        const trashItem: Omit<TrashItem, "id"> = {
          originalId: file.id,
          type: "file",
          name: file.name,
          content: file.content,
          size: file.size,
          fileType: file.type,
          folderId: file.folderId,
          deletedAt: new Date(),
          encrypted: file.encrypted || false,
        }

        // Add to trash
        const addTrashRequest = trashStore.add(trashItem)

        addTrashRequest.onsuccess = () => {
          // Now delete from files
          const deleteRequest = fileStore.delete(fileId)

          deleteRequest.onsuccess = () => {
            resolve()
          }

          deleteRequest.onerror = (event) => {
            reject("Error deleting file: " + (event.target as IDBRequest).error)
          }
        }

        addTrashRequest.onerror = (event) => {
          reject("Error moving file to trash: " + (event.target as IDBRequest).error)
        }
      } else {
        reject("File not found")
      }
    }

    getRequest.onerror = (event) => {
      reject("Error getting file: " + (event.target as IDBRequest).error)
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

// Permanently delete a file (bypass trash)
export const permanentlyDeleteFile = async (fileId: number): Promise<void> => {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FILE_STORE], "readwrite")
    const store = transaction.objectStore(FILE_STORE)

    const request = store.delete(fileId)

    request.onsuccess = () => {
      resolve()
    }

    request.onerror = (event) => {
      reject("Error deleting file: " + (event.target as IDBRequest).error)
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

export const updateFileName = async (fileId: number, newName: string): Promise<void> => {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FILE_STORE], "readwrite")
    const store = transaction.objectStore(FILE_STORE)

    const getRequest = store.get(fileId)

    getRequest.onsuccess = (event) => {
      const file = (event.target as IDBRequest).result as FileItem
      if (file) {
        file.name = newName
        const updateRequest = store.put(file)

        updateRequest.onsuccess = () => {
          resolve()
        }

        updateRequest.onerror = (event) => {
          reject("Error updating file: " + (event.target as IDBRequest).error)
        }
      } else {
        reject("File not found")
      }
    }

    getRequest.onerror = (event) => {
      reject("Error getting file: " + (event.target as IDBRequest).error)
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

// Add this new function to get all files regardless of folder
export const getAllFiles = async (): Promise<FileItem[]> => {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FILE_STORE], "readonly")
    const store = transaction.objectStore(FILE_STORE)

    const request = store.getAll()

    request.onsuccess = (event) => {
      const files = (event.target as IDBRequest).result as FileItem[]
      // Convert lastModified from timestamp to Date if needed
      const processedFiles = files.map((file) => ({
        ...file,
        lastModified: file.lastModified instanceof Date ? file.lastModified : new Date(file.lastModified),
      }))
      resolve(processedFiles)
    }

    request.onerror = (event) => {
      reject("Error getting files: " + (event.target as IDBRequest).error)
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

// Add this new function to move a file to a different folder
export const moveFile = async (fileId: number, newFolderId: number | null): Promise<void> => {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FILE_STORE], "readwrite")
    const store = transaction.objectStore(FILE_STORE)

    const getRequest = store.get(fileId)

    getRequest.onsuccess = (event) => {
      const file = (event.target as IDBRequest).result as FileItem
      if (file) {
        file.folderId = newFolderId
        const updateRequest = store.put(file)

        updateRequest.onsuccess = () => {
          resolve()
        }

        updateRequest.onerror = (event) => {
          reject("Error updating file: " + (event.target as IDBRequest).error)
        }
      } else {
        reject("File not found")
      }
    }

    getRequest.onerror = (event) => {
      reject("Error getting file: " + (event.target as IDBRequest).error)
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

// Folder operations
export const createFolder = async (name: string, parentId: number | null = null): Promise<number> => {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FOLDER_STORE], "readwrite")
    const store = transaction.objectStore(FOLDER_STORE)

    const folder = {
      name,
      parentId,
      createdAt: new Date(),
    }

    const request = store.add(folder)

    request.onsuccess = (event) => {
      resolve((event.target as IDBRequest).result as number)
    }

    request.onerror = (event) => {
      reject("Error creating folder: " + (event.target as IDBRequest).error)
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

export const getFolders = async (): Promise<Folder[]> => {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FOLDER_STORE], "readonly")
    const store = transaction.objectStore(FOLDER_STORE)

    const request = store.getAll()

    request.onsuccess = (event) => {
      const folders = (event.target as IDBRequest).result as Folder[]
      // Convert createdAt from timestamp to Date if needed
      const processedFolders = folders.map((folder) => ({
        ...folder,
        createdAt: folder.createdAt instanceof Date ? folder.createdAt : new Date(folder.createdAt),
      }))
      resolve(processedFolders)
    }

    request.onerror = (event) => {
      reject("Error getting folders: " + (event.target as IDBRequest).error)
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

// Modified to move folder to trash instead of deleting
export const deleteFolder = async (folderId: number): Promise<void> => {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FOLDER_STORE, FILE_STORE, TRASH_STORE], "readwrite")
    const folderStore = transaction.objectStore(FOLDER_STORE)
    const fileStore = transaction.objectStore(FILE_STORE)
    const trashStore = transaction.objectStore(TRASH_STORE)
    const fileIndex = fileStore.index("folderId")

    // First get the folder to move to trash
    const getFolderRequest = folderStore.get(folderId)

    getFolderRequest.onsuccess = (event) => {
      const folder = (event.target as IDBRequest).result as Folder
      if (folder) {
        // Create trash item for the folder
        const trashItem: Omit<TrashItem, "id"> = {
          originalId: folder.id,
          type: "folder",
          name: folder.name,
          parentId: folder.parentId,
          deletedAt: new Date(),
          content: null,
          size: 0,
          fileType: "folder",
          folderId: null,
          encrypted: false,
        }

        // Add folder to trash
        trashStore.add(trashItem)

        // Get all files in the folder
        const fileRequest = fileIndex.getAll(folderId)

        fileRequest.onsuccess = (event) => {
          const files = (event.target as IDBRequest).result as FileItem[]

          // Move each file to trash
          files.forEach((file) => {
            const fileTrashItem: Omit<TrashItem, "id"> = {
              originalId: file.id,
              type: "file",
              name: file.name,
              content: file.content,
              size: file.size,
              fileType: file.type,
              folderId: file.folderId,
              deletedAt: new Date(),
              encrypted: file.encrypted || false,
            }

            trashStore.add(fileTrashItem)
            fileStore.delete(file.id)
          })

          // Delete the folder
          folderStore.delete(folderId)
        }
      } else {
        reject("Folder not found")
      }
    }

    transaction.oncomplete = () => {
      db.close()
      resolve()
    }

    transaction.onerror = (event) => {
      reject("Error deleting folder: " + (event.target as IDBRequest).error)
    }
  })
}

// Trash operations
export const getTrashItems = async (): Promise<TrashItem[]> => {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TRASH_STORE], "readonly")
    const store = transaction.objectStore(TRASH_STORE)

    const request = store.getAll()

    request.onsuccess = (event) => {
      const items = (event.target as IDBRequest).result as TrashItem[]
      // Convert deletedAt from timestamp to Date if needed
      const processedItems = items.map((item) => ({
        ...item,
        deletedAt: item.deletedAt instanceof Date ? item.deletedAt : new Date(item.deletedAt),
      }))
      resolve(processedItems)
    }

    request.onerror = (event) => {
      reject("Error getting trash items: " + (event.target as IDBRequest).error)
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

export const restoreFromTrash = async (trashId: number): Promise<void> => {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TRASH_STORE, FILE_STORE, FOLDER_STORE], "readwrite")
    const trashStore = transaction.objectStore(TRASH_STORE)
    const fileStore = transaction.objectStore(FILE_STORE)
    const folderStore = transaction.objectStore(FOLDER_STORE)

    const getRequest = trashStore.get(trashId)

    getRequest.onsuccess = (event) => {
      const trashItem = (event.target as IDBRequest).result as TrashItem
      if (trashItem) {
        if (trashItem.type === "file") {
          // Restore file
          const file: Omit<FileItem, "id"> = {
            name: trashItem.name,
            type: trashItem.fileType,
            size: trashItem.size,
            lastModified: new Date(),
            content: trashItem.content as Blob,
            folderId: trashItem.folderId,
            encrypted: trashItem.encrypted,
          }

          fileStore.add(file)
        } else if (trashItem.type === "folder") {
          // Restore folder
          const folder = {
            name: trashItem.name,
            parentId: trashItem.parentId,
            createdAt: new Date(),
          }

          folderStore.add(folder)
        }

        // Delete from trash
        trashStore.delete(trashId)
      } else {
        reject("Trash item not found")
      }
    }

    getRequest.onerror = (event) => {
      reject("Error getting trash item: " + (event.target as IDBRequest).error)
    }

    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
  })
}

export const deleteFromTrash = async (trashId: number): Promise<void> => {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TRASH_STORE], "readwrite")
    const store = transaction.objectStore(TRASH_STORE)

    const request = store.delete(trashId)

    request.onsuccess = () => {
      resolve()
    }

    request.onerror = (event) => {
      reject("Error deleting from trash: " + (event.target as IDBRequest).error)
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

export const emptyTrash = async (): Promise<void> => {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([TRASH_STORE], "readwrite")
    const store = transaction.objectStore(TRASH_STORE)

    const request = store.clear()

    request.onsuccess = () => {
      resolve()
    }

    request.onerror = (event) => {
      reject("Error emptying trash: " + (event.target as IDBRequest).error)
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

// Storage statistics
export const getStorageStats = async (): Promise<StorageStats> => {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FILE_STORE, TRASH_STORE], "readonly")
    const fileStore = transaction.objectStore(FILE_STORE)
    const trashStore = transaction.objectStore(TRASH_STORE)

    const fileRequest = fileStore.getAll()
    let totalSize = 0
    let fileCount = 0
    let trashSize = 0
    let trashCount = 0

    fileRequest.onsuccess = (event) => {
      const files = (event.target as IDBRequest).result as FileItem[]
      totalSize = files.reduce((acc, file) => acc + file.size, 0)
      fileCount = files.length

      // Now get trash stats
      const trashRequest = trashStore.getAll()

      trashRequest.onsuccess = (event) => {
        const trashItems = (event.target as IDBRequest).result as TrashItem[]
        trashSize = trashItems.reduce((acc, item) => acc + item.size, 0)
        trashCount = trashItems.length

        // Estimate available storage (browsers typically allow 50MB-1GB)
        // This is just an estimate as there's no reliable way to get actual quota
        const estimatedTotal = Math.max((totalSize + trashSize) * 2, 1024 * 1024 * 50) // At least 50MB

        resolve({
          used: totalSize,
          total: estimatedTotal,
          fileCount: fileCount,
          trashSize: trashSize,
          trashCount: trashCount,
        })
      }
    }

    fileRequest.onerror = (event) => {
      reject("Error getting storage stats: " + (event.target as IDBRequest).error)
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

export const clearAllData = async (): Promise<void> => {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    try {
      // Create a transaction that includes all object stores
      const transaction = db.transaction([FILE_STORE, FOLDER_STORE, TRASH_STORE], "readwrite")

      // Clear the files store
      const fileStore = transaction.objectStore(FILE_STORE)
      fileStore.clear()

      // Clear the folders store
      const folderStore = transaction.objectStore(FOLDER_STORE)
      folderStore.clear()

      // Clear the trash store
      const trashStore = transaction.objectStore(TRASH_STORE)
      trashStore.clear()

      transaction.oncomplete = () => {
        db.close()
        resolve()
      }

      transaction.onerror = (event) => {
        reject("Error clearing data: " + (event.target as IDBRequest).error)
      }
    } catch (error) {
      reject("Failed to clear data: " + error)
    }
  })
}

// Seed phrase verification functions
export const verifySeedPhrase = async (seedPhrase: string): Promise<boolean> => {
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
            resolve(false)
            return
          }

          // Get the encryption key
          const key = await getOrCreateEncryptionKey()

          // Decrypt the stored seed phrase
          const decryptedPhrase = await decryptData(encryptedData, key)

          // Compare with the provided seed phrase
          resolve(decryptedPhrase === seedPhrase)
        } catch (error) {
          console.error("Error verifying seed phrase:", error)
          resolve(false)
        }
      }

      getRequest.onerror = () => {
        console.error("Error getting seed phrase from IndexedDB")
        resolve(false)
      }

      transaction.oncomplete = () => {
        db.close()
      }
    }

    request.onerror = () => {
      console.error("Error opening security database")
      resolve(false)
    }
  })
}

// Get or create encryption key
export const getOrCreateEncryptionKey = async (): Promise<CryptoKey> => {
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

// Decrypt data using AES-256
export const decryptData = async (encryptedData: ArrayBuffer, key: CryptoKey): Promise<string> => {
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

export const addFile = async (file: Omit<FileItem, "id">): Promise<number> => {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FILE_STORE], "readwrite")
    const store = transaction.objectStore(FILE_STORE)

    const request = store.add(file)

    request.onsuccess = (event) => {
      resolve((event.target as IDBRequest).result as number)
    }

    request.onerror = (event) => {
      reject("Error saving file: " + (event.target as IDBRequest).error)
    }

    transaction.oncomplete = () => {
      db.close()
    }
  })
}

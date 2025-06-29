export interface FileItem {
  id: number
  name: string
  type: string
  size: number
  lastModified: Date
  content: Blob | File
  folderId: number | null
  encrypted?: boolean
  externalSource?: ExternalSource
}

export interface ExternalSource {
  type: "fileSystem" | "legacy" | "opfs"
  path?: string
  lastAccessed: Date
}

export interface Folder {
  id: number
  name: string
  parentId: number | null
  createdAt: Date
}

export interface TrashItem {
  id: number
  originalId: number
  type: "file" | "folder"
  name: string
  content: Blob | File | null
  size: number
  fileType: string
  folderId: number | null
  parentId?: number | null
  deletedAt: Date
  encrypted: boolean
  externalSource?: ExternalSource
}

export interface StorageStats {
  used: number
  total: number
  fileCount: number
  trashSize?: number
  trashCount?: number
  externalCount?: number
}

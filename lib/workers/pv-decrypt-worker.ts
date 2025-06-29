// Web Worker for PV file decryption
// This worker handles the decryption of PV files using a segmented approach

// Constants
const SALT_LENGTH = 16 // 16 bytes for salt
const IV_LENGTH = 12 // 12 bytes for IV
const ITERATION_COUNT = 100000 // Iterations for PBKDF2
const PV_HEADER = "PVENC01" // Header to identify PV files
const MAX_SEGMENT_SIZE = 1.5 * 1024 * 1024 * 1024 // 1.5GB max segment size (below 2GB limit)

// Message handler
self.onmessage = async (event: MessageEvent) => {
  const { type, data } = event.data || {}

  if (!type) {
    self.postMessage({
      type: "error",
      error: "Invalid message received: missing type",
    })
    return
  }

  try {
    switch (type) {
      case "init":
        // Initialize the worker with the seed phrase and metadata
        if (!data) {
          throw new Error("Missing initialization data")
        }
        await handleInit(data)
        break
      case "segment":
        // Process a segment of the ciphertext
        if (!data || !data.segment || data.segmentIndex === undefined) {
          throw new Error("Missing segment data or segment index")
        }
        await decryptSegment(data.segment, data.segmentIndex, data.isLast)
        break
      case "complete":
        // Finalize the decryption process
        await finalizeDecryption()
        break
      default:
        self.postMessage({
          type: "error",
          error: `Unknown message type: ${type}`,
        })
    }
  } catch (error) {
    console.error("Worker error:", error)
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "Unknown error in worker",
    })
  }
}

// Worker state
let decryptionKey: CryptoKey | null = null
let baseIv: Uint8Array | null = null
let metadata: any = null
let totalBytesProcessed = 0

// Initialize the worker with seed phrase and prepare for decryption
async function handleInit({ seedPhrase, salt, iv: initialIv, metadata: fileMetadata }: any) {
  try {
    // Store the IV and metadata
    baseIv = new Uint8Array(initialIv)
    metadata = fileMetadata

    // Derive the decryption key from the seed phrase
    decryptionKey = await deriveKeyFromSeedPhrase(seedPhrase, new Uint8Array(salt))

    // Notify that initialization is complete
    self.postMessage({ type: "initialized" })
  } catch (error) {
    console.error("Initialization error:", error)
    self.postMessage({
      type: "error",
      error: "Failed to initialize decryption worker: " + (error instanceof Error ? error.message : "Unknown error"),
    })
  }
}

// Decrypt a segment of the ciphertext
async function decryptSegment(segment: ArrayBuffer, segmentIndex: number, isLast: boolean) {
  if (!decryptionKey || !baseIv) {
    throw new Error("Worker not initialized")
  }

  try {
    // Derive a unique IV for this segment based on the segment index
    const segmentIv = deriveSegmentIv(baseIv, segmentIndex)

    // For AES-GCM, we need to decrypt the entire segment at once
    const decryptedSegment = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: segmentIv,
        tagLength: 128,
      },
      decryptionKey,
      segment,
    )

    // Send the decrypted segment back to the main thread
    self.postMessage(
      {
        type: "segmentDecrypted",
        decryptedSegment,
        segmentIndex,
        isLast,
      },
      [decryptedSegment],
    )

    totalBytesProcessed += segment.byteLength

    // Report progress
    self.postMessage({
      type: "progress",
      bytesProcessed: totalBytesProcessed,
    })

    // If this is the last segment, we're done
    if (isLast) {
      self.postMessage({ type: "complete" })
    }
  } catch (error) {
    console.error(`Decryption error for segment ${segmentIndex}:`, error)
    self.postMessage({
      type: "error",
      error: `Failed to decrypt segment ${segmentIndex}: ` + (error instanceof Error ? error.message : "Unknown error"),
    })
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

// Finalize the decryption process
async function finalizeDecryption() {
  // Clean up any resources
  decryptionKey = null
  baseIv = null
  metadata = null
  totalBytesProcessed = 0

  // Notify that we're done
  self.postMessage({ type: "finished" })
}

// Derive encryption key from seed phrase and salt
async function deriveKeyFromSeedPhrase(seedPhrase: string, salt: Uint8Array): Promise<CryptoKey> {
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

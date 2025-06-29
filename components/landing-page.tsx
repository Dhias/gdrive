"use client"

import { useState, useEffect } from "react"
import { Shield, ShieldOff, Download, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import PinCreation from "@/components/pin-creation"

interface LandingPageProps {
  onComplete: (usesPin: boolean) => void
}

interface SeedPhraseState {
  words: string[]
  verified: boolean
}

type AuthStep = "welcome" | "seedPhrase" | "verifySeed" | "pinCreation" | "recovery"

export default function LandingPage({ onComplete }: LandingPageProps) {
  const [authStep, setAuthStep] = useState<AuthStep>("welcome")
  const [seedPhrase, setSeedPhrase] = useState<SeedPhraseState>({ words: [], verified: false })
  const [verificationWords, setVerificationWords] = useState<{ index: number; word: string; input: string }[]>([])
  const [recoveryPhrase, setRecoveryPhrase] = useState<string>("")
  const [recoveryError, setRecoveryError] = useState<string | null>(null)

  // Generate seed phrase on component mount
  useEffect(() => {
    if (authStep === "seedPhrase" && seedPhrase.words.length === 0) {
      generateSeedPhrase()
    }
  }, [authStep])

  // Generate verification words when moving to verify step
  useEffect(() => {
    if (authStep === "verifySeed" && seedPhrase.words.length > 0) {
      generateVerificationWords()
    }
  }, [authStep, seedPhrase.words])

  const generateSeedPhrase = () => {
    // List of BIP39 words (simplified version with fewer words for demo)
    const wordList = [
      "abandon",
      "ability",
      "able",
      "about",
      "above",
      "absent",
      "absorb",
      "abstract",
      "absurd",
      "abuse",
      "access",
      "accident",
      "account",
      "accuse",
      "achieve",
      "acid",
      "acoustic",
      "acquire",
      "across",
      "act",
      "action",
      "actor",
      "actress",
      "actual",
      "adapt",
      "add",
      "addict",
      "address",
      "adjust",
      "admit",
      "adult",
      "advance",
      "advice",
      "aerobic",
      "affair",
      "afford",
      "afraid",
      "again",
      "age",
      "agent",
      "agree",
      "ahead",
      "aim",
      "air",
      "airport",
      "aisle",
      "alarm",
      "album",
      "alcohol",
      "alert",
      "alien",
      "all",
      "alley",
      "allow",
      "almost",
      "alone",
      "alpha",
      "already",
      "also",
      "alter",
      "always",
      "amateur",
      "amazing",
      "among",
      "amount",
      "amused",
      "analyst",
      "anchor",
      "ancient",
      "anger",
      "angle",
      "angry",
      "animal",
      "ankle",
      "announce",
      "annual",
      "another",
      "answer",
      "antenna",
      "antique",
      "anxiety",
      "any",
      "apart",
      "apology",
      "appear",
      "apple",
      "approve",
      "april",
      "arch",
      "arctic",
      "area",
      "arena",
      "argue",
      "arm",
      "armed",
      "armor",
      "army",
      "around",
      "arrange",
      "arrest",
      "arrive",
      "arrow",
      "art",
      "artefact",
      "artist",
      "artwork",
      "ask",
      "aspect",
      "assault",
      "asset",
      "assist",
      "assume",
      "asthma",
      "athlete",
      "atom",
      "attack",
      "attend",
      "attitude",
      "attract",
      "auction",
    ]

    // Generate 12 random words
    const selectedWords: string[] = []
    for (let i = 0; i < 12; i++) {
      const randomIndex = Math.floor(Math.random() * wordList.length)
      selectedWords.push(wordList[randomIndex])
    }

    setSeedPhrase({ words: selectedWords, verified: false })
  }

  const generateVerificationWords = () => {
    // Select 3 random indices from the seed phrase
    const indices: number[] = []
    while (indices.length < 3) {
      const randomIndex = Math.floor(Math.random() * 12)
      if (!indices.includes(randomIndex)) {
        indices.push(randomIndex)
      }
    }

    // Create verification words array
    const verificationArray = indices.map((index) => ({
      index,
      word: seedPhrase.words[index],
      input: "",
    }))

    setVerificationWords(verificationArray)
  }

  const downloadSeedPhrase = () => {
    const content = `IMPORTANT: SAVE THIS SEED PHRASE SECURELY\n\nYour LocalDrive Recovery Seed Phrase:\n\n${seedPhrase.words.join(" ")}\n\nDO NOT share this seed phrase with anyone. Anyone with access to this phrase can access your files.\nKeep it in a safe place.`
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "localdrive-seed-phrase.txt"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleVerificationChange = (index: number, value: string) => {
    const updatedWords = [...verificationWords]
    updatedWords[index].input = value
    setVerificationWords(updatedWords)
  }

  const verifyWords = () => {
    const allCorrect = verificationWords.every((item) => item.input.toLowerCase().trim() === item.word.toLowerCase())

    if (allCorrect) {
      setSeedPhrase((prev) => ({ ...prev, verified: true }))
      setAuthStep("pinCreation")
    } else {
      // Reset inputs on failure
      setVerificationWords(verificationWords.map((item) => ({ ...item, input: "" })))
      alert("Verification failed. Please try again.")
    }
  }

  const handlePinCreated = async () => {
    // Store encrypted seed phrase in IndexedDB
    await storeSeedPhrase(seedPhrase.words)
    onComplete(true)
  }

  const handleSkipPin = () => {
    // Set a flag in localStorage to remember that user chose not to use PIN
    localStorage.setItem("usesPin", "false")
    onComplete(false)
  }

  const handleRecoveryPhraseChange = (value: string) => {
    setRecoveryPhrase(value)
    setRecoveryError(null)
  }

  const verifyRecoveryPhrase = async () => {
    const words = recoveryPhrase.trim().split(/\s+/)

    if (words.length !== 12) {
      setRecoveryError("Please enter all 12 words of your seed phrase.")
      return
    }

    try {
      // Verify if the seed phrase exists in the database
      const exists = await checkSeedPhraseExists(words)

      if (exists) {
        // Set the seed phrase and move to PIN creation
        setSeedPhrase({ words, verified: true })
        setAuthStep("pinCreation")
      } else {
        setRecoveryError("Invalid seed phrase. Please check and try again.")
      }
    } catch (error) {
      console.error("Recovery error:", error)
      setRecoveryError("An error occurred during recovery. Please try again.")
    }
  }

  // Store seed phrase in IndexedDB (encrypted)
  const storeSeedPhrase = async (words: string[]) => {
    try {
      // Get or create encryption key
      const key = await getOrCreateEncryptionKey()

      // Convert seed phrase to string
      const seedPhraseString = words.join(" ")

      // Encrypt the seed phrase
      const encryptedData = await encryptData(seedPhraseString, key)

      // Store in IndexedDB
      await saveToIndexedDB("seedPhrase", encryptedData)

      return true
    } catch (error) {
      console.error("Failed to store seed phrase:", error)
      return false
    }
  }

  // Check if seed phrase exists in IndexedDB
  const checkSeedPhraseExists = async (words: string[]): Promise<boolean> => {
    try {
      // This is a simplified check - in a real app, you'd need to decrypt and compare
      // For demo purposes, we'll just return true to simulate successful recovery
      return true
    } catch (error) {
      console.error("Error checking seed phrase:", error)
      return false
    }
  }

  // Get or create encryption key
  const getOrCreateEncryptionKey = async (): Promise<CryptoKey> => {
    // Check if we already have a key in localStorage (reference only)
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

  // Encrypt data using AES-256
  const encryptData = async (data: string, key: CryptoKey): Promise<ArrayBuffer> => {
    // Generate a random IV
    const iv = crypto.getRandomValues(new Uint8Array(12))

    // Convert data to ArrayBuffer
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(data)

    // Encrypt the data
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      dataBuffer,
    )

    // Combine IV and encrypted data
    const result = new Uint8Array(iv.length + encryptedBuffer.byteLength)
    result.set(iv, 0)
    result.set(new Uint8Array(encryptedBuffer), iv.length)

    return result
  }

  // Save data to IndexedDB
  const saveToIndexedDB = async (key: string, data: ArrayBuffer): Promise<void> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("LocalDriveSecurityDB", 1)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains("security")) {
          db.createObjectStore("security")
        }
      }

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        const transaction = db.transaction(["security"], "readwrite")
        const store = transaction.objectStore("security")

        const storeRequest = store.put(data, key)

        storeRequest.onsuccess = () => resolve()
        storeRequest.onerror = () => reject(new Error("Failed to store data in IndexedDB"))

        transaction.oncomplete = () => db.close()
      }

      request.onerror = () => reject(new Error("Failed to open IndexedDB"))
    })
  }

  if (authStep === "pinCreation") {
    return <PinCreation onComplete={handlePinCreated} />
  }

  if (authStep === "seedPhrase") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Your Recovery Seed Phrase</h1>
            <p className="text-gray-500">Write down these 12 words and keep them in a safe place</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-center">Backup Your Seed Phrase</CardTitle>
              <CardDescription className="text-center">
                These 12 words are the only way to recover your account if you forget your PIN or lose access to your
                device.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {seedPhrase.words.map((word, index) => (
                  <div key={index} className="flex items-center p-2 bg-gray-100 rounded-md">
                    <span className="text-gray-500 mr-2 w-5 text-right">{index + 1}.</span>
                    <span className="font-medium">{word}</span>
                  </div>
                ))}
              </div>

              <Alert className="bg-yellow-50 border-yellow-200 text-yellow-800 mb-4">
                <AlertDescription>
                  <strong>Important:</strong> Never share these words with anyone. Anyone with access to these words can
                  access your files.
                </AlertDescription>
              </Alert>
            </CardContent>
            <CardFooter className="flex flex-col space-y-3">
              <Button className="w-full" onClick={downloadSeedPhrase}>
                <Download className="mr-2 h-4 w-4" />
                Download Seed Phrase
              </Button>
              <Button className="w-full" onClick={() => setAuthStep("verifySeed")}>
                I've Backed Up My Seed Phrase
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setAuthStep("welcome")}>
                Back
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    )
  }

  if (authStep === "verifySeed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Verify Your Seed Phrase</h1>
            <p className="text-gray-500">Enter the requested words to confirm you've saved your seed phrase</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-center">Confirm Your Backup</CardTitle>
              <CardDescription className="text-center">
                Please enter the following words from your seed phrase
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {verificationWords.map((item, index) => (
                  <div key={index} className="space-y-2">
                    <label className="text-sm font-medium">Word #{item.index + 1}</label>
                    <Input
                      value={item.input}
                      onChange={(e) => handleVerificationChange(index, e.target.value)}
                      placeholder={`Enter word #${item.index + 1}`}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-3">
              <Button
                className="w-full"
                onClick={verifyWords}
                disabled={verificationWords.some((item) => !item.input.trim())}
              >
                <Check className="mr-2 h-4 w-4" />
                Verify Seed Phrase
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setAuthStep("seedPhrase")}>
                Back to Seed Phrase
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    )
  }

  if (authStep === "recovery") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Recover Your Account</h1>
            <p className="text-gray-500">Enter your 12-word seed phrase to recover your account</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-center">Enter Recovery Seed Phrase</CardTitle>
              <CardDescription className="text-center">
                Type or paste your 12-word seed phrase, with spaces between each word
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <textarea
                  className="w-full h-32 p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={recoveryPhrase}
                  onChange={(e) => handleRecoveryPhraseChange(e.target.value)}
                  placeholder="Enter your 12-word seed phrase..."
                />

                {recoveryError && (
                  <Alert className="bg-red-50 border-red-200 text-red-800">
                    <AlertDescription>{recoveryError}</AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-3">
              <Button className="w-full" onClick={verifyRecoveryPhrase} disabled={!recoveryPhrase.trim()}>
                Recover Account
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setAuthStep("welcome")}>
                Back
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    )
  }

  // Default welcome screen
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome to LocalDrive</h1>
          <p className="text-gray-500">Secure browser-based file storage</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="text-center">
              <div className="mx-auto bg-blue-100 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <Shield className="h-8 w-8 text-blue-600" />
              </div>
              <CardTitle>Secure with Seed Phrase</CardTitle>
              <CardDescription>Protect your files with a seed phrase and PIN code</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-sm text-gray-500">
                Your files will be encrypted and protected with a seed phrase and PIN. You can recover your account
                using the seed phrase if you forget your PIN.
              </p>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onClick={() => setAuthStep("seedPhrase")}>
                Create New Wallet
              </Button>
            </CardFooter>
          </Card>

          <Card className="hover:shadow-md transition-shadow">
            <CardHeader className="text-center">
              <div className="mx-auto bg-gray-100 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                <ShieldOff className="h-8 w-8 text-gray-600" />
              </div>
              <CardTitle>Quick Access</CardTitle>
              <CardDescription>Access your files without security</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-sm text-gray-500">
                Your files will still be encrypted, but you won't need to enter a PIN each time. Anyone with access to
                your device can open the drive.
              </p>
            </CardContent>
            <CardFooter className="flex flex-col space-y-3">
              <Button variant="outline" className="w-full" onClick={handleSkipPin}>
                Continue without Security
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setAuthStep("recovery")}>
                Recover Existing Account
              </Button>
            </CardFooter>
          </Card>
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          Your files are stored locally in your browser. They are not uploaded to any server.
        </p>
      </div>
    </div>
  )
}

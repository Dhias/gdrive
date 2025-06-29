"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { Shield, Lock } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { verifySeedPhrase } from "@/lib/db"

interface PinEntryProps {
  onSuccess: () => void
}

export default function PinEntry({ onSuccess }: PinEntryProps) {
  const [pin, setPin] = useState<string[]>(Array(6).fill(""))
  const [error, setError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [isLocked, setIsLocked] = useState(false)
  const [lockTimeRemaining, setLockTimeRemaining] = useState(0)
  const [lockEndTime, setLockEndTime] = useState<number | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(6).fill(null))
  const { toast } = useToast()

  // Check if account is locked on mount
  useEffect(() => {
    const storedLockEndTime = localStorage.getItem("pinLockEndTime")
    if (storedLockEndTime) {
      const endTime = Number.parseInt(storedLockEndTime)
      if (endTime > Date.now()) {
        // Account is still locked
        setIsLocked(true)
        setLockEndTime(endTime)
      } else {
        // Lock has expired
        localStorage.removeItem("pinLockEndTime")
        localStorage.removeItem("pinAttempts")
      }
    }

    // Load previous attempts
    const storedAttempts = localStorage.getItem("pinAttempts")
    if (storedAttempts) {
      setAttempts(Number.parseInt(storedAttempts))
    }
  }, [])

  // Handle countdown timer when locked
  useEffect(() => {
    if (!isLocked || !lockEndTime) return

    const updateTimer = () => {
      const remaining = Math.max(0, lockEndTime - Date.now())
      setLockTimeRemaining(remaining)

      if (remaining <= 0) {
        // Lock has expired
        setIsLocked(false)
        setLockEndTime(null)
        localStorage.removeItem("pinLockEndTime")
        localStorage.removeItem("pinAttempts")
        setAttempts(0)
      }
    }

    // Update immediately
    updateTimer()

    // Set up interval to update timer
    const interval = setInterval(updateTimer, 1000)

    return () => clearInterval(interval)
  }, [isLocked, lockEndTime])

  // Focus first input on mount if not locked
  useEffect(() => {
    if (!isLocked) {
      inputRefs.current[0]?.focus()
    }
  }, [isLocked])

  const handlePinChange = (index: number, value: string) => {
    // Don't allow input when locked
    if (isLocked) return

    // Only allow numbers
    if (value && !/^\d+$/.test(value)) return

    const newPin = [...pin]

    // Handle paste event with multiple digits
    if (value.length > 1) {
      const digits = value.split("").slice(0, 6 - index)
      digits.forEach((digit, i) => {
        if (index + i < 6) {
          newPin[index + i] = digit
        }
      })

      setPin(newPin)
      // Focus the next input after the last pasted digit
      const nextIndex = Math.min(index + digits.length, 5)
      inputRefs.current[nextIndex]?.focus()
      inputRefs.current[nextIndex]?.select()

      // Auto-submit if all digits are filled
      if (newPin.every((digit) => digit !== "")) {
        setTimeout(() => {
          handleVerify()
        }, 300)
      }

      return
    }

    // Handle single digit
    newPin[index] = value
    setPin(newPin)

    // Auto-focus next input if value is entered
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit if all digits are filled
    if (value && index === 5 && newPin.every((digit) => digit !== "")) {
      setTimeout(() => {
        handleVerify()
      }, 300)
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Don't allow input when locked
    if (isLocked) return

    // Move to previous input on backspace if current input is empty
    if (e.key === "Backspace") {
      if (!pin[index] && index > 0) {
        inputRefs.current[index - 1]?.focus()
      }
    }

    // Move to next input on right arrow
    if (e.key === "ArrowRight" && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    // Move to previous input on left arrow
    if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }

    // Submit on enter if all digits are filled
    if (e.key === "Enter" && pin.every((digit) => digit !== "")) {
      handleVerify()
    }
  }

  const handleVerify = async () => {
    // Don't allow verification when locked
    if (isLocked) return

    // Check if all digits are filled
    if (pin.some((digit) => digit === "")) {
      setError("Please enter all 6 digits")
      return
    }

    // Get stored PIN hash
    const storedPinHash = localStorage.getItem("pinHash")
    if (!storedPinHash) {
      // This shouldn't happen if PIN was properly set up
      setError("PIN not found. Please reset your device.")
      return
    }

    // Verify PIN
    const enteredPin = pin.join("")
    const enteredPinHash = hashPin(enteredPin)

    if (enteredPinHash === storedPinHash) {
      // PIN is correct, now verify against seed phrase
      try {
        // Get the seed phrase from localStorage (for demo purposes)
        const seedPhraseWords = localStorage.getItem("seedPhraseWords")

        if (seedPhraseWords) {
          // In a real implementation, we would verify against the encrypted seed phrase
          // For now, we'll just check if it exists
          const isValid = await verifySeedPhrase(seedPhraseWords)

          if (!isValid) {
            setError("Security verification failed. Please reset your device.")
            return
          }
        }

        // PIN and seed phrase are correct
        toast({
          title: "Access Granted",
          description: "Welcome back to your drive",
        })

        // Reset attempts
        setAttempts(0)
        localStorage.removeItem("pinAttempts")

        onSuccess()
      } catch (error) {
        console.error("Seed phrase verification error:", error)
        setError("Security verification failed. Please try again.")

        // Increment attempts
        handleFailedAttempt()
      }
    } else {
      // PIN is incorrect
      handleFailedAttempt()
    }
  }

  const handleFailedAttempt = () => {
    const newAttempts = attempts + 1
    setAttempts(newAttempts)
    localStorage.setItem("pinAttempts", newAttempts.toString())

    setPin(Array(6).fill(""))
    setError(`Incorrect PIN. Please try again. (Attempt ${newAttempts}/5)`)
    inputRefs.current[0]?.focus()

    // After 5 failed attempts, lock the account
    if (newAttempts >= 5) {
      const lockDuration = 5 * 60 * 1000 // 5 minutes in milliseconds
      const endTime = Date.now() + lockDuration

      setIsLocked(true)
      setLockEndTime(endTime)
      setLockTimeRemaining(lockDuration)

      // Store lock end time in localStorage
      localStorage.setItem("pinLockEndTime", endTime.toString())

      toast({
        title: "Account Locked",
        description: "Too many incorrect attempts. Your account is locked for 5 minutes.",
        variant: "destructive",
      })
    }
  }

  // Format remaining time as MM:SS
  const formatTimeRemaining = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }

  // Simple hash function for PIN (same as in PinCreation)
  const hashPin = (pin: string): string => {
    let hash = 0
    for (let i = 0; i < pin.length; i++) {
      const char = pin.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return hash.toString(16)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto bg-blue-100 p-4 rounded-full w-16 h-16 flex items-center justify-center mb-4">
            {isLocked ? <Lock className="h-8 w-8 text-red-600" /> : <Shield className="h-8 w-8 text-blue-600" />}
          </div>
          <CardTitle>{isLocked ? "Account Locked" : "Enter Your PIN"}</CardTitle>
          <CardDescription>
            {isLocked
              ? "Too many incorrect attempts. Please wait before trying again."
              : "Enter your 6-digit PIN to access your drive"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {isLocked ? (
              <div className="space-y-4">
                <div className="bg-red-50 text-red-600 p-4 rounded-md">
                  <p className="font-medium">Account locked for security</p>
                  <p className="text-sm mt-1">
                    Your account has been temporarily locked due to too many incorrect PIN attempts. Please wait for the
                    timer to expire before trying again.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Time remaining:</span>
                    <span className="font-medium">{formatTimeRemaining(lockTimeRemaining)}</span>
                  </div>
                  <Progress
                    value={lockEndTime ? ((lockEndTime - Date.now()) / (5 * 60 * 1000)) * 100 : 0}
                    className="h-2"
                  />
                </div>
              </div>
            ) : (
              <>
                {error && <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">{error}</div>}

                <div className="flex justify-center space-x-2">
                  {pin.map((digit, index) => (
                    <Input
                      key={index}
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={digit}
                      onChange={(e) => handlePinChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      ref={(el) => (inputRefs.current[index] = el)}
                      className="w-12 h-12 text-center text-xl"
                      autoComplete="off"
                    />
                  ))}
                </div>

                <p className="text-xs text-gray-500 text-center">
                  If you've forgotten your PIN, you'll need to recover using your seed phrase.
                </p>
              </>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-center">
          {!isLocked && (
            <Button onClick={handleVerify} disabled={pin.some((digit) => digit === "")}>
              Unlock
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}

"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"

interface PinCreationProps {
  onComplete: () => void
}

export default function PinCreation({ onComplete }: PinCreationProps) {
  const [pin, setPin] = useState<string[]>(Array(6).fill(""))
  const [confirmPin, setConfirmPin] = useState<string[]>(Array(6).fill(""))
  const [step, setStep] = useState<"create" | "confirm">("create")
  const [error, setError] = useState<string | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(6).fill(null))
  const confirmInputRefs = useRef<(HTMLInputElement | null)[]>(Array(6).fill(null))
  const { toast } = useToast()

  // Focus first input on mount
  useEffect(() => {
    if (step === "create") {
      inputRefs.current[0]?.focus()
    } else {
      confirmInputRefs.current[0]?.focus()
    }
  }, [step])

  const handlePinChange = (index: number, value: string, isConfirm = false) => {
    // Only allow numbers
    if (value && !/^\d+$/.test(value)) return

    const newPin = isConfirm ? [...confirmPin] : [...pin]

    // Handle paste event with multiple digits
    if (value.length > 1) {
      const digits = value.split("").slice(0, 6 - index)
      digits.forEach((digit, i) => {
        if (index + i < 6) {
          newPin[index + i] = digit
        }
      })

      if (isConfirm) {
        setConfirmPin(newPin)
        // Focus the next input after the last pasted digit
        const nextIndex = Math.min(index + digits.length, 5)
        confirmInputRefs.current[nextIndex]?.focus()
        confirmInputRefs.current[nextIndex]?.select()
      } else {
        setPin(newPin)
        // Focus the next input after the last pasted digit
        const nextIndex = Math.min(index + digits.length, 5)
        inputRefs.current[nextIndex]?.focus()
        inputRefs.current[nextIndex]?.select()
      }
      return
    }

    // Handle single digit
    newPin[index] = value

    if (isConfirm) {
      setConfirmPin(newPin)
    } else {
      setPin(newPin)
    }

    // Auto-focus next input if value is entered
    if (value && index < 5) {
      if (isConfirm) {
        confirmInputRefs.current[index + 1]?.focus()
      } else {
        inputRefs.current[index + 1]?.focus()
      }
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>, isConfirm = false) => {
    // Move to previous input on backspace if current input is empty
    if (e.key === "Backspace") {
      const currentPin = isConfirm ? confirmPin : pin
      if (!currentPin[index] && index > 0) {
        if (isConfirm) {
          confirmInputRefs.current[index - 1]?.focus()
        } else {
          inputRefs.current[index - 1]?.focus()
        }
      }
    }

    // Move to next input on right arrow
    if (e.key === "ArrowRight" && index < 5) {
      if (isConfirm) {
        confirmInputRefs.current[index + 1]?.focus()
      } else {
        inputRefs.current[index + 1]?.focus()
      }
    }

    // Move to previous input on left arrow
    if (e.key === "ArrowLeft" && index > 0) {
      if (isConfirm) {
        confirmInputRefs.current[index - 1]?.focus()
      } else {
        inputRefs.current[index - 1]?.focus()
      }
    }
  }

  const handleContinue = () => {
    // Check if all digits are filled
    if (pin.some((digit) => digit === "")) {
      setError("Please enter all 6 digits")
      return
    }

    setStep("confirm")
    setError(null)
  }

  const handleConfirm = () => {
    // Check if all confirmation digits are filled
    if (confirmPin.some((digit) => digit === "")) {
      setError("Please enter all 6 digits")
      return
    }

    // Check if PINs match
    if (pin.join("") !== confirmPin.join("")) {
      setError("PINs do not match. Please try again.")
      setConfirmPin(Array(6).fill(""))
      confirmInputRefs.current[0]?.focus()
      return
    }

    // Save PIN to localStorage (hashed for security)
    const hashedPin = hashPin(pin.join(""))
    localStorage.setItem("pinHash", hashedPin)
    localStorage.setItem("usesPin", "true")

    toast({
      title: "PIN Created",
      description: "Your PIN has been set successfully",
    })

    onComplete()
  }

  // Simple hash function for PIN (in a real app, use a more secure method)
  const hashPin = (pin: string): string => {
    // This is a very simple hash for demonstration
    // In a production app, use a proper crypto library
    let hash = 0
    for (let i = 0; i < pin.length; i++) {
      const char = pin.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32bit integer
    }
    return hash.toString(16)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>{step === "create" ? "Create Your PIN" : "Confirm Your PIN"}</CardTitle>
          <CardDescription>
            {step === "create" ? "Enter a 6-digit PIN to secure your drive" : "Re-enter your PIN to confirm"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {error && <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">{error}</div>}

            <div className="flex justify-center space-x-2">
              {step === "create"
                ? // PIN creation inputs
                  pin.map((digit, index) => (
                    <Input
                      key={`create-${index}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={digit}
                      onChange={(e) => handlePinChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      ref={(el) => (inputRefs.current[index] = el)}
                      className="w-12 h-12 text-center text-xl"
                      autoComplete="off"
                    />
                  ))
                : // PIN confirmation inputs
                  confirmPin.map((digit, index) => (
                    <Input
                      key={`confirm-${index}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={digit}
                      onChange={(e) => handlePinChange(index, e.target.value, true)}
                      onKeyDown={(e) => handleKeyDown(index, e, true)}
                      ref={(el) => (confirmInputRefs.current[index] = el)}
                      className="w-12 h-12 text-center text-xl"
                      autoComplete="off"
                    />
                  ))}
            </div>

            <p className="text-xs text-gray-500 text-center">
              {step === "create"
                ? "Choose a PIN you can remember. This cannot be recovered if forgotten."
                : "Make sure you enter the same PIN as before."}
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          {step === "create" ? (
            <>
              <Button variant="outline" onClick={() => window.history.back()}>
                Back
              </Button>
              <Button onClick={handleContinue}>Continue</Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("create")
                  setConfirmPin(Array(6).fill(""))
                  setError(null)
                }}
              >
                Back
              </Button>
              <Button onClick={handleConfirm}>Confirm PIN</Button>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}

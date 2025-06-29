import type { Metadata } from "next"
import OfflinePageClient from "./OfflinePageClient"

export const metadata: Metadata = {
  title: "Offline - LocalDrive",
  description: "You are currently offline",
}

export default function OfflinePage() {
  return <OfflinePageClient />
}

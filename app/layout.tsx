import type React from "react"
import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "LocalDrive - Secure File Storage",
  description: "Secure browser-based file storage with offline access",
  generator: "v0.dev",
  manifest: "/manifest.json",
  keywords: ["file storage", "secure", "offline", "PWA", "browser storage"],
  authors: [{ name: "LocalDrive Team" }],
  creator: "LocalDrive",
  publisher: "LocalDrive",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: "/icon-192x192.png",
    shortcut: "/icon-192x192.png",
    apple: "/icon-192x192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LocalDrive",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "LocalDrive",
    "application-name": "LocalDrive",
    "msapplication-TileColor": "#000000",
    "theme-color": "#000000",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Register Service Worker
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(registration) {
                      console.log('SW registered: ', registration);
                      
                      // Check for updates
                      registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        if (newWorker) {
                          newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                              // New content is available
                              console.log('New content available');
                            }
                          });
                        }
                      });
                    })
                    .catch(function(registrationError) {
                      console.log('SW registration failed: ', registrationError);
                    });
                });
              }

              // Handle offline/online events
              window.addEventListener('online', function() {
                console.log('Back online');
                document.body.classList.remove('offline');
                document.body.classList.add('online');
              });

              window.addEventListener('offline', function() {
                console.log('Gone offline');
                document.body.classList.remove('online');
                document.body.classList.add('offline');
              });

              // Set initial online status
              if (navigator.onLine) {
                document.body.classList.add('online');
              } else {
                document.body.classList.add('offline');
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}

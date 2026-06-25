import type { Metadata } from "next"
import "./globals.css"

// Fonte via stack CSS (globals.css) — sem next/font/google, p/ o build NÃO depender
// de rede externa (Google Fonts). Mantém aparência próxima ao Inter.

export const metadata: Metadata = {
  title: "NuFlow",
  description: "Operação Audiovisual In-House",
  metadataBase: new URL("https://nuflow.space"),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "NuFlow",
    description: "Operação Audiovisual In-House",
    siteName: "NuFlow",
    type: "website",
    url: "https://nuflow.space",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}

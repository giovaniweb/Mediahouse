import type { Metadata } from "next"
import "./globals.css"
import "@/components/layout/Montserrat.css"

// Fontes locais: o build e a interface não dependem de Google Fonts.

export const metadata: Metadata = {
  title: "NuFlow",
  description: "Operação Audiovisual In-House",
  metadataBase: new URL("https://nuflow.space"),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.svg", type: "image/svg+xml" },
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
    locale: "pt_BR",
  },
  // A arte de 1200x630 sai de opengraph-image.tsx e twitter-image.tsx (mesma
  // pasta); "summary_large_image" é o que faz a prévia aparecer grande.
  twitter: { card: "summary_large_image", title: "NuFlow", description: "Operação Audiovisual In-House" },
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

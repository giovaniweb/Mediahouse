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
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "NuFlow" }],
  },
  twitter: { card: "summary", title: "NuFlow", description: "Jobs, prazos e aprovações em um só lugar.", images: ["/icon-512.png"] },
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

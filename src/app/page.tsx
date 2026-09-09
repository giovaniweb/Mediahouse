import type { Metadata } from "next"
import Boreal from "@/components/landing/Boreal"

export const metadata: Metadata = {
  title: "NuFlow — Mais tempo para criar",
  description: "Organize demandas, acompanhe seus jobs e encontre mais tempo para ser criativo. Conheça o flow do NuFlow.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "NuFlow — Mais tempo para criar",
    description: "Jobs, prazos e aprovações em um só lugar. Mais espaço para ser criativo.",
    url: "/",
  },
}

export default function RootPage() {
  const phone = (process.env.NUFLOW_SALES_WHATSAPP || "5531992271043").replace(/\D/g, "")
  const contactUrl = phone && /^\d{10,15}$/.test(phone)
    ? `https://wa.me/${phone}?text=${encodeURIComponent("Olá! Quero conhecer o NuFlow e o plano de R$ 59/mês.")}`
    : null
  return <main><Boreal contactUrl={contactUrl} /></main>
}

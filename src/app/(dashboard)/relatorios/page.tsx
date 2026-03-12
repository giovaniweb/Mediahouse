"use client"

import { Header } from "@/components/layout/Header"
import { BarChart2 } from "lucide-react"

export default function RelatoriosPage() {
  return (
    <>
      <Header title="Relatórios" />
      <main className="flex-1 p-6 flex items-center justify-center">
        <div className="text-center text-zinc-400">
          <BarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-zinc-500">Relatórios — Em breve</p>
          <p className="text-sm mt-1">Esta funcionalidade estará disponível na próxima fase.</p>
        </div>
      </main>
    </>
  )
}

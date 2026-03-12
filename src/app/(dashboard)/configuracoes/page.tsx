"use client"

import { Header } from "@/components/layout/Header"
import { Settings } from "lucide-react"

export default function ConfiguracoesPage() {
  return (
    <>
      <Header title="Configurações" />
      <main className="flex-1 p-6 flex items-center justify-center">
        <div className="text-center text-zinc-400">
          <Settings className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-zinc-500">Configurações — Em breve</p>
          <p className="text-sm mt-1">Gerencie usuários, integrações e preferências do sistema.</p>
        </div>
      </main>
    </>
  )
}

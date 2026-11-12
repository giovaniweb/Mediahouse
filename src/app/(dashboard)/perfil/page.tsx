"use client"
import { Header } from "@/components/layout/Header"
import { UserProfileModal } from "@/components/layout/UserProfileModal"
import { AvisosPorPessoa } from "@/components/configuracoes/AvisosPorPessoa"
export default function PerfilPage() {
  return <>
    <Header title="Workspace / Meu perfil"/>
    <UserProfileModal mode="page"/>
    {/* A própria pessoa escolhe os avisos dela, menos o que a gestão travou. */}
    <section aria-label="Meus avisos" className="mx-auto w-full max-w-3xl p-6">
      <AvisosPorPessoa modo="propria"/>
    </section>
  </>
}

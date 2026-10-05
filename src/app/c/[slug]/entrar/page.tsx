import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { empresaDoPortal } from "@/lib/portal"
import { linksDaAreaNoServidor } from "@/lib/area-servidor"
import { FormularioLogin } from "@/components/auth/FormularioLogin"
import styles from "@/components/auth/AuthSurface.module.css"
import { LogoNuFlow } from "@/components/marca/Marca"

// Login com a cara da empresa. Depois de entrar, /c/<slug>/painel escolhe esta
// empresa como ativa (se a conta for dela) e leva ao painel.
// Mora sempre no domínio principal: o cookie da sessão é por host, e um login
// feito em <slug>.nuflow.space deixaria a pessoa deslogada no painel. O proxy
// manda <slug>.nuflow.space/entrar para cá.
type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const empresa = await empresaDoPortal((await params).slug)
  return { title: empresa ? `Entrar · ${empresa.nome}` : "Área não encontrada · NuFlow", robots: { index: false, follow: false } }
}

function iniciais(nome: string) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("")
}

export default async function EntrarNaEmpresa({ params }: Props) {
  const empresa = await empresaDoPortal((await params).slug)
  if (!empresa) notFound()
  const { inicio } = await linksDaAreaNoServidor(empresa.slug)
  return (
    <main className={styles.shell}>
      <aside className={styles.story}>
        <Link href={inicio} className={styles.brand}>
          {empresa.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={empresa.logoUrl} alt="" />
            : <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center", background: "#2a2541", fontSize: 13 }}>{iniciais(empresa.nome)}</span>}
          {empresa.nome}
        </Link>
        <div><h2>Seu trabalho com {empresa.nome}.<strong>Tudo em um só lugar.</strong></h2><p>Pedidos, prazos, aprovações e entregas. Entre com a conta que a equipe cadastrou para você.</p></div>
        <footer>Feito com <LogoNuFlow /></footer>
      </aside>
      <div className={styles.content}>
        <Suspense>
          <FormularioLogin
            destinoFixo={`/c/${empresa.slug}/painel`}
            eyebrow={empresa.nome.toUpperCase()}
            titulo="Entre na sua conta."
            descricao={`Depois de entrar, você vai direto para o espaço de ${empresa.nome}.`}
            linkExtra={{ href: inicio, texto: "Voltar à área da empresa" }}
          />
        </Suspense>
      </div>
    </main>
  )
}

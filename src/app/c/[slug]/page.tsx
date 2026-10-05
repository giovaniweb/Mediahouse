import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Clapperboard, Palette, CalendarCheck, Camera, Images, LogIn, ArrowRight } from "lucide-react"
import { empresaDoPortal } from "@/lib/portal"
import "@/components/layout/Montserrat.css"
import styles from "@/components/publico/Portal.module.css"

// A área pública da empresa: nuflow.space/c/<slug>.
// É o endereço que a empresa divulga para clientes e videomakers. Tudo o que
// sai daqui (pedido, cadastro, login) carrega o slug e chega só a ela.

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const empresa = await empresaDoPortal((await params).slug)
  if (!empresa) return { title: "Área não encontrada · NuFlow", robots: { index: false } }
  // Fora dos buscadores: cada empresa decide para quem manda o próprio link.
  return { title: `${empresa.nome} · NuFlow`, description: `Pedidos de vídeo e arte, gravação com videomaker, cadastro de videomakers e acesso à conta — ${empresa.nome}.`, robots: { index: false, follow: false } }
}

function iniciais(nome: string) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("")
}

export default async function AreaDaEmpresa({ params }: Props) {
  const { slug } = await params
  const empresa = await empresaDoPortal(slug)
  if (!empresa) notFound()
  const base = `/c/${empresa.slug}`
  // Seis portas, na língua de quem chega: cada uma abre o formulário já no
  // ponto certo, sem tela de "o que você precisa?" no meio.
  const caminhos = [
    { href: `${base}/pedido?tipo=video`, icone: Clapperboard, titulo: "Quero um vídeo", texto: "Reels, institucional, treinamento, apresentação de equipamento.", principal: true },
    { href: `${base}/pedido?tipo=conteudo`, icone: Palette, titulo: "Quero uma arte", texto: "Post, story, carrossel, criativo de tráfego, arte gráfica." },
    // Pedido de gravação: entra em Aprovações e, aprovado, vira Job.
    { href: `${base}/gravacao`, icone: CalendarCheck, titulo: "Quero um videomaker", texto: "Gravação em clínica ou evento: cliente, endereço, data e horário." },
    { href: `${base}/videomaker`, icone: Camera, titulo: "Quero ser videomaker", texto: "Mande seus dados e seu portfólio para a equipe." },
    { href: `${base}/galeria`, icone: Images, titulo: "Quero ver a galeria", texto: "Os vídeos que a equipe já publicou." },
    { href: `${base}/entrar`, icone: LogIn, titulo: "Quero entrar no sistema", texto: "Para quem faz parte da equipe ou acompanha os próprios pedidos." },
  ]
  return (
    <main className={styles.portal}>
      <header className={styles.topo}>
        <div className={styles.marca}>
          <span className={styles.logo} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {empresa.logoUrl ? <img src={empresa.logoUrl} alt="" /> : iniciais(empresa.nome)}
          </span>
          <strong>{empresa.nome}</strong>
        </div>
        <Link href={`${base}/entrar`} className={styles.entrar}><LogIn size={16} aria-hidden="true" />Entrar</Link>
      </header>
      <section className={styles.hero} aria-labelledby="titulo-area">
        <p className={styles.eyebrow}>Pedidos, cadastro e acesso</p>
        <h1 id="titulo-area">Como podemos <strong>ajudar você?</strong></h1>
        <p>Escolha o que você precisa. Tudo o que for enviado por aqui vai direto para {empresa.nome}.</p>
      </section>
      <nav className={styles.caminhos} aria-label="O que você quer fazer">
        {caminhos.map(({ href, icone: Icone, titulo, texto, principal }) => (
          <Link key={href} href={href} className={principal ? `${styles.caminho} ${styles.principal}` : styles.caminho}>
            <span className={styles.icone} aria-hidden="true"><Icone size={22} /></span>
            <span><strong>{titulo}</strong><span>{texto}</span></span>
            <ArrowRight size={18} className={styles.seta} aria-hidden="true" />
          </Link>
        ))}
      </nav>
      <footer className={styles.rodape}>
        <span>Os dados enviados aqui ficam com {empresa.nome}.</span>
        <span>Feito com NuFlow</span>
      </footer>
    </main>
  )
}

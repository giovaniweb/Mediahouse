import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Clapperboard, Palette, CalendarCheck, LogIn, ArrowRight, Lightbulb } from "lucide-react"
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
  return { title: `${empresa.nome} · NuFlow`, description: `Pedidos de vídeo, arte e cobertura, galeria e cadastro de videomakers e designers — ${empresa.nome}.`, robots: { index: false, follow: false } }
}

function iniciais(nome: string) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("")
}

export default async function AreaDaEmpresa({ params }: Props) {
  const { slug } = await params
  const empresa = await empresaDoPortal(slug)
  if (!empresa) notFound()
  // Todo link da área passa por aqui. Quando a área morar em <slug>.nuflow.space,
  // basta trocar esta linha pelo helper de link do subdomínio.
  const na = (caminho: string) => `/c/${empresa.slug}${caminho}`
  // Três portas de pedido, na língua de quem chega: cada uma abre o formulário
  // já no ponto certo, sem tela de "o que você precisa?" no meio.
  const pedidos = [
    { href: na("/pedido?tipo=video"), icone: Clapperboard, area: "Audiovisual", cor: "video", titulo: "Quero um vídeo", texto: "Reels, institucional, treinamento, apresentação de equipamento.", principal: true },
    { href: na("/pedido?tipo=conteudo"), icone: Palette, area: "Growth", cor: "arte", titulo: "Quero uma arte", texto: "Post, story, carrossel, criativo de tráfego, arte gráfica." },
    // Pedido de gravação: entra em Aprovações e, aprovado, vira Job.
    { href: na("/gravacao"), icone: CalendarCheck, area: "Videomaker externo", cor: "video", titulo: "Quero uma cobertura", texto: "Gravação em clínica, evento ou entrega de equipamento: local, data e horário." },
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
        <nav className={styles.menu} aria-label="Menu">
          <Link href={na("/galeria")} className={styles.itemMenu}>Galeria</Link>
          <Link href={na("/entrar")} className={styles.entrar}><LogIn size={16} aria-hidden="true" />Entrar</Link>
        </nav>
      </header>
      <section className={styles.hero} aria-labelledby="titulo-area">
        <p className={styles.eyebrow}>Audiovisual e Growth</p>
        <h1 id="titulo-area">O que você precisa <strong>hoje?</strong></h1>
        <p>Peça um vídeo, uma arte ou um videomaker para gravar. Tudo o que você enviar aqui vai direto para a equipe de {empresa.nome}.</p>
      </section>

      <nav aria-labelledby="titulo-pedido">
        <div className={styles.secao}><h2 id="titulo-pedido">Fazer um pedido</h2></div>
        <ul className={styles.portas}>
          {pedidos.map(({ href, icone: Icone, area, cor, titulo, texto, principal }, i) => (
            <li key={href} style={{ "--ordem": i } as React.CSSProperties}>
              <Link href={href} className={principal ? `${styles.porta} ${styles.principal}` : styles.porta}>
                <span className={styles.icone} aria-hidden="true"><Icone size={22} /></span>
                <span className={`${styles.area} ${styles[cor]}`}>{area}</span>
                <strong>{titulo}</strong>
                <span className={styles.texto}>{texto}</span>
                <ArrowRight size={18} className={styles.seta} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Secundário: quem não tem login manda ideia ou pedido para a social
          media. A rota /ideia é da conversa do quadro da social. */}
      <Link href={na("/ideia")} className={styles.ideia}>
        <span className={styles.iconeIdeia} aria-hidden="true"><Lightbulb size={18} /></span>
        <span><strong>Mandar uma ideia para a social</strong><span>Sugestão de post, campanha ou pedido para a social media, sem precisar de login.</span></span>
        <ArrowRight size={16} className={styles.setaIdeia} aria-hidden="true" />
      </Link>

      <section aria-labelledby="titulo-trabalhe">
        <div className={styles.secao}><h2 id="titulo-trabalhe">Trabalhe com a gente</h2></div>
        <div className={styles.trabalhe}>
          <div>
            <h3>Faça parte da rede de profissionais</h3>
            <p>Mande seus dados e o portfólio. Quando surgir um trabalho na sua cidade ou na sua área, a equipe chama você.</p>
          </div>
          <div className={styles.botoes}>
            <Link href={na("/videomaker")} className={styles.convite}>Quer ser um videomaker?</Link>
            <Link href={na("/designer")} className={styles.convite}>Quer ser um designer?</Link>
          </div>
        </div>
      </section>

      <footer className={styles.rodape}>
        <span>Os dados enviados aqui ficam com {empresa.nome}.</span>
        <span>Feito com NuFlow</span>
      </footer>
    </main>
  )
}

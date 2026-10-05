"use client"
// A página inicial do NuFlow. Substitui a landing antiga (HTML injetado + runtime
// próprio): mesmas animações do topo, aprovadas pelo Giovani, com um desenho só
// — tipografia num peso, seções no mesmo ritmo e maquetes cheias como o sistema
// de verdade. Sem preço: valor só entra com a confirmação dele.
import { useEffect, useRef } from "react"
import Link from "next/link"
import { ArrowDown, ArrowRight, ArrowUpRight, Building2, Clapperboard, Images, MessageCircle, Users } from "lucide-react"
import { iniciarMotionDoHero } from "./heroMotion"
import { AgendaDemo, AprovacoesDemo, AvisosDemo, EquipeDemo, FluxoDemo } from "./demos"
import s from "./Landing.module.css"

/** Sem número de vendas configurado, "Conversar" leva direto ao formulário de interesse. */
function Conversar({ contactUrl, className, children }: { contactUrl: string | null; className: string; children: React.ReactNode }) {
  if (!contactUrl) return <Link href="/comecar" className={className}>{children}</Link>
  return (
    <button type="button" className={className} onClick={() => (document.getElementById("conversar") as HTMLDialogElement | null)?.showModal()}>
      {children}
    </button>
  )
}

function HeroMotion() {
  const moldura = useRef<HTMLDivElement>(null)
  const palco = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const fase = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!moldura.current || !palco.current) return
    return iniciarMotionDoHero({ palco: palco.current, moldura: moldura.current, botao: botao.current, fase: fase.current })
  }, [])
  return (
    <figure className={s.heroVisual}>
      <div ref={moldura} className={s.heroMoldura}>
        <div className={s.heroBarra} aria-hidden="true"><span className={s.bolinhas}><i /><i /><i /></span><span>WhatsApp → NuFlow</span></div>
        <div className={s.heroPalcoArea}>
          <div ref={palco} className={s.heroPalco} aria-hidden="true" />
        </div>
      </div>
      <figcaption className={s.heroLegenda}>
        <span>Fase: <b ref={fase}>Caos</b></span>
        <span className={s.heroLegendaNota}>Exemplo ilustrativo</span>
        <button ref={botao} type="button" className={s.pausar} aria-pressed="true">Pausar animação</button>
      </figcaption>
    </figure>
  )
}

const RECURSOS = [
  {
    id: "agenda", rotulo: "Agenda + WhatsApp", t1: "Agendou.", t2: "Saiu da cabeça.",
    texto: "O videomaker marca a captação, o compromisso ganha lugar na agenda e o aviso chega no WhatsApp — com lembrete antes de sair. Mais presença no job, menos medo de esquecer.",
    itens: ["Captações, edições e entregas na mesma agenda", "Confirmação e lembrete pelo WhatsApp", "Tudo ligado ao card da demanda"],
    Demo: AgendaDemo,
  },
  {
    id: "avisos", rotulo: "Avisos que acompanham o trabalho", t1: "Foco no job.", t2: "O NuFlow lembra o resto.",
    texto: "Um novo job, a próxima captação, uma entrega pronta para aprovar. Cada pessoa recebe no WhatsApp só o que é dela, na hora em que importa, e volta ao trabalho com contexto.",
    itens: ["Avisos por mudança de etapa e agenda", "Cada pessoa recebe o que é dela", "Configurável por empresa"],
    Demo: AvisosDemo,
  },
  {
    id: "aprovacoes", rotulo: "Aprovações", t1: "Os pedidos chegam.", t2: "Você escolhe o que vira job.",
    texto: "Carrossel, campanha, filme. Veja o briefing, abra os detalhes e aprove a entrada antes de a produção começar. Nada entra no quadro sem passar por você.",
    itens: ["Pedido com briefing e referências", "Aprovação de entrada e de entrega", "Histórico de cada decisão"],
    Demo: AprovacoesDemo,
  },
  {
    id: "equipe", rotulo: "Equipe", t1: "Você vê a equipe.", t2: "E o que pesa sobre ela.",
    texto: "Demanda atrasada não conta a história inteira. Veja trabalhos ativos, entregas e atrasos por pessoa para redistribuir com contexto, antes de virar problema.",
    itens: ["Carga por profissional", "Videomakers internos e externos", "Relatórios por período"],
    Demo: EquipeDemo,
  },
]

const EXTRAS = [
  { Icone: Clapperboard, titulo: "Audiovisual e Growth", texto: "Fluxos próprios para produção de vídeo e para demandas de conteúdo, no mesmo sistema." },
  { Icone: Users, titulo: "Videomakers internos e externos", texto: "Escale, acompanhe e avalie quem é da casa e quem é parceiro." },
  { Icone: Images, titulo: "Galeria de entregas", texto: "Os vídeos finais ficam reunidos para assistir, baixar e compartilhar." },
  { Icone: Building2, titulo: "Cada empresa, seu espaço", texto: "Dados separados por empresa: o que é de uma não aparece para outra." },
]

const DUVIDAS = [
  ["Serve para audiovisual e Growth?", "Sim. O NuFlow tem fluxos próprios para produção audiovisual e para demandas de Growth, cada um com suas etapas."],
  ["Como funcionam os lembretes?", "O sistema avisa pelo WhatsApp quando uma demanda muda de etapa e quando um compromisso da agenda se aproxima. Os envios dependem da configuração da empresa e da integração com WhatsApp."],
  ["Preciso instalar alguma coisa?", "Não. O NuFlow funciona no navegador, no computador e no celular."],
  ["Meus dados ficam separados de outras empresas?", "Sim. Cada empresa tem o próprio espaço, e os dados de uma não aparecem para outra."],
]

export default function Landing({ contactUrl, areaCliente }: { contactUrl: string | null; areaCliente: string }) {
  return (
    <div className={s.pagina}>
      <a href="#conteudo" className={s.pular}>Pular para o conteúdo</a>
      <header className={s.topo}>
        <div className={s.topoInterno}>
          <Link href="/" className={s.marca} aria-label="NuFlow, início">NuFlow<i>.</i></Link>
          <nav className={s.nav} aria-label="Seções">
            <a href="#fluxo">Como funciona</a>
            <a href="#recursos">Recursos</a>
            <a href="#duvidas">Dúvidas</a>
          </nav>
          <div className={s.topoAcoes}>
            <Link href="/login" className={s.botaoFantasma}>Entrar</Link>
            <Conversar contactUrl={contactUrl} className={s.botaoPrimario}><span className={s.soDesktop}>Conversar com especialista</span><span className={s.soCelular}>Conversar</span><ArrowUpRight size={16} aria-hidden="true" /></Conversar>
          </div>
        </div>
      </header>

      <main id="conteudo">
        <section className={s.hero}>
          <div className={s.heroTexto}>
            <p className={s.rotulo}>Gestão para quem vive de criar</p>
            <h1>A desorganização rouba seu foco. <span>O Flow devolve.</span></h1>
            <p className={s.heroSub}>Pedidos, agenda, equipe e aprovações num só lugar. O NuFlow organiza o caminho de cada demanda, do pedido à entrega, e avisa cada pessoa pelo WhatsApp na hora certa.</p>
            <div className={s.acoes}>
              <Conversar contactUrl={contactUrl} className={s.botaoPrimario}>Conversar com especialista<ArrowUpRight size={18} aria-hidden="true" /></Conversar>
              <a href="#fluxo" className={s.botaoContorno}>Ver como funciona<ArrowDown size={18} aria-hidden="true" /></a>
            </div>
            <p className={s.cliente}>Veio pedir um vídeo ou uma gravação? <Link href={areaCliente}>Sou cliente — fazer um pedido</Link></p>
            <ul className={s.selos} aria-label="Para quem é">
              <li>Audiovisual</li><li>Growth</li><li>Videomakers internos e externos</li>
            </ul>
          </div>
          <HeroMotion />
        </section>

        <section id="fluxo" className={s.secao} aria-labelledby="fluxo-titulo">
          <div className={s.cabecalho}>
            <p className={s.rotulo}>Como funciona</p>
            <h2 id="fluxo-titulo">Uma demanda. <span>Do início ao fim.</span></h2>
            <p>Do pedido à publicação, cada etapa tem dono, prazo e aviso. Acompanhe um filme percorrendo o quadro.</p>
          </div>
          <FluxoDemo />
        </section>

        <section id="recursos" className={s.secao} aria-label="Recursos">
          {RECURSOS.map(({ id, rotulo, t1, t2, texto, itens, Demo }, i) => (
            <article key={id} className={`${s.recurso} ${i % 2 ? s.recursoInvertido : ""}`} aria-labelledby={`r-${id}`}>
              <div className={s.recursoTexto}>
                <p className={s.rotulo}>{rotulo}</p>
                <h2 id={`r-${id}`}>{t1} <span>{t2}</span></h2>
                <p>{texto}</p>
                <ul className={s.lista}>{itens.map(x => <li key={x}>{x}</li>)}</ul>
              </div>
              <Demo />
            </article>
          ))}
        </section>

        <section className={`${s.secao} ${s.secaoCompacta}`} aria-labelledby="extras-titulo">
          <div className={s.cabecalho}>
            <p className={s.rotulo}>E mais</p>
            <h2 id="extras-titulo">Feito para a rotina <span>de quem produz.</span></h2>
          </div>
          <div className={s.extras}>
            {EXTRAS.map(({ Icone, titulo, texto }) => (
              <div key={titulo} className={s.extra}>
                <span className={s.extraIcone} aria-hidden="true"><Icone size={20} /></span>
                <h3>{titulo}</h3>
                <p>{texto}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="duvidas" className={`${s.secao} ${s.secaoCompacta}`} aria-labelledby="duvidas-titulo">
          <div className={s.duvidasGrade}>
            <div className={s.cabecalho}>
              <p className={s.rotulo}>Dúvidas frequentes</p>
              <h2 id="duvidas-titulo">Perguntas <span>que sempre aparecem.</span></h2>
              <p>Não achou a sua? Fale com a gente.</p>
              <Conversar contactUrl={contactUrl} className={s.botaoContorno}>Conversar com especialista<ArrowRight size={18} aria-hidden="true" /></Conversar>
            </div>
            <div className={s.duvidas}>
              {DUVIDAS.map(([p, r]) => (
                <details key={p}><summary>{p}</summary><p>{r}</p></details>
              ))}
            </div>
          </div>
        </section>

        <section className={s.final} aria-labelledby="final-titulo">
          <div className={s.finalInterno}>
            <h2 id="final-titulo">Você é capaz. <span>Só precisa do NuFlow para entregar mais.</span></h2>
            <p>Comece conhecendo o caminho de uma demanda na sua operação.</p>
            <div className={s.acoes}>
              <Conversar contactUrl={contactUrl} className={s.botaoPrimario}>Conversar com especialista<ArrowUpRight size={18} aria-hidden="true" /></Conversar>
              <Link href="/login" className={s.botaoContorno}>Já tenho conta</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={s.rodape}>
        <div className={s.rodapeInterno}>
          <span className={s.marca}>NuFlow<i>.</i></span>
          <span>Gestão de operações criativas</span>
          <Link href={areaCliente} className={s.rodapeCliente}>Sou cliente — fazer um pedido</Link>
          <span className={s.rodapeNota}>As animações usam dados demonstrativos. Nenhum pedido ou mensagem é enviado.</span>
        </div>
      </footer>

      {contactUrl && (
        <dialog id="conversar" className={s.dialogo} aria-labelledby="conversar-titulo">
          <form method="dialog" className={s.dialogoFechar}><button aria-label="Fechar">×</button></form>
          <h2 id="conversar-titulo">Conversar com especialista</h2>
          <p>Fale com a equipe do NuFlow sobre recursos e condições para a sua operação.</p>
          <a className={s.botaoPrimario} href={contactUrl} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true" />Conversar pelo WhatsApp</a>
          <p className={s.dialogoAlt}>Prefere que a gente chame você? <Link href="/comecar">Deixe seu contato</Link>.</p>
        </dialog>
      )}
    </div>
  )
}

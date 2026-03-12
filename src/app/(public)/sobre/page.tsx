import Link from "next/link"
import { Film, Zap, CheckCircle2, Users, MessageCircle, BarChart2, ArrowRight, Star } from "lucide-react"

export const metadata = { title: "Sobre Nós — VideoOps" }

const SERVICOS = [
  { icon: Film, titulo: "Produção Audiovisual", desc: "Captação profissional, direção criativa e produção completa de vídeos institucionais, campanhas e conteúdo digital." },
  { icon: Zap, titulo: "Conteúdo Urgente", desc: "Fluxo especial para demandas urgentes com equipe dedicada e entrega garantida dentro do prazo crítico." },
  { icon: Users, titulo: "Equipe Especializada", desc: "Videomakers, editores e gestores de conteúdo treinados para cada tipo de projeto audiovisual." },
  { icon: MessageCircle, titulo: "Comunicação Ágil", desc: "Acompanhamento em tempo real via WhatsApp e painel web. Você sempre sabe o status do seu projeto." },
  { icon: BarChart2, titulo: "Relatórios e Métricas", desc: "Análise de performance dos conteúdos produzidos, com dados de engajamento e alcance." },
  { icon: CheckCircle2, titulo: "Aprovação Facilitada", desc: "Sistema de aprovação de vídeos com link compartilhável — revise e aprove direto do celular." },
]

const DEPOIMENTOS = [
  { nome: "Ana Costa", cargo: "Gerente de Marketing", empresa: "TechBrasil", texto: "A equipe do VideoOps transformou nossa comunicação. Entregam com qualidade e prazo impecáveis.", estrelas: 5 },
  { nome: "Rafael Mendes", cargo: "CEO", empresa: "StartupXYZ", texto: "Finalmente encontrei uma produtora que entende a urgência de conteúdo para redes sociais. Recomendo muito!", estrelas: 5 },
  { nome: "Camila Santos", cargo: "Diretora de RH", empresa: "Grupo Omega", texto: "Vídeos institucionais de altíssima qualidade. O processo de aprovação via link é muito conveniente.", estrelas: 5 },
]

export default function SobrePage() {
  return (
    <div className="text-white">
      {/* Nav */}
      <nav className="border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <Film className="w-4 h-4 text-zinc-900" />
            </div>
            <span className="font-bold text-lg">VideoOps</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-zinc-400">
            <Link href="/sobre" className="text-white font-medium">Sobre</Link>
            <Link href="/cadastrar-videomaker" className="hover:text-white transition-colors">Seja Videomaker</Link>
            <Link href="/cadastrar-demanda" className="hover:text-white transition-colors">Solicitar Projeto</Link>
            <Link
              href="/login"
              className="bg-white text-zinc-900 text-sm font-medium px-4 py-2 rounded-lg hover:bg-zinc-100 transition-colors"
            >
              Acessar Sistema
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-1.5 text-xs text-zinc-400 mb-6">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          Produção audiovisual de alto impacto
        </div>
        <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6">
          Transformamos suas ideias em{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
            vídeos que convertem
          </span>
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl mx-auto mb-10">
          Somos uma plataforma completa de produção audiovisual que conecta empresas com os melhores videomakers e editores do Brasil.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="/cadastrar-demanda"
            className="flex items-center gap-2 bg-white text-zinc-900 font-semibold px-6 py-3 rounded-xl hover:bg-zinc-100 transition-colors"
          >
            Solicitar Projeto <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/cadastrar-videomaker"
            className="flex items-center gap-2 border border-zinc-700 text-zinc-300 font-medium px-6 py-3 rounded-xl hover:border-zinc-500 hover:text-white transition-colors"
          >
            Trabalhe Conosco
          </Link>
        </div>
      </section>

      {/* Números */}
      <section className="border-y border-zinc-800 bg-zinc-900/50">
        <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { numero: "500+", label: "Projetos entregues" },
            { numero: "150+", label: "Clientes ativos" },
            { numero: "80+", label: "Videomakers parceiros" },
            { numero: "98%", label: "Satisfação dos clientes" },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-bold text-white">{s.numero}</p>
              <p className="text-sm text-zinc-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Serviços */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3">O que fazemos</h2>
          <p className="text-zinc-400">Soluções completas em produção audiovisual para cada necessidade</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {SERVICOS.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.titulo} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-700 transition-colors">
                <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-semibold text-white mb-2">{s.titulo}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{s.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Como funciona */}
      <section className="bg-zinc-900/50 border-y border-zinc-800">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Como funciona</h2>
            <p className="text-zinc-400">Do pedido ao vídeo finalizado em 4 passos simples</p>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { num: "01", titulo: "Solicite", desc: "Preencha o formulário com os detalhes do seu projeto" },
              { num: "02", titulo: "Aprovação", desc: "Nossa equipe avalia e aprova a demanda em até 24h" },
              { num: "03", titulo: "Produção", desc: "Videomaker dedicado realiza a captação no local" },
              { num: "04", titulo: "Entrega", desc: "Receba o link de aprovação e finalize o projeto" },
            ].map((p) => (
              <div key={p.num} className="text-center">
                <div className="w-12 h-12 bg-white text-zinc-900 rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-4">
                  {p.num}
                </div>
                <h3 className="font-semibold text-white mb-2">{p.titulo}</h3>
                <p className="text-sm text-zinc-400">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Depoimentos */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3">O que nossos clientes dizem</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {DEPOIMENTOS.map((d) => (
            <div key={d.nome} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <div className="flex items-center gap-1 mb-3">
                {Array.from({ length: d.estrelas }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed mb-4">&ldquo;{d.texto}&rdquo;</p>
              <div>
                <p className="font-semibold text-white text-sm">{d.nome}</p>
                <p className="text-xs text-zinc-400">{d.cargo} · {d.empresa}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-zinc-800">
        <div className="max-w-6xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl font-bold mb-4">Pronto para começar?</h2>
          <p className="text-zinc-400 mb-8">Solicite seu projeto agora e nossa equipe entrará em contato em breve.</p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/cadastrar-demanda"
              className="flex items-center gap-2 bg-white text-zinc-900 font-semibold px-8 py-3 rounded-xl hover:bg-zinc-100 transition-colors"
            >
              Solicitar Projeto <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/cadastrar-videomaker"
              className="flex items-center gap-2 border border-zinc-700 text-zinc-300 font-medium px-8 py-3 rounded-xl hover:border-zinc-500 hover:text-white transition-colors"
            >
              Quero ser Videomaker
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-sm text-zinc-500">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-white rounded-md flex items-center justify-center">
              <Film className="w-3 h-3 text-zinc-900" />
            </div>
            <span>VideoOps © {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/sobre" className="hover:text-white transition-colors">Sobre</Link>
            <Link href="/cadastrar-videomaker" className="hover:text-white transition-colors">Videomakers</Link>
            <Link href="/cadastrar-demanda" className="hover:text-white transition-colors">Solicitar</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

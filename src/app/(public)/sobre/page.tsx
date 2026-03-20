"use client"

import Link from "next/link"
import { useState, useEffect } from "react"
import { Film, ArrowRight, CheckCircle2, ClipboardList, Camera, Star, Shield, Heart, Crown, Zap, Users } from "lucide-react"

const PALAVRAS_CICLO = ["que convence", "que converte", "que confiam", "que explica"]

const CINCO_CHAVES = [
  { icon: Shield, titulo: "Segurança", desc: "Profissionalismo e confiança em cada entrega." },
  { icon: Heart, titulo: "Alegria em servir", desc: "Amor genuíno pelo que faz e pelos clientes que atende." },
  { icon: Crown, titulo: "Postura de dono", desc: "Responsabilidade total pelo resultado do projeto." },
  { icon: Star, titulo: "Excelência", desc: "Qualidade acima do esperado, sempre." },
  { icon: Users, titulo: "Lealdade", desc: "Comprometimento com a missão e os valores da equipe." },
]

const PASSOS_DEMANDA = [
  { num: "01", titulo: "Abra a demanda", desc: "Preencha o formulário com o tipo de vídeo, prazo e detalhes do projeto — leva menos de 3 minutos." },
  { num: "02", titulo: "Triagem interna", desc: "Nossa equipe analisa a demanda, define prioridade e aloca o videomaker mais adequado." },
  { num: "03", titulo: "Captação e edição", desc: "O videomaker realiza a gravação e o material vai para edição com acompanhamento em tempo real." },
  { num: "04", titulo: "Aprovação e entrega", desc: "Você recebe um link para revisar e aprovar o vídeo final antes da publicação." },
]

export default function SobrePage() {
  const [palavraIdx, setPalavraIdx] = useState(0)
  const [fade, setFade] = useState(true)

  useEffect(() => {
    const intervalo = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setPalavraIdx((i) => (i + 1) % PALAVRAS_CICLO.length)
        setFade(true)
      }, 300)
    }, 2200)
    return () => clearInterval(intervalo)
  }, [])

  return (
    <div className="text-white min-h-screen bg-zinc-950">

      {/* Nav */}
      <nav className="border-b border-zinc-800 sticky top-0 z-50 bg-zinc-950/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="NuFlow" className="w-8 h-8 rounded-lg" />
            <span className="font-bold text-lg tracking-tight">NuFlow</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-zinc-400">
            <Link href="#como-funciona" className="hover:text-white transition-colors hidden md:block">Como funciona</Link>
            <Link href="#seja-parceiro" className="hover:text-white transition-colors hidden md:block">Seja Parceiro</Link>
            <Link href="/cadastrar-demanda" className="hover:text-white transition-colors hidden md:block">Abrir Demanda</Link>
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
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-1.5 text-xs text-zinc-400 mb-8">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          Produção audiovisual in-house
        </div>

        <h1 className="text-5xl md:text-6xl font-black leading-tight mb-6 tracking-tight">
          Transformamos suas ideias{" "}
          <br className="hidden md:block" />
          em vídeos{" "}
          <span
            className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 inline-block transition-opacity duration-300"
            style={{ opacity: fade ? 1 : 0 }}
          >
            {PALAVRAS_CICLO[palavraIdx]}
          </span>
        </h1>

        <p className="text-lg text-zinc-400 max-w-2xl mx-auto mb-10">
          Uma operação audiovisual interna que gerencia demandas, videomakers parceiros e entregas com rastreabilidade total — do briefing à publicação.
        </p>

        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="/cadastrar-demanda"
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-purple-900/30 text-base"
          >
            <ClipboardList className="w-5 h-5" />
            Abrir Demanda
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="#seja-parceiro"
            className="flex items-center gap-2 border border-zinc-700 text-zinc-300 font-medium px-8 py-3.5 rounded-xl hover:border-zinc-500 hover:text-white transition-colors text-base"
          >
            <Camera className="w-4 h-4" />
            Seja um Videomaker Parceiro
          </Link>
        </div>
      </section>

      {/* Como funciona — abrir uma demanda */}
      <section id="como-funciona" className="bg-zinc-900/40 border-y border-zinc-800">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <p className="text-xs text-purple-400 font-semibold uppercase tracking-widest mb-2">Fluxo de trabalho</p>
            <h2 className="text-3xl md:text-4xl font-bold mb-3">Como abrir uma demanda</h2>
            <p className="text-zinc-400 max-w-xl mx-auto">Do briefing ao vídeo finalizado em 4 passos simples e rastreáveis</p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            {PASSOS_DEMANDA.map((p, i) => (
              <div key={p.num} className="relative">
                {i < PASSOS_DEMANDA.length - 1 && (
                  <div className="hidden md:block absolute top-6 left-[calc(50%+24px)] right-0 h-px bg-zinc-700" />
                )}
                <div className="text-center">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm mx-auto mb-4 shadow-lg shadow-purple-900/30 relative z-10">
                    {p.num}
                  </div>
                  <h3 className="font-bold text-white mb-2">{p.titulo}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/cadastrar-demanda"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-purple-900/30"
            >
              <ClipboardList className="w-5 h-5" />
              Quero abrir minha demanda
            </Link>
          </div>
        </div>
      </section>

      {/* Seja um Videomaker Parceiro */}
      <section id="seja-parceiro" className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <p className="text-xs text-amber-400 font-semibold uppercase tracking-widest mb-2">Para videomakers</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-3">Seja um Videomaker Parceiro</h2>
          <p className="text-zinc-400 max-w-xl mx-auto">
            Buscamos profissionais que amam o que fazem e que entendem que um vídeo bem feito transforma negócios.
          </p>
        </div>

        {/* Card principal */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 mb-10">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="md:w-1/2">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                  <Heart className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="text-xl font-bold text-white">Tem que amar o que faz</h3>
              </div>
              <p className="text-zinc-400 leading-relaxed mb-6">
                Não basta ter a câmera. O parceiro NuFlow é apaixonado por contar histórias, entende a urgência de cada projeto e trata cada entrega como se fosse a última chance de impressionar.
              </p>

              {/* As 5 chaves */}
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">As 5 chaves do parceiro NuFlow</p>
                <div className="space-y-3">
                  {CINCO_CHAVES.map(({ icon: Icon, titulo, desc }) => (
                    <div key={titulo} className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{titulo}</p>
                        <p className="text-xs text-zinc-500">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="md:w-1/2 space-y-4">
              {/* Requisitos PJ */}
              <div className="bg-zinc-800/60 border border-zinc-700 rounded-xl p-5">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-4">Requisitos obrigatórios</p>
                <ul className="space-y-3">
                  {[
                    "Pessoa Jurídica (PJ) com CNPJ ativo",
                    "CNAE compatível com atividades audiovisuais",
                    "Equipamento próprio em boas condições",
                    "Portfólio com trabalhos realizados",
                    "Disponibilidade de agenda para demandas agendadas",
                  ].map((r) => (
                    <li key={r} className="flex items-start gap-2.5 text-sm text-zinc-300">
                      <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pagamento */}
              <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-800/40 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <p className="text-sm font-bold text-amber-300">Forma de pagamento</p>
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed">
                  O pagamento é realizado em até <span className="font-bold text-white">15 dias úteis</span> após a emissão da nota fiscal, via <span className="font-bold text-white">PIX</span>. Sem burocracia, sem atraso.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center">
          <Link
            href="/cadastrar-videomaker"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-bold px-10 py-4 rounded-xl transition-all shadow-lg shadow-amber-900/30 text-base"
          >
            <Camera className="w-5 h-5" />
            Quero me cadastrar como Videomaker Parceiro
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="text-xs text-zinc-600 mt-3">Seu cadastro passa por análise. Retornamos em até 3 dias úteis.</p>
        </div>
      </section>

      {/* CTA final */}
      <section className="border-t border-zinc-800 bg-zinc-900/30">
        <div className="max-w-6xl mx-auto px-6 py-16 text-center">
          <h2 className="text-3xl font-bold mb-3">Pronto para começar?</h2>
          <p className="text-zinc-400 mb-8 max-w-lg mx-auto">Abra sua primeira demanda agora. Nossa equipe entra em ação em até 24 horas.</p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/cadastrar-demanda"
              className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-purple-900/30"
            >
              <ClipboardList className="w-5 h-5" />
              Abrir Demanda <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/cadastrar-videomaker"
              className="flex items-center gap-2 border border-zinc-700 text-zinc-300 font-medium px-8 py-3.5 rounded-xl hover:border-zinc-500 hover:text-white transition-colors"
            >
              <Camera className="w-4 h-4" />
              Seja um Videomaker Parceiro
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-zinc-500">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="NuFlow" className="w-6 h-6 rounded-md" />
            <span>NuFlow — Operação Audiovisual In-House © {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="#como-funciona" className="hover:text-white transition-colors">Como funciona</Link>
            <Link href="/cadastrar-videomaker" className="hover:text-white transition-colors">Seja Parceiro</Link>
            <Link href="/login" className="hover:text-white transition-colors">Sistema</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

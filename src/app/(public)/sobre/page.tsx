"use client"

import Link from "next/link"
import { useState, useEffect, useRef, useCallback } from "react"
import { ArrowRight, CheckCircle2, ClipboardList, Camera, Star, Shield, Heart, Crown, Zap, Users, ChevronLeft, ChevronRight, Play, X } from "lucide-react"

interface Depoimento {
  id: string
  nome: string
  cidade: string | null
  videoUrl: string
  thumbnailUrl: string | null
  descricao: string | null
}

function getVideoEmbed(url: string): { type: "youtube" | "drive" | "video"; src: string } {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s?]+)/)
  if (ytMatch) return { type: "youtube", src: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0&playsinline=1` }
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/)
  if (driveMatch) return { type: "drive", src: `https://drive.google.com/file/d/${driveMatch[1]}/preview` }
  return { type: "video", src: url }
}

function getYoutubeThumbnail(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s?]+)/)
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null
}

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

  // Depoimentos
  const [depoimentos, setDepoimentos] = useState<Depoimento[]>([])
  const [currentDep, setCurrentDep] = useState(0)
  const [playingDep, setPlayingDep] = useState<Depoimento | null>(null)
  const [isHoveringCarousel, setIsHoveringCarousel] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const CARD_W = 196 // 176px (w-44) + 20px gap

  const goTo = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(i, depoimentos.length - 1))
    trackRef.current?.scrollTo({ left: clamped * CARD_W, behavior: "smooth" })
    setCurrentDep(clamped)
  }, [depoimentos.length])

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

  useEffect(() => {
    fetch("/api/publico/depoimentos")
      .then(r => r.json())
      .then(d => setDepoimentos(d.depoimentos ?? []))
      .catch(() => null)
  }, [])

  // Auto-advance
  useEffect(() => {
    if (depoimentos.length <= 1 || playingDep || isHoveringCarousel) return
    const id = setInterval(() => {
      setCurrentDep(c => {
        const next = (c + 1) % depoimentos.length
        trackRef.current?.scrollTo({ left: next * CARD_W, behavior: "smooth" })
        return next
      })
    }, 4000)
    return () => clearInterval(id)
  }, [depoimentos.length, playingDep, isHoveringCarousel])

  // Close player on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPlayingDep(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
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
            <Link href="/galeria" className="hover:text-white transition-colors hidden md:block">Galeria</Link>
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

      {/* Depoimentos */}
      {depoimentos.length > 0 && (
        <section id="depoimentos" className="py-20 bg-zinc-900/40 border-y border-zinc-800 overflow-hidden">
          <div className="max-w-6xl mx-auto px-6 mb-10">
            <p className="text-xs font-semibold tracking-widest text-amber-400 uppercase mb-3">
              O que dizem os parceiros
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              Videomakers que já trabalharam com a gente
            </h2>
          </div>

          {/* Carrossel */}
          <div
            className="relative"
            onMouseEnter={() => setIsHoveringCarousel(true)}
            onMouseLeave={() => setIsHoveringCarousel(false)}
          >
            {/* Prev button */}
            {currentDep > 0 && (
              <button
                onClick={() => goTo(currentDep - 1)}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-zinc-800/90 border border-zinc-700 flex items-center justify-center hover:bg-zinc-700 transition-colors shadow-lg"
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
            )}
            {/* Next button */}
            {currentDep < depoimentos.length - 1 && (
              <button
                onClick={() => goTo(currentDep + 1)}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-zinc-800/90 border border-zinc-700 flex items-center justify-center hover:bg-zinc-700 transition-colors shadow-lg"
              >
                <ChevronRight className="w-5 h-5 text-white" />
              </button>
            )}

            {/* Track */}
            <div
              ref={trackRef}
              className="flex gap-5 px-8 overflow-x-auto"
              style={{ scrollSnapType: "x mandatory", scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {/* Left padding card (invisible, just for centering effect on mobile) */}
              {depoimentos.map((dep) => {
                const thumb = dep.thumbnailUrl ?? getYoutubeThumbnail(dep.videoUrl)
                return (
                  <div
                    key={dep.id}
                    onClick={() => setPlayingDep(dep)}
                    className="flex-none w-44 cursor-pointer group"
                    style={{ scrollSnapAlign: "start" }}
                  >
                    {/* 9:16 card */}
                    <div className="relative w-44 rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800/80 shadow-xl"
                      style={{ aspectRatio: "9/16" }}>
                      {/* Thumbnail or gradient */}
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={dep.nome}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/60 via-zinc-900 to-blue-900/60" />
                      )}

                      {/* Dark overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />

                      {/* Play button */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center transition-transform duration-200 group-hover:scale-110 group-hover:bg-white/30">
                          <Play className="w-6 h-6 text-white fill-white ml-1" />
                        </div>
                      </div>

                      {/* Info na base */}
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <p className="text-sm font-bold text-white leading-tight">{dep.nome}</p>
                        {dep.cidade && (
                          <p className="text-xs text-zinc-400 mt-0.5">{dep.cidade}</p>
                        )}
                        {dep.descricao && (
                          <p className="text-xs text-zinc-300 mt-1.5 line-clamp-2 leading-relaxed italic">
                            "{dep.descricao}"
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Dots */}
            {depoimentos.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-6">
                {depoimentos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === currentDep ? "bg-amber-400 w-5" : "bg-zinc-600 w-1.5 hover:bg-zinc-500"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Player Lightbox */}
          {playingDep && (() => {
            const embed = getVideoEmbed(playingDep.videoUrl)
            return (
              <div
                className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4"
                onClick={() => setPlayingDep(null)}
              >
                <div
                  className="relative"
                  style={{ height: "min(90vh, 560px)", aspectRatio: "9/16" }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* Close button */}
                  <button
                    onClick={() => setPlayingDep(null)}
                    className="absolute -top-10 right-0 flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-sm z-10"
                  >
                    <X className="w-4 h-4" /> Fechar
                  </button>

                  {/* Player */}
                  <div className="w-full h-full rounded-2xl overflow-hidden bg-zinc-950 shadow-2xl">
                    {embed.type === "video" ? (
                      <video
                        src={embed.src}
                        controls
                        autoPlay
                        playsInline
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <iframe
                        src={embed.src}
                        className="w-full h-full"
                        allow="autoplay; fullscreen; picture-in-picture"
                        allowFullScreen
                      />
                    )}
                  </div>

                  {/* Info abaixo */}
                  <div className="mt-3 text-center">
                    <p className="text-white font-semibold">{playingDep.nome}</p>
                    {playingDep.cidade && <p className="text-zinc-400 text-sm">{playingDep.cidade}</p>}
                  </div>
                </div>
              </div>
            )
          })()}
        </section>
      )}

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
            <Link href="/galeria" className="hover:text-white transition-colors">Galeria</Link>
            <Link href="/login" className="hover:text-white transition-colors">Sistema</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

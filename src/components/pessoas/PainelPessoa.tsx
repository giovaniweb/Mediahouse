"use client"

// Painel lateral da pessoa — tudo sobre ela num lugar só.
//
// Hoje a mesma pessoa é vista em três telas: dados e acesso em /usuarios, carga
// em /equipe, ficha profissional em /videomakers. Quem precisa saber "quem é e o
// que pode fazer" abre três abas e cruza na cabeça — foi assim que o João Paulo
// acabou numa aba cujo modal não editava permissão.
//
// É painel lateral, não modal: a lista continua visível atrás, então dá para
// percorrer várias pessoas sem perder o contexto da busca.

import { useEffect, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { fetcher } from "@/lib/fetcher"
import { LABEL_VINCULO, LABEL_NIVEL, type Vinculo, type Nivel } from "@/lib/pessoas-vocabulario"
import {
  X, Mail, Phone, MapPin, Building2, Shield, Activity, Clock,
  Camera, Clapperboard, Palette, ExternalLink, AlertTriangle,
} from "lucide-react"

type Detalhe = {
  pessoa: {
    id: string; nome: string; email: string | null; telefone: string | null
    status: string; funcao: string; equipes: string[]
    vinculo: Vinculo; nivel: Nivel; perfilAcesso: string
    liderAudiovisual: boolean; localizacao: string | null
    entrouNaOrgEm: string
    capacidades: { captacao: boolean; edicao: boolean; design: boolean }
    fichas: { videomakerId: string | null; editorId: string | null; designerId: string | null
      habilidades: string[]; especialidade: string | null; avaliacao: number | null }
  }
  carga: { capacidadeTotal: number | null; emAndamento: number; disponivel: number | null; atrasadas: number; concluidas: number }
  historico: { id: string; quando: string; origem: string; texto: string; demanda: { id: string; codigo: string } | null }[]
}

type Aba = "geral" | "acessos" | "carga" | "historico"

export function PainelPessoa({ pessoaId, onFechar }: { pessoaId: string | null; onFechar: () => void }) {
  const [aba, setAba] = useState<Aba>("geral")

  const { data, isLoading } = useSWR<Detalhe>(pessoaId ? `/api/pessoas/${pessoaId}` : null, fetcher)

  // Trocar de pessoa volta para a primeira aba — senão abre-se alguém novo já
  // no Histórico, que raramente é o que se quer ver primeiro.
  useEffect(() => { setAba("geral") }, [pessoaId])

  useEffect(() => {
    if (!pessoaId) return
    const aoTeclar = (e: KeyboardEvent) => {
      // Mesmo cuidado do modal de demanda: ESC dentro de select/data pertence ao
      // controle, não ao painel.
      if (e.key !== "Escape" || e.defaultPrevented) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === "SELECT" || tag === "INPUT") return
      onFechar()
    }
    window.addEventListener("keydown", aoTeclar)
    return () => window.removeEventListener("keydown", aoTeclar)
  }, [pessoaId, onFechar])

  if (!pessoaId) return null

  const p = data?.pessoa
  const c = data?.carga

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onFechar}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-label={p ? `Detalhes de ${p.nome}` : "Detalhes da pessoa"}
        className="fixed right-0 top-0 z-50 h-full w-full max-w-[26rem] bg-zinc-900 border-l border-zinc-800 shadow-2xl flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500">Detalhes da pessoa</p>
            <h2 className="text-lg font-semibold text-zinc-100 truncate">
              {p?.nome ?? (isLoading ? "Carregando…" : "—")}
            </h2>
            {p && (
              <p className="text-xs text-zinc-500 truncate">
                {p.funcao || "Sem função definida"}
                {p.equipes.length > 0 && ` · ${p.equipes.join(", ")}`}
              </p>
            )}
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-1 px-5 border-b border-zinc-800 shrink-0">
          {([["geral", "Visão geral"], ["acessos", "Acessos"], ["carga", "Demandas"], ["historico", "Histórico"]] as [Aba, string][]).map(([id, rot]) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={`px-2.5 py-2 text-xs transition-colors -mb-px border-b-2 ${
                aba === id ? "text-zinc-100 border-purple-500" : "text-zinc-500 border-transparent hover:text-zinc-300"
              }`}
            >
              {rot}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {!p ? (
            <p className="text-sm text-zinc-500">{isLoading ? "Carregando…" : "Pessoa não encontrada."}</p>
          ) : aba === "geral" ? (
            <>
              <Bloco titulo="Dados pessoais">
                <Linha icone={Mail} rotulo="E-mail" valor={p.email} />
                <Linha icone={Phone} rotulo="WhatsApp" valor={p.telefone} />
                <Linha icone={MapPin} rotulo="Localização" valor={p.localizacao} />
              </Bloco>

              <Bloco titulo="Organização e função">
                <Linha icone={Building2} rotulo="Vínculo" valor={LABEL_VINCULO[p.vinculo]} />
                <Linha icone={Activity} rotulo="Função" valor={p.funcao} />
                <Linha icone={Building2} rotulo="Equipe" valor={p.equipes.join(", ")} />
                <Linha icone={Shield} rotulo="Nível" valor={LABEL_NIVEL[p.nivel]} />
              </Bloco>

              <Bloco titulo="Capacidades">
                {/* A capacidade É a ficha — não um checkbox que pode contradizer outro */}
                <div className="flex flex-wrap gap-1.5">
                  <Cap ativa={p.capacidades.captacao} icone={Camera} rotulo="Captação" href={p.fichas.videomakerId ? `/videomakers/${p.fichas.videomakerId}` : null} />
                  <Cap ativa={p.capacidades.edicao} icone={Clapperboard} rotulo="Edição" href={p.fichas.editorId ? `/equipe/${p.fichas.editorId}` : null} />
                  <Cap ativa={p.capacidades.design} icone={Palette} rotulo="Design" href={null} />
                </div>
                {!p.capacidades.captacao && !p.capacidades.edicao && !p.capacidades.design && (
                  <p className="text-xs text-zinc-600 mt-1">Nenhuma ficha profissional — não pode receber demanda.</p>
                )}
              </Bloco>
            </>
          ) : aba === "acessos" ? (
            <>
              <Bloco titulo="Acesso ao sistema">
                <Linha icone={Shield} rotulo="Perfil de acesso" valor={p.perfilAcesso} />
                <Linha icone={Activity} rotulo="Conta" valor={p.status === "ativo" ? "Ativa" : "Inativa"} />
                {p.liderAudiovisual && <Linha icone={Shield} rotulo="Líder audiovisual" valor="Sim" />}
              </Bloco>
              <div className="rounded-lg border border-zinc-800 bg-zinc-800/40 p-3">
                <p className="text-xs text-zinc-400">
                  Nível e perfil de acesso ainda são o mesmo campo. Separá-los — para alguém poder
                  ser Líder com acesso de Executor — é a fase 4.
                </p>
                <Link href="/usuarios" className="inline-flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200 mt-2">
                  Ajustar permissões <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </>
          ) : aba === "carga" ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Num rotulo="Capacidade" valor={c?.capacidadeTotal ?? "—"} />
                <Num rotulo="Em andamento" valor={c?.emAndamento ?? 0} />
                <Num rotulo="Disponível" valor={c?.disponivel ?? "—"} cor={c?.disponivel === 0 ? "text-amber-400" : "text-emerald-400"} />
                <Num rotulo="Atrasadas" valor={c?.atrasadas ?? 0} cor={(c?.atrasadas ?? 0) > 0 ? "text-rose-400" : undefined} />
              </div>
              {c?.capacidadeTotal !== null && (c?.emAndamento ?? 0) > (c?.capacidadeTotal ?? 0) && (
                <p className="flex items-start gap-2 text-xs text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                  Acima da capacidade definida.
                </p>
              )}
              <p className="text-xs text-zinc-600">
                Mesmo critério de Equipe Interna: demanda não finalizada. Concluídas: {c?.concluidas ?? 0}.
              </p>
            </>
          ) : (
            <>
              {(data?.historico ?? []).length === 0 ? (
                <p className="text-sm text-zinc-500">Nenhuma ação registrada.</p>
              ) : (
                <ul className="space-y-2.5">
                  {data!.historico.map((h) => (
                    <li key={h.id} className="border-l-2 border-zinc-800 pl-3">
                      <p className="text-xs text-zinc-300">{h.texto}</p>
                      <p className="text-[11px] text-zinc-600 flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {new Date(h.quando).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        {h.demanda && (
                          <Link href={`/demandas/${h.demanda.id}`} className="font-mono text-indigo-300 hover:text-indigo-200">
                            {h.demanda.codigo}
                          </Link>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">{titulo}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Linha({ icone: Icone, rotulo, valor }: {
  icone: React.ComponentType<{ className?: string }>; rotulo: string; valor?: string | null
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icone className="w-3.5 h-3.5 text-zinc-600 mt-1 shrink-0" />
      <span className="text-zinc-500 text-xs w-24 shrink-0 pt-0.5">{rotulo}</span>
      <span className="text-zinc-200 text-sm break-words min-w-0">{valor || <span className="text-zinc-600">—</span>}</span>
    </div>
  )
}

function Cap({ ativa, icone: Icone, rotulo, href }: {
  ativa: boolean; icone: React.ComponentType<{ className?: string }>; rotulo: string; href: string | null
}) {
  const cls = `inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
    ativa ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" : "border-zinc-800 text-zinc-600"
  }`
  const conteudo = <><Icone className="w-3.5 h-3.5" /> {rotulo}</>
  if (ativa && href) return <Link href={href} className={`${cls} hover:border-indigo-400`}>{conteudo}</Link>
  return <span className={cls}>{conteudo}</span>
}

function Num({ rotulo, valor, cor }: { rotulo: string; valor: number | string; cor?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-800/40 px-3 py-2">
      <p className="text-[11px] text-zinc-500">{rotulo}</p>
      <p className={`text-xl font-semibold tabular-nums ${cor ?? "text-zinc-200"}`}>{valor}</p>
    </div>
  )
}

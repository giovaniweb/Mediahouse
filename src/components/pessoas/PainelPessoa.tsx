"use client"

// Painel lateral de Pessoas & Acessos.
//
// Antes, ver os dados de alguém era abrir o modal de edição — um formulário de
// 12 campos para responder "qual é o WhatsApp dele?". O painel separa as duas
// coisas: ler é o estado padrão, editar é um clique explícito.

import { useState } from "react"
import {
  X, Mail, Phone, Copy, Check, CalendarDays, Link2, Briefcase, Users2, Award,
  ShieldCheck, CircleDot, Clock, Pencil, ChevronDown, KeyRound, GitMerge,
  Power, Trash2, ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import Link from "next/link"
import {
  type PessoaLista, vinculoDe, VINCULO_LABEL, VINCULO_COR, nivelDe, NIVEL_LABEL,
  perfilDe, PERFIL_LABEL, PERFIL_COR, PERFIL_DESCRICAO, AREA_LABEL, AREA_PONTO,
  funcaoDe, iniciais, corAvatar, formatarAtividade,
} from "@/lib/pessoas-ui"

type Aba = "geral" | "acessos"

export interface AcoesPessoa {
  onEditar: () => void
  onPermissoes: () => void
  onSenha: () => void
  onMesclar: () => void
  onStatus: () => void
  onExcluir: () => void
}

function Linha({ icon: Icon, rotulo, children }: {
  icon: React.ElementType
  rotulo: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon className="w-3.5 h-3.5 text-zinc-600 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-zinc-500 leading-tight">{rotulo}</p>
        <div className="text-sm text-zinc-200 leading-snug mt-0.5">{children}</div>
      </div>
    </div>
  )
}

function ValorCopiavel({ valor }: { valor: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <span className="inline-flex items-center gap-1.5 group/copy">
      <span className="break-all">{valor}</span>
      <button
        onClick={() => {
          navigator.clipboard.writeText(valor).then(
            () => { setCopiado(true); setTimeout(() => setCopiado(false), 1500) },
            () => toast.error("Não consegui copiar"),
          )
        }}
        className="text-zinc-600 hover:text-zinc-300 opacity-0 group-hover/copy:opacity-100 focus:opacity-100 transition-opacity shrink-0"
        title="Copiar"
      >
        {copiado ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </span>
  )
}

function Vazio() {
  return <span className="text-zinc-600 italic text-sm">não informado</span>
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">{titulo}</h3>
      <div className="divide-y divide-zinc-800/60">{children}</div>
    </section>
  )
}

export function PainelPessoa({ pessoa, perfilHref, acoes, onClose }: {
  pessoa: PessoaLista
  /** Perfil profissional (videomaker externo / equipe interna), quando existe. */
  perfilHref: string | null
  acoes: AcoesPessoa
  onClose: () => void
}) {
  const [aba, setAba] = useState<Aba>("geral")
  const [menu, setMenu] = useState(false)

  const vinculo = vinculoDe(pessoa)
  const nivel = nivelDe(pessoa)
  const perfil = perfilDe(pessoa)
  const funcao = funcaoDe(pessoa)
  const areas = pessoa.areas ?? []
  const ativo = pessoa.status === "ativo"

  const acoesMenu = [
    { label: "Redefinir senha", Icon: KeyRound, run: acoes.onSenha, cor: "text-zinc-300" },
    { label: "Editar permissões", Icon: ShieldCheck, run: acoes.onPermissoes, cor: "text-zinc-300" },
    { label: "Mesclar duplicado", Icon: GitMerge, run: acoes.onMesclar, cor: "text-zinc-300" },
    { label: ativo ? "Desativar conta" : "Reativar conta", Icon: Power, run: acoes.onStatus, cor: "text-zinc-300" },
    { label: "Excluir cadastro", Icon: Trash2, run: acoes.onExcluir, cor: "text-red-400" },
  ]

  return (
    // z-50 para ficar acima do painel flutuante de foco (z-40), que mora no
    // canto inferior direito e cobriria justamente os botões de ação daqui.
    <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-sm border-l border-zinc-800 bg-zinc-950 flex flex-col shadow-2xl">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between px-5 h-14 border-b border-zinc-800 shrink-0">
        <p className="text-sm font-semibold text-zinc-100">Detalhes da pessoa</p>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors" title="Fechar">
          <X className="w-4.5 h-4.5" />
        </button>
      </div>

      {/* Identificação */}
      <div className="px-5 pt-5 pb-4 flex items-start gap-3 shrink-0">
        <div className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 overflow-hidden",
          corAvatar(pessoa.id),
        )}>
          {pessoa.avatarUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={pessoa.avatarUrl} alt="" className="w-full h-full object-cover" />
            : iniciais(pessoa.nome)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold text-zinc-100 leading-tight truncate">{pessoa.nome}</h2>
            <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0", VINCULO_COR[vinculo])}>
              {VINCULO_LABEL[vinculo]}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5 truncate">
            {funcao ?? "Sem função definida"}
            {areas.length > 0 && ` · ${areas.map(a => AREA_LABEL[a] ?? a).join(", ")}`}
          </p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex items-center gap-0 px-5 border-b border-zinc-800 shrink-0">
        {([["geral", "Visão geral"], ["acessos", "Acessos"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={cn(
              "px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              aba === id ? "border-purple-500 text-purple-400" : "border-transparent text-zinc-500 hover:text-zinc-300",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {aba === "geral" ? (
          <>
            <Secao titulo="Dados pessoais">
              <Linha icon={Mail} rotulo="E-mail">
                {pessoa.email ? <ValorCopiavel valor={pessoa.email} /> : <Vazio />}
              </Linha>
              <Linha icon={Phone} rotulo="WhatsApp">
                {pessoa.telefone ? <ValorCopiavel valor={pessoa.telefone} /> : <Vazio />}
              </Linha>
              <Linha icon={CalendarDays} rotulo="Na casa desde">
                {new Date(pessoa.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
              </Linha>
            </Secao>

            <Secao titulo="Organização e função">
              <Linha icon={Link2} rotulo="Vínculo">
                <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full border", VINCULO_COR[vinculo])}>
                  {VINCULO_LABEL[vinculo]}
                </span>
              </Linha>
              <Linha icon={Briefcase} rotulo="Função">{funcao ?? <Vazio />}</Linha>
              <Linha icon={Users2} rotulo="Equipe">
                {areas.length > 0 ? (
                  <span className="flex items-center gap-3 flex-wrap">
                    {areas.map(a => (
                      <span key={a} className="inline-flex items-center gap-1.5">
                        <span className={cn("w-1.5 h-1.5 rounded-full", AREA_PONTO[a] ?? "bg-zinc-500")} />
                        {AREA_LABEL[a] ?? a}
                      </span>
                    ))}
                  </span>
                ) : <span className="text-zinc-600 italic text-sm">sem equipe</span>}
              </Linha>
              <Linha icon={Award} rotulo="Cargo / Nível">{NIVEL_LABEL[nivel]}</Linha>
            </Secao>

            <Secao titulo="Acesso ao sistema">
              <Linha icon={ShieldCheck} rotulo="Perfil de acesso">
                <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full border", PERFIL_COR[perfil])}>
                  {PERFIL_LABEL[perfil]}
                </span>
              </Linha>
              <Linha icon={CircleDot} rotulo="Conta">
                <span className={cn("inline-flex items-center gap-1.5 text-sm", ativo ? "text-emerald-400" : "text-zinc-500")}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", ativo ? "bg-emerald-400" : "bg-zinc-600")} />
                  {ativo ? "Ativa" : "Inativa"}
                </span>
              </Linha>
              <Linha icon={Clock} rotulo="Última atividade">
                {formatarAtividade(pessoa.ultimaAtividade)}
              </Linha>
            </Secao>

            {perfilHref && (
              <Link
                href={perfilHref}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Ver perfil profissional
              </Link>
            )}
          </>
        ) : (
          <>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100">{PERFIL_LABEL[perfil]}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{PERFIL_DESCRICAO[perfil]}</p>
                </div>
                <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0", PERFIL_COR[perfil])}>
                  Perfil
                </span>
              </div>
            </div>

            <Secao titulo="Quadros que enxerga">
              <div className="py-2">
                {areas.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {areas.map(a => (
                      <span key={a} className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-zinc-700 bg-zinc-800 text-zinc-300">
                        <span className={cn("w-1.5 h-1.5 rounded-full", AREA_PONTO[a] ?? "bg-zinc-500")} />
                        {AREA_LABEL[a] ?? a}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">
                    Nenhuma área — esta pessoa não vê quadro nenhum de demandas.
                  </p>
                )}
              </div>
            </Secao>

            <div className="space-y-2">
              <button
                onClick={acoes.onPermissoes}
                className="w-full flex items-center justify-center gap-2 border border-zinc-700 text-zinc-200 text-sm py-2 rounded-lg hover:bg-zinc-800 transition-colors font-medium"
              >
                <ShieldCheck className="w-4 h-4" /> Editar permissões
              </button>
              <button
                onClick={acoes.onSenha}
                className="w-full flex items-center justify-center gap-2 border border-zinc-700 text-zinc-200 text-sm py-2 rounded-lg hover:bg-zinc-800 transition-colors font-medium"
              >
                <KeyRound className="w-4 h-4" /> Redefinir senha
              </button>
            </div>

            {!pessoa.email && (
              <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                Sem e-mail cadastrado: esta pessoa não consegue fazer login.
              </p>
            )}
          </>
        )}
      </div>

      {/* Ações */}
      <div className="px-5 py-4 border-t border-zinc-800 flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <button
            onClick={() => setMenu(v => !v)}
            className="w-full flex items-center justify-center gap-1.5 border border-zinc-700 text-zinc-200 text-sm py-2 rounded-lg hover:bg-zinc-800 transition-colors font-medium"
          >
            Mais ações <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", menu && "rotate-180")} />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute bottom-full left-0 mb-1 w-full z-20 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
                {acoesMenu.map(a => (
                  <button
                    key={a.label}
                    onClick={() => { setMenu(false); a.run() }}
                    className={cn("w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-800 transition-colors text-left", a.cor)}
                  >
                    <a.Icon className="w-3.5 h-3.5 shrink-0" /> {a.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button
          onClick={acoes.onEditar}
          className="flex-1 flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" /> Editar pessoa
        </button>
      </div>
    </aside>
  )
}

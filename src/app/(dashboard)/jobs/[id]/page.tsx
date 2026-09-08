"use client"

import { use } from "react"
import useSWR from "swr"
import Link from "next/link"
import { ArrowLeft, Clock, ExternalLink, FileText, MapPin, Phone, User } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Header } from "@/components/layout/Header"
import { AcoesVideomaker } from "@/components/jobs/AcoesVideomaker"
import { JobTimeline, type EventoHistorico } from "@/components/jobs/JobTimeline"
import { fetcher } from "@/lib/fetcher"
import { cn } from "@/lib/utils"
import { diasDeAtraso } from "@/lib/status"
import { COLUNAS_LABEL } from "@/lib/status"
import { captacaoIniciada, nivelDeRisco, proximaAcao, responsavelAtual, ehBloqueado } from "@/lib/job-fase"
import type { StatusInterno } from "@prisma/client"

// Detalhe do Job (§12).
//
// "Tudo deve estar concentrado dentro do Job. Evitar espalhar informações em
// várias telas." Uma página, na ordem em que a pergunta aparece: o que é, de
// quem é a bola, o que falta fazer — e, para o videomaker, a ação, no topo.
//
// Consome `GET /api/demandas/[id]`, que já devolve solicitante, gestor,
// videomaker, editor, arquivos, histórico com autor e comentários. Nenhuma rota
// nova, nenhuma alteração no módulo de Demandas.
//
// É deliberadamente MENOR que DemandaDetalhe: aquela tela edita tudo e serve à
// gestão; esta responde às perguntas do §64 e oferece a próxima ação.

type Job = {
  id: string
  codigo: string
  titulo: string
  descricao?: string | null
  statusInterno: StatusInterno
  statusVisivel?: string | null
  prioridade?: string | null
  // Clínica / cliente final
  clienteFinalNome?: string | null
  clienteFinalTelefone?: string | null
  clienteFinalEmail?: string | null
  // Onde
  cidade?: string | null
  localEvento?: string | null
  localGravacao?: string | null
  // Quando
  dataEvento?: string | null
  dataCaptacao?: string | null
  dataLimite?: string | null
  // Quem pediu
  nomeSolicitante?: string | null
  telefoneSolicitante?: string | null
  solicitante?: { nome: string; email?: string | null } | null
  // Briefing
  objetivo?: string | null
  publico?: string | null
  mensagemPrincipal?: string | null
  referencia?: string | null
  tipoVideo?: string | null
  // Materiais
  linkBrutos?: string | null
  linkFinal?: string | null
  linkFolderBrutos?: string | null
  arquivos?: { id: string; tipoArquivo: string; url: string; nomeArquivo: string }[]
  // Equipe
  videomaker?: { id: string; nome: string; telefone?: string | null } | null
  editor?: { nome: string } | null
  designer?: { nome: string } | null
  responsavel?: { nome: string } | null
  responsaveis?: { usuario: { nome: string } }[] | null
  gestor?: { nome: string } | null
  historicos?: EventoHistorico[]
}

const dataHora = (v?: string | null, comHora = true) =>
  v ? format(new Date(v), comHora ? "dd/MM/yyyy 'às' HH:mm" : "dd/MM/yyyy", { locale: ptBR }) : null

/** Bloco de rótulo + valor. Some quando não há valor — §61: sem campo vazio na tela. */
function Campo({ rotulo, children }: { rotulo: string; children?: React.ReactNode }) {
  if (!children) return null
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500">{rotulo}</dt>
      <dd className="text-sm text-zinc-200 mt-0.5 break-words">{children}</dd>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
      <h2 className="text-sm font-medium text-zinc-300 mb-3">{titulo}</h2>
      {children}
    </section>
  )
}

export default function JobDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const { data, error, isLoading, mutate } = useSWR<{ demanda: Job }>(
    `/api/demandas/${id}`,
    fetcher
  )
  // Para saber se ESTE job é meu. A autorização real está na guarda do
  // servidor; aqui é só para não mostrar botão que não é meu.
  const { data: meVM } = useSWR<{ videomaker: { id: string } | null }>("/api/me/videomaker", fetcher)

  const job = data?.demanda

  if (isLoading) return <Estado texto="Carregando…" />
  if (error || !job) return <Estado texto="Job não encontrado." />

  const risco = nivelDeRisco(job)
  const responsavel = responsavelAtual(job)
  const atraso = diasDeAtraso(job)
  const souOVideomaker = !!meVM?.videomaker && meVM.videomaker.id === job.videomaker?.id
  const clinica = job.clienteFinalNome?.trim() || null
  const endereco = job.localEvento?.trim() || job.localGravacao?.trim() || null
  const contatoNome = job.nomeSolicitante?.trim() || job.solicitante?.nome || null
  const referencias = (job.arquivos ?? []).filter((a) =>
    ["referencia", "documento", "guideline"].includes(a.tipoArquivo)
  )

  return (
    <div className="min-h-screen">
      <Header title="Job" />

      <main className="max-w-4xl mx-auto px-4 py-4 space-y-3 pb-10">
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao quadro
        </Link>

        {/* Identificação + de quem é a bola + o que falta */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-mono text-zinc-500">{job.codigo}</span>
            {job.prioridade === "urgente" && (
              <span className="text-[10px] font-semibold text-red-400 tracking-wide">URGENTE</span>
            )}
          </div>
          <h1 className="text-lg font-medium text-zinc-100 mt-1 leading-snug">
            {clinica ?? job.titulo}
          </h1>
          {clinica && <p className="text-sm text-zinc-500">{job.titulo}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="text-zinc-400">
              <span className="text-zinc-600">Etapa </span>
              {COLUNAS_LABEL[job.statusVisivel as keyof typeof COLUNAS_LABEL] ?? "—"}
            </span>
            <span className="text-zinc-400">
              <span className="text-zinc-600">Com </span>
              {responsavel.nome ?? responsavel.papel}
              {responsavel.nome && <span className="text-zinc-600"> · {responsavel.papel}</span>}
            </span>
          </div>

          <p
            className={cn(
              "mt-2 text-sm",
              ehBloqueado(job.statusInterno) ? "text-rose-400" : "text-zinc-300"
            )}
          >
            {proximaAcao(job)}
          </p>

          {risco === "overdue" && (
            <p className="mt-1 text-xs text-red-400">
              {atraso ? `Atrasado há ${atraso} ${atraso === 1 ? "dia" : "dias"}` : "Atrasado"}
            </p>
          )}
          {risco === "attention" && <p className="mt-1 text-xs text-amber-400">Vence hoje</p>}
        </section>

        {/* A ação vem logo abaixo do cabeçalho: no celular é a razão de abrir. */}
        {souOVideomaker && (
          <AcoesVideomaker
            jobId={job.id}
            statusInterno={job.statusInterno}
            captacaoIniciada={captacaoIniciada(job.historicos)}
            onExecutado={() => void mutate()}
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Secao titulo="Clínica e contato">
            <dl className="space-y-3">
              <Campo rotulo="Clínica">{clinica}</Campo>
              <Campo rotulo="Endereço">
                {endereco && (
                  <span className="inline-flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 text-zinc-500 shrink-0" />
                    <span>{endereco}{job.cidade ? ` — ${job.cidade}` : ""}</span>
                  </span>
                )}
                {!endereco && job.cidade}
              </Campo>
              <Campo rotulo="Contato">{contatoNome}</Campo>
              <Campo rotulo="Telefone">
                {(job.clienteFinalTelefone || job.telefoneSolicitante) && (
                  <a
                    href={`tel:${job.clienteFinalTelefone ?? job.telefoneSolicitante}`}
                    className="inline-flex items-center gap-1.5 text-zinc-200 hover:text-white"
                  >
                    <Phone className="w-3.5 h-3.5 text-zinc-500" />
                    {job.clienteFinalTelefone ?? job.telefoneSolicitante}
                  </a>
                )}
              </Campo>
              <Campo rotulo="E-mail">{job.clienteFinalEmail ?? job.solicitante?.email}</Campo>
            </dl>
          </Secao>

          <Secao titulo="Operação">
            <dl className="space-y-3">
              <Campo rotulo="Data e horário">
                {(dataHora(job.dataCaptacao) ?? dataHora(job.dataEvento)) && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-zinc-500" />
                    {dataHora(job.dataCaptacao) ?? dataHora(job.dataEvento)}
                  </span>
                )}
              </Campo>
              <Campo rotulo="Prazo de entrega">{dataHora(job.dataLimite, false)}</Campo>
              <Campo rotulo="Tipo">{job.tipoVideo}</Campo>
              <Campo rotulo="Videomaker">
                {job.videomaker && (
                  <span className="inline-flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-zinc-500" />
                    {job.videomaker.nome}
                  </span>
                )}
              </Campo>
              <Campo rotulo="Edição">
                {job.editor?.nome ?? job.designer?.nome ?? job.responsavel?.nome ?? job.responsaveis?.[0]?.usuario.nome}
              </Campo>
            </dl>
          </Secao>
        </div>

        <Secao titulo="Briefing">
          <dl className="space-y-3">
            <Campo rotulo="Descrição">
              {job.descricao && <span className="whitespace-pre-wrap">{job.descricao}</span>}
            </Campo>
            <Campo rotulo="Objetivo">{job.objetivo}</Campo>
            <Campo rotulo="Público">{job.publico}</Campo>
            <Campo rotulo="Mensagem principal">{job.mensagemPrincipal}</Campo>
          </dl>
          {!job.descricao && !job.objetivo && !job.publico && !job.mensagemPrincipal && (
            <p className="text-xs text-zinc-600">Sem briefing preenchido.</p>
          )}
        </Secao>

        <Secao titulo="Materiais e referências">
          <div className="space-y-2">
            {job.referencia && (
              <p className="text-sm text-zinc-300 whitespace-pre-wrap break-words">{job.referencia}</p>
            )}
            <Link1 url={job.linkFolderBrutos ?? job.linkBrutos} rotulo="Material bruto" />
            <Link1 url={job.linkFinal} rotulo="Vídeo final" />
            {referencias.map((a) => (
              <Link1 key={a.id} url={a.url} rotulo={a.nomeArquivo} />
            ))}
            {!job.referencia && !job.linkBrutos && !job.linkFolderBrutos && !job.linkFinal && referencias.length === 0 && (
              <p className="text-xs text-zinc-600">Nenhum material anexado ainda.</p>
            )}
          </div>
        </Secao>

        <Secao titulo="Histórico">
          <JobTimeline eventos={job.historicos ?? []} />
        </Secao>
      </main>
    </div>
  )
}

function Link1({ url, rotulo }: { url?: string | null; rotulo: string }) {
  if (!url) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-sm text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2"
    >
      <FileText className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
      <span className="truncate flex-1">{rotulo}</span>
      <ExternalLink className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
    </a>
  )
}

function Estado({ texto }: { texto: string }) {
  return (
    <div className="min-h-screen">
      <Header title="Job" />
      <p className="max-w-4xl mx-auto px-4 py-8 text-sm text-zinc-500">{texto}</p>
    </div>
  )
}

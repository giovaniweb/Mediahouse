"use client"

// Nova Demanda do Growth (area="design").
//
// Herda o chassi do modal do audiovisual — mesma casca, mesmo rascunho, mesmo
// rodapé de arquivos — porque a proteção contra perder o que foi escrito não é
// um recurso do audiovisual, é do formulário. O que muda é o miolo: o bloco do
// meio se monta a partir do catálogo de tipos do Growth.

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import {
  Plus, Calendar, Loader2, LayoutGrid, ClipboardList, Settings2, Users, Package, Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { fetcher } from "@/lib/fetcher"
import { hojeEmSaoPaulo } from "@/lib/datas"
import { ErroApi, erroDeCorpo, mensagemDeErro } from "@/lib/erro-cliente"
import { enviarAnexos } from "@/lib/upload-documento"
import { useRascunho } from "@/lib/use-rascunho"
import { TIPOS_CONTEUDO, tipoConteudoDe, campoVisivel, type CampoCondicional } from "@/lib/growth-conteudo"
import {
  Secao, Campo, Seta, Chip, DivisorBloco,
  inputClass, selectClass, erroClass, MOTIVOS_URGENCIA, COR_PRIORIDADE,
} from "./campos-formulario"
import { ModalFormulario } from "./ModalFormulario"
import { BannerRascunho } from "./BannerRascunho"
import { SecaoArquivos, juntarReferencias } from "./SecaoArquivos"

interface Responsavel { id: string; nome: string; email: string | null; tipo: string; label: string }
interface Item { id: string; nome: string }

interface RascunhoGrowth {
  titulo: string
  descricao: string
  tipoVideo: string
  prioridade: string
  motivoUrgencia: string
  dataLimite: string
  classificacao: string
  linhaProjetoId: string
  responsavelIds: string[]
  produtoIds: string[]
  detalhes: Record<string, string>
  referencias: string[]
  novaReferencia: string
  linkBrutos: string
}

const PADRAO: RascunhoGrowth = {
  titulo: "", descricao: "", tipoVideo: "post", prioridade: "normal", motivoUrgencia: "",
  dataLimite: "", classificacao: "", linhaProjetoId: "", responsavelIds: [], produtoIds: [],
  detalhes: {}, referencias: [], novaReferencia: "", linkBrutos: "",
}

export function NovaDemandaGrowthModal({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [titulo, setTitulo] = useState(PADRAO.titulo)
  const [descricao, setDescricao] = useState(PADRAO.descricao)
  const [tipoVideo, setTipoVideo] = useState(PADRAO.tipoVideo)
  const [prioridade, setPrioridade] = useState(PADRAO.prioridade)
  const [motivoUrgencia, setMotivoUrgencia] = useState(PADRAO.motivoUrgencia)
  const [dataLimite, setDataLimite] = useState(PADRAO.dataLimite)
  const [classificacao, setClassificacao] = useState(PADRAO.classificacao)
  const [linhaProjetoId, setLinhaProjetoId] = useState(PADRAO.linhaProjetoId)
  const [responsavelIds, setResponsavelIds] = useState<string[]>(PADRAO.responsavelIds)
  const [produtoIds, setProdutoIds] = useState<string[]>(PADRAO.produtoIds)
  const [detalhes, setDetalhes] = useState<Record<string, string>>(PADRAO.detalhes)
  const [referencias, setReferencias] = useState<string[]>(PADRAO.referencias)
  const [novaReferencia, setNovaReferencia] = useState(PADRAO.novaReferencia)
  const [linkBrutos, setLinkBrutos] = useState(PADRAO.linkBrutos)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  // Anexos ficam na memória até a demanda existir: o upload é por demandaId.
  const [anexos, setAnexos] = useState<File[]>([])
  const [enviandoAnexos, setEnviandoAnexos] = useState(false)

  const { data: rData } = useSWR<{ responsaveis: Responsavel[] }>(open ? "/api/growth/responsaveis" : null, fetcher)
  const responsaveis = rData?.responsaveis ?? []
  const { data: lData } = useSWR<{ linhas: Item[] }>(open ? "/api/growth/linhas-projetos" : null, fetcher)
  const linhas = lData?.linhas ?? []
  const { data: pData } = useSWR<{ produtos: Item[] }>(open ? "/api/produtos?limit=100" : null, fetcher)
  const produtos = pData?.produtos ?? []

  const tipo = tipoConteudoDe(tipoVideo)
  // Campo escondido não vale: trocar "Pronta" por "Precisa criar" não pode deixar
  // um "Texto da Copy" órfão viajando no payload nem no rascunho.
  const camposVisiveis = (tipo?.campos ?? []).filter((c) => campoVisivel(c, detalhes))

  const temConteudo = !!(
    titulo.trim() || descricao.trim() || dataLimite || classificacao || linhaProjetoId ||
    responsavelIds.length > 0 || produtoIds.length > 0 || referencias.length > 0 ||
    novaReferencia.trim() || linkBrutos.trim() || anexos.length > 0 ||
    motivoUrgencia || Object.values(detalhes).some((v) => v.trim())
  )

  const { rascunhoRecuperado, limpar, descartar } = useRascunho<RascunhoGrowth>({
    chave: "nuflow:rascunho-nova-demanda-growth",
    aberto: open,
    temConteudo,
    valores: {
      titulo, descricao, tipoVideo, prioridade, motivoUrgencia, dataLimite, classificacao,
      linhaProjetoId, responsavelIds, produtoIds, detalhes, referencias, novaReferencia, linkBrutos,
    },
    aoRestaurar: (s) => {
      setTitulo(s.titulo ?? PADRAO.titulo)
      setDescricao(s.descricao ?? PADRAO.descricao)
      setTipoVideo(s.tipoVideo ?? PADRAO.tipoVideo)
      setPrioridade(s.prioridade ?? PADRAO.prioridade)
      setMotivoUrgencia(s.motivoUrgencia ?? PADRAO.motivoUrgencia)
      setDataLimite(s.dataLimite ?? PADRAO.dataLimite)
      setClassificacao(s.classificacao ?? PADRAO.classificacao)
      setLinhaProjetoId(s.linhaProjetoId ?? PADRAO.linhaProjetoId)
      setResponsavelIds(s.responsavelIds ?? [])
      setProdutoIds(s.produtoIds ?? [])
      setDetalhes(s.detalhes ?? {})
      setReferencias(s.referencias ?? [])
      setNovaReferencia(s.novaReferencia ?? PADRAO.novaReferencia)
      setLinkBrutos(s.linkBrutos ?? PADRAO.linkBrutos)
      setAnexos([])
      setErrors({})
    },
  })

  function tentarFechar() {
    // O aviso não pode prometer os anexos: File não sobrevive ao localStorage.
    const avisoAnexos = anexos.length > 0
      ? ` Os ${anexos.length} arquivo(s) selecionado(s) precisarão ser anexados de novo.`
      : ""
    if (temConteudo && !confirm(`Fechar sem criar a demanda? O texto fica guardado e volta na próxima vez que abrir.${avisoAnexos}`)) {
      return
    }
    onClose()
  }

  function limparCampo(campo: string) {
    setErrors((prev) => (prev[campo] ? { ...prev, [campo]: "" } : prev))
  }

  function validate() {
    const errs: Record<string, string> = {}
    if (titulo.trim().length < 3) errs.titulo = "Mínimo 3 caracteres"
    if (descricao.trim().length < 10) errs.descricao = "Mínimo 10 caracteres"
    if (prioridade === "urgente" && !motivoUrgencia) errs.motivoUrgencia = "Informe o motivo"
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit() {
    if (!validate()) {
      toast.error("Faltam campos obrigatórios.")
      return
    }
    setSaving(true)
    try {
      // detalhesEntrega é chaveado pelo label amigável (é assim que a tela de
      // detalhe exibe). Só entram os campos visíveis e preenchidos.
      const detalhesEntrega: Record<string, string> = {}
      for (const c of camposVisiveis) {
        const v = detalhes[c.key]
        if (v !== undefined && v !== "") detalhesEntrega[c.label] = v
      }

      // O link digitado e ainda não confirmado no botão conta: perder o que a
      // pessoa acabou de colar por causa de um clique a menos é o tipo de
      // detalhe que faz o campo parecer quebrado.
      const referencia = juntarReferencias(referencias, novaReferencia)

      const body: Record<string, unknown> = {
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        area: "design",
        departamento: "growth",
        tipoVideo,
        // Growth não tem cidade física (o schema exige cidade >= 2 chars).
        cidade: "Remoto",
        prioridade,
        ...(motivoUrgencia && { motivoUrgencia }),
        ...(dataLimite && { dataLimite: new Date(dataLimite).toISOString() }),
        ...(classificacao && { classificacao }),
        ...(linhaProjetoId && { linhaProjetoId }),
        responsavelIds,
        produtoIds,
        ...(Object.keys(detalhesEntrega).length ? { detalhesEntrega } : {}),
        ...(referencia && { referencia }),
        ...(linkBrutos.trim() ? { linkBrutos: linkBrutos.trim() } : {}),
      }

      const res = await fetch("/api/demandas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const text = await res.text()
      let json: Record<string, unknown> = {}
      try { json = JSON.parse(text) } catch { /* body não é JSON */ }

      if (!res.ok) throw erroDeCorpo(json, res.status, text, "Não foi possível criar a demanda.")

      toast.success(`Demanda ${json.codigo ?? ""} criada!`)
      limpar()

      if (anexos.length > 0 && typeof json.id === "string") {
        setEnviandoAnexos(true)
        const falhas = await enviarAnexos(json.id, anexos)
        setEnviandoAnexos(false)
        if (falhas.length > 0) toast.error(`Não foi possível anexar: ${falhas.join(", ")}`)
        else toast.success(`${anexos.length} anexo(s) enviado(s)`)
      }

      // Fica no kanban: quem abre demanda do Growth costuma abrir várias
      // seguidas, e ser jogado para a tela de detalhe quebra o ritmo.
      onCreated()
    } catch (e) {
      if (e instanceof ErroApi && e.temCampos()) setErrors(e.campos)
      toast.error(mensagemDeErro(e, "Não foi possível criar a demanda."))
    } finally {
      setSaving(false)
    }
  }

  const ocupado = saving || enviandoAnexos

  return (
    <ModalFormulario
      aberto={open}
      titulo="Nova Demanda"
      icone={Sparkles}
      aoTentarFechar={tentarFechar}
      aoConfirmar={handleSubmit}
      ocupado={ocupado}
      rotuloConfirmar={
        enviandoAnexos
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando anexos...</>
          : saving
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Criando...</>
          : <>Criar Demanda <span aria-hidden>→</span></>
      }
    >
      {rascunhoRecuperado && <BannerRascunho aoDescartar={descartar} />}

      {/* ── Bloco 1: o pedido ─────────────────────────────────────────── */}
      <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">

        <Secao icone={LayoutGrid} titulo="Tipo de demanda">
          <Campo label="Tipo" obrigatorio>
            <div className="relative">
              <select
                value={tipoVideo}
                onChange={(e) => { setTipoVideo(e.target.value); setDetalhes({}) }}
                className={selectClass}
              >
                {TIPOS_CONTEUDO.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <Seta />
            </div>
          </Campo>

          <div className="grid grid-cols-2 gap-4">
            <Campo label="Prioridade" obrigatorio>
              <div className="relative">
                <span className={cn("pointer-events-none absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full", COR_PRIORIDADE[prioridade])} />
                <select
                  value={prioridade}
                  onChange={(e) => {
                    setPrioridade(e.target.value)
                    if (e.target.value !== "urgente") { setMotivoUrgencia(""); limparCampo("motivoUrgencia") }
                  }}
                  className={cn(selectClass, "pl-8")}
                >
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
                <Seta />
              </div>
            </Campo>

            <Campo label="Prazo de entrega" opcional erro={errors.dataLimite}>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="date"
                  min={hojeEmSaoPaulo()}
                  value={dataLimite}
                  onChange={(e) => { setDataLimite(e.target.value); limparCampo("dataLimite") }}
                  className={cn(inputClass, "pl-10", errors.dataLimite && erroClass)}
                />
              </div>
            </Campo>
          </div>

          {prioridade === "urgente" && (
            <Campo label="Motivo da urgência" obrigatorio erro={errors.motivoUrgencia}>
              <div className="relative">
                <select
                  value={motivoUrgencia}
                  onChange={(e) => { setMotivoUrgencia(e.target.value); limparCampo("motivoUrgencia") }}
                  className={cn(selectClass, errors.motivoUrgencia && erroClass)}
                >
                  <option value="">Selecionar motivo...</option>
                  {MOTIVOS_URGENCIA.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <Seta />
              </div>
            </Campo>
          )}
        </Secao>

        <Secao icone={ClipboardList} titulo="O que precisa ser feito?">
          <Campo label="Título da demanda" obrigatorio erro={errors.titulo}>
            <input
              value={titulo}
              onChange={(e) => { setTitulo(e.target.value); limparCampo("titulo") }}
              placeholder="Ex.: Carrossel Mounjaro — 5 mitos"
              className={cn(inputClass, errors.titulo && erroClass)}
            />
          </Campo>
          <Campo label="Observação / Objetivo" obrigatorio erro={errors.descricao}>
            <textarea
              rows={4}
              value={descricao}
              onChange={(e) => { setDescricao(e.target.value); limparCampo("descricao") }}
              placeholder="Explique rapidamente o que precisa ser produzido, para quem é e qual resultado espera."
              className={cn(inputClass, "resize-none", errors.descricao && erroClass)}
            />
          </Campo>
        </Secao>
      </div>

      {/* ── Bloco 2: o miolo dinâmico, por tipo de demanda ─────────────── */}
      {camposVisiveis.length > 0 && (
        <>
          <DivisorBloco />
          <Secao icone={Settings2} titulo={`Detalhes — ${tipo?.label}`}>
            <div className="grid gap-x-10 gap-y-4 md:grid-cols-2">
              {camposVisiveis.map((c) => (
                <div key={c.key} className={cn("min-w-0", c.largura === "inteira" && "md:col-span-2")}>
                  <CampoDinamico
                    campo={c}
                    valor={detalhes[c.key] ?? ""}
                    onChange={(v) => setDetalhes((d) => ({ ...d, [c.key]: v }))}
                  />
                </div>
              ))}
            </div>
          </Secao>
        </>
      )}

      <DivisorBloco />

      {/* ── Bloco 3: classificação/equipe + o rodapé fixo de arquivos ──── */}
      <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">

        <Secao icone={Users} titulo="Classificação e equipe">
          <Campo label="Classificação" opcional>
            <div className="flex gap-3">
              {(["b2c", "b2b"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setClassificacao((prev) => (prev === c ? "" : c))}
                  className={cn(
                    "flex-1 rounded-xl border py-2.5 text-xs font-bold uppercase transition-colors",
                    classificacao === c
                      ? c === "b2c"
                        ? "border-purple-500 bg-purple-600/20 text-purple-200"
                        : "border-blue-500 bg-blue-600/20 text-blue-200"
                      : "border-zinc-800 bg-zinc-900/70 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                  )}
                >
                  {c.toUpperCase()}
                </button>
              ))}
            </div>
          </Campo>

          <Campo label="Linha / Projeto" opcional>
            <div className="relative">
              <select
                value={linhaProjetoId}
                onChange={(e) => setLinhaProjetoId(e.target.value)}
                className={selectClass}
              >
                <option value="">— Sem linha/projeto —</option>
                {linhas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
              <Seta />
            </div>
            {linhas.length === 0 && (
              <p className="mt-1 text-xs text-zinc-600">Nenhuma linha/projeto cadastrada. Cadastre em Configurações → Linhas / Projetos.</p>
            )}
          </Campo>

          <Campo label="Responsáveis" opcional>
            <div className="relative">
              <Plus className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <select
                value=""
                onChange={(e) => {
                  const id = e.target.value
                  if (id) setResponsavelIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
                }}
                className={cn(selectClass, "pl-10")}
              >
                <option value="">Adicionar responsável</option>
                {responsaveis.filter((r) => !responsavelIds.includes(r.id))
                  .map((r) => <option key={r.id} value={r.id}>{r.label ?? r.nome}</option>)}
              </select>
              <Seta />
            </div>
            {responsavelIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {responsavelIds.map((id) => {
                  const r = responsaveis.find((x) => x.id === id)
                  return (
                    <Chip
                      key={id}
                      texto={r?.label ?? r?.nome ?? id}
                      onRemover={() => setResponsavelIds((prev) => prev.filter((x) => x !== id))}
                    />
                  )
                })}
              </div>
            )}
            <p className="mt-1 text-xs text-zinc-600">Deixe em branco e a demanda entra na fila para alguém assumir.</p>
          </Campo>
        </Secao>

        <div className="space-y-8">
          <Secao icone={Package} titulo="Equipamentos / Produtos">
            <div className="relative">
              <Plus className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <select
                value=""
                onChange={(e) => {
                  const id = e.target.value
                  if (id) setProdutoIds((prev) => (prev.includes(id) ? prev : [...prev, id]))
                }}
                disabled={produtos.length === 0}
                className={cn(selectClass, "pl-10")}
              >
                <option value="">Adicionar equipamento / produto</option>
                {produtos.filter((p) => !produtoIds.includes(p.id))
                  .map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <Seta />
            </div>
            {produtoIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {produtoIds.map((id) => {
                  const p = produtos.find((x) => x.id === id)
                  return (
                    <Chip
                      key={id}
                      texto={p?.nome ?? id}
                      onRemover={() => setProdutoIds((prev) => prev.filter((x) => x !== id))}
                    />
                  )
                })}
              </div>
            )}
            {produtos.length === 0 && (
              <p className="text-xs text-zinc-600">Nenhum produto cadastrado. Cadastre em Produtos.</p>
            )}
          </Secao>

          <SecaoArquivos
            anexos={anexos}
            onAnexos={setAnexos}
            referencias={referencias}
            onReferencias={setReferencias}
            novaReferencia={novaReferencia}
            onNovaReferencia={setNovaReferencia}
            linkBrutos={linkBrutos}
            onLinkBrutos={setLinkBrutos}
          />
        </div>
      </div>
    </ModalFormulario>
  )
}

/** Um campo do catálogo de tipos do Growth. */
function CampoDinamico({ campo, valor, onChange }: {
  campo: CampoCondicional
  valor: string
  onChange: (valor: string) => void
}) {
  if (campo.tipo === "select" || campo.tipo === "bool") {
    const opcoes = campo.tipo === "bool" ? ["Sim", "Não"] : (campo.opcoes ?? [])
    return (
      <Campo label={campo.label}>
        <div className="relative">
          <select value={valor} onChange={(e) => onChange(e.target.value)} className={selectClass}>
            <option value="">Selecionar...</option>
            {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <Seta />
        </div>
      </Campo>
    )
  }

  if (campo.tipo === "textarea") {
    return (
      <Campo label={campo.label}>
        <textarea
          rows={4}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={campo.placeholder}
          className={cn(inputClass, "resize-none")}
        />
      </Campo>
    )
  }

  return (
    <Campo label={campo.label}>
      <input
        type={campo.tipo === "number" ? "number" : "text"}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={campo.placeholder}
        className={inputClass}
      />
    </Campo>
  )
}

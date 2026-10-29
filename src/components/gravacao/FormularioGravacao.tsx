"use client"
// O pedido de gravação, curto e numa tela só. Um formulário, duas portas:
//
// - "Quero um videomaker" (/c/<slug>/gravacao), na área pública da empresa.
//   Nasceu como /agendar-gravacao no protótipo v8 (cinco campos: cliente,
//   endereço, data, horário e consultora), que não entrou na main porque a API
//   dele criava o Job direto, sem aprovação, e nunca tinha passado pelo RLS.
//   Aqui o envio usa o mesmo caminho do pedido público (/api/publico/demanda
//   como cobertura): entra em Aprovações e, aprovado, vira Job — a regra que a
//   área da empresa já anuncia. Quem pede costuma pedir de novo (a consultora
//   que acompanha as visitas), então nome, WhatsApp e e-mail ficam lembrados
//   neste navegador, por empresa.
//
// - "+ Nova gravação" (/jobs), por dentro (prop `interno`). Os mesmos blocos e
//   o mesmo desenho; por dentro aparecem arquivos, quem grava, quem acompanha
//   (da equipe, em vez do contato de quem pede), links e brutos. O título é
//   gerado, o prazo é a gravação e a prioridade sai da data (lib/gravacao.ts).
//   Quem pode aprovar já cria aprovado (lib/quem-aprova.ts).
//
// Os campos seguem a mensagem que chega no WhatsApp (Giovani, 29/10/2026): tipo,
// equipamento, cliente e WhatsApp dele, quando, onde — e, na entrega de
// equipamento, o brinde. "O que mais levar" vale para todos.
import { useEffect, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { toast } from "sonner"
import { ArrowLeft, CalendarPlus, CheckCircle2, Loader2, AlertTriangle, Plus } from "lucide-react"
import superficie from "@/components/public/Recruitment.module.css"
import { slugDaPagina, urlComOrg } from "@/lib/org-publica-cliente"
import { erroDaResposta, erroDeEnvio } from "@/lib/erro-envio-publico"
import { useEmpresaDestino, MarcaEmpresa, AvisoDestino } from "@/components/publico/EmpresaDestino"
import { fetcher } from "@/lib/fetcher"
import { cn } from "@/lib/utils"
import { useMe } from "@/hooks/usePermissoes"
import { useRascunho } from "@/lib/use-rascunho"
import { enviarAnexos } from "@/lib/upload-documento"
import { erroDeCorpo, mensagemDeErro } from "@/lib/erro-cliente"
import { AGUARDANDO_APROVACAO } from "@/lib/job-fase"
import type { StatusInterno } from "@prisma/client"
import {
  corpoDoNovoJob, dataBR, descricaoDaGravacao, levarDoPedido, momentoDaGravacao, prioridadeDaGravacao,
  whatsappLegivel, type CamposGravacao,
} from "@/lib/gravacao"
import { TIPOS_DE_GRAVACAO, perguntaBrinde } from "@/lib/etapas-da-gravacao"
import { ModalFormulario } from "@/components/demandas/ModalFormulario"
import { BannerRascunho } from "@/components/demandas/BannerRascunho"
import { Seta } from "@/components/demandas/campos-formulario"
import { CampoBrutos, CampoReferencias, ZonaAnexos, juntarReferencias } from "@/components/demandas/SecaoArquivos"
import { SeletorProdutos, type Produto } from "@/components/demandas/SeletorProdutos"

const inputClass =
  "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition-colors"
const selectClass = cn(inputClass, "appearance-none pr-10 cursor-pointer")

// O brinde vem marcado: quase toda entrega de equipamento leva. Só vale quando
// o tipo pergunta (perguntaBrinde); nos outros nem aparece.
const CAMPOS_VAZIOS: CamposGravacao = {
  tipo: "", cliente: "", clienteTelefone: "", endereco: "", data: "", hora: "",
  temBrinde: true, brinde: "", levar: "", observacao: "",
}

function chaveContato() {
  return `nuflow-contato:${slugDaPagina() ?? "padrao"}`
}

function Campo({ id, label, children, dica }: { id: string; label: string; children: React.ReactNode; dica?: string }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-zinc-400 mb-1.5">{label}</label>
      {children}
      {dica && <p className="text-xs text-zinc-500 mt-1">{dica}</p>}
    </div>
  )
}

function Bloco({ id, titulo, dica, children }: { id: string; titulo: string; dica?: string; children: React.ReactNode }) {
  const cabecalho = <h2 id={id} className="font-semibold text-white">{titulo}</h2>
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4" aria-labelledby={id}>
      {dica ? <div>{cabecalho}<p className="text-xs text-zinc-500 mt-1">{dica}</p></div> : cabecalho}
      {children}
    </section>
  )
}

/** "A gravação": o que as duas portas pedem igual, na ordem da mensagem do WhatsApp. */
function BlocoGravacao({ c, mudar, produtos, produtoIds, onProdutos, children }: {
  c: CamposGravacao
  mudar: <K extends keyof CamposGravacao>(campo: K, valor: CamposGravacao[K]) => void
  produtos: Produto[]
  produtoIds: string[]
  onProdutos: React.Dispatch<React.SetStateAction<string[]>>
  children?: React.ReactNode
}) {
  return (
    <Bloco id="gravacao-onde" titulo="A gravação">
      <div>
        <p id="tipo-rotulo" className="block text-xs font-medium text-zinc-400 mb-1.5">Tipo</p>
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-labelledby="tipo-rotulo">
          {TIPOS_DE_GRAVACAO.map((t) => (
            <button key={t.id} type="button" aria-pressed={c.tipo === t.id} onClick={() => mudar("tipo", t.id)}
              className={cn("text-sm py-2.5 rounded-xl border transition-colors",
                c.tipo === t.id ? "bg-purple-600 border-purple-500 text-white" : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500")}>
              {t.rotulo}
            </button>
          ))}
        </div>
      </div>
      {produtos.length > 0 && (
        <Campo id="produtos" label="Equipamento">
          <SeletorProdutos id="produtos" produtos={produtos} valores={produtoIds} onChange={onProdutos} classeSelect={selectClass} />
        </Campo>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)] gap-4">
        <Campo id="cliente" label="Cliente ou clínica">
          <input id="cliente" value={c.cliente} onChange={e => mudar("cliente", e.target.value)} required minLength={2} maxLength={160} autoComplete="organization" placeholder="Clínica Dra. Solange" className={inputClass} />
        </Campo>
        <Campo id="cliente-telefone" label="WhatsApp do cliente">
          <input id="cliente-telefone" type="tel" value={c.clienteTelefone} onChange={e => mudar("clienteTelefone", e.target.value)} autoComplete="off" placeholder="(19) 98103-1327" className={`${inputClass} min-w-0`} />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Campo id="data" label="Data">
          <input id="data" type="date" value={c.data} onChange={e => mudar("data", e.target.value)} required className={`${inputClass} min-w-0`} />
        </Campo>
        <Campo id="hora" label="Horário" dica="Horário de Brasília.">
          <input id="hora" type="time" value={c.hora} onChange={e => mudar("hora", e.target.value)} required className={`${inputClass} min-w-0`} />
        </Campo>
      </div>
      <Campo id="endereco" label="Endereço completo">
        <input id="endereco" value={c.endereco} onChange={e => mudar("endereco", e.target.value)} required minLength={5} maxLength={500} autoComplete="street-address" placeholder="Rua, número, bairro e cidade" className={inputClass} />
      </Campo>
      {perguntaBrinde(c.tipo) && (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-zinc-200 cursor-pointer">
            <input type="checkbox" checked={c.temBrinde} onChange={e => mudar("temBrinde", e.target.checked)} className="w-4 h-4 accent-purple-500" />
            Tem brinde
          </label>
          {c.temBrinde && (
            <input id="brinde" aria-label="Qual brinde" value={c.brinde} onChange={e => mudar("brinde", e.target.value)} maxLength={120} placeholder="Qual? Ex.: caixa mineira" className={inputClass} />
          )}
        </div>
      )}
      <Campo id="levar" label="Mais alguma coisa para levar? (opcional)">
        <input id="levar" value={c.levar} onChange={e => mudar("levar", e.target.value)} maxLength={300} placeholder="Ex.: banner, tripé extra" className={inputClass} />
      </Campo>
      <Campo id="observacao" label="Observações (opcional)">
        <textarea id="observacao" value={c.observacao} onChange={e => mudar("observacao", e.target.value)} rows={2} maxLength={1000} placeholder="O que mais a equipe precisa saber" className={inputClass} />
      </Campo>
      {children}
    </Bloco>
  )
}

function Erro({ erro }: { erro: string | null }) {
  if (!erro) return null
  return (
    <div role="alert" className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" /> {erro}
    </div>
  )
}

function BotaoEnviar({ enviando, desabilitado, rotulo, rotuloEnviando }: {
  enviando: boolean; desabilitado?: boolean; rotulo: string; rotuloEnviando: string
}) {
  return (
    <button type="submit" disabled={enviando || desabilitado} className="w-full flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-60 transition-colors">
      {enviando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <CalendarPlus className="w-4 h-4" aria-hidden="true" />}
      {enviando ? rotuloEnviando : rotulo}
    </button>
  )
}

export type JobCriado = { id: string; codigo: string; aprovado: boolean }

export default function FormularioGravacao({ interno }: {
  /** Aberto pelo "+ Nova gravação" de /jobs. Sem isto, é o pedido público. */
  interno?: { aoFechar: () => void; aoCriar: (criado: JobCriado) => void }
}) {
  return interno ? <NovoJob {...interno} /> : <PedidoPublico />
}

// ── Porta pública: "Quero um videomaker" ──────────────────────────────────────

function PedidoPublico() {
  const destino = useEmpresaDestino()
  const [nome, setNome] = useState("")
  const [telefone, setTelefone] = useState("")
  const [email, setEmail] = useState("")
  const [c, setC] = useState<CamposGravacao>(CAMPOS_VAZIOS)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [codigo, setCodigo] = useState<string | null>(null)
  const [acompanhamento, setAcompanhamento] = useState<string | null>(null)
  const [produtoIds, setProdutoIds] = useState<string[]>([])
  const mudar = <K extends keyof CamposGravacao>(campo: K, valor: CamposGravacao[K]) => setC((atual) => ({ ...atual, [campo]: valor }))
  // Os equipamentos ativos da empresa, sem login (a vitrine pública já os lista).
  const { data: dataProdutos } = useSWR<{ produtos: Produto[] }>(urlComOrg("/api/publico/produtos"), fetcher)
  const produtos = dataProdutos?.produtos ?? []

  // Contato lembrado da última vez (só leitura do navegador, depois de montar).
  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(chaveContato()) ?? "null")
      if (!salvo) return
      /* eslint-disable react-hooks/set-state-in-effect -- restaura o que o navegador guardou */
      if (salvo.nome) setNome(salvo.nome)
      if (salvo.telefone) setTelefone(salvo.telefone)
      if (salvo.email) setEmail(salvo.email)
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch { /* sem armazenamento: o formulário só começa vazio */ }
  }, [])

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (enviando) return
    setErro(null)
    if (!c.tipo) return setErro("Escolha o tipo da gravação.")
    if (telefone.replace(/\D/g, "").length < 10) return setErro("Confira o WhatsApp: com DDD, pelo menos 10 números.")
    const dataEvento = momentoDaGravacao(c.data, c.hora)
    const quando = new Date(dataEvento)
    if (Number.isNaN(quando.getTime()) || quando.getTime() < Date.now()) return setErro("A data e o horário da gravação precisam ser no futuro.")

    setEnviando(true)
    try {
      const res = await fetch(urlComOrg("/api/publico/demanda"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomeCliente: nome.trim(),
          email: email.trim(),
          telefone: telefone.trim(),
          titulo: `Gravação · ${c.cliente.trim()}`,
          descricao: descricaoDaGravacao(c),
          tipoSolicitacao: "cobertura",
          tipoVideo: "cobertura_evento",
          localEvento: c.endereco.trim(),
          dataEvento,
          clienteFinalNome: c.cliente.trim(),
          ...(c.clienteTelefone.trim() ? { clienteFinalTelefone: c.clienteTelefone.trim() } : {}),
          tipoGravacao: c.tipo,
          ...levarDoPedido(c),
          produtoIds,
          detalhesEntrega: { origem: "formulario_gravacao" },
        }),
      })
      if (!res.ok) throw new Error(await erroDaResposta(res))
      const json = await res.json()
      try { localStorage.setItem(chaveContato(), JSON.stringify({ nome: nome.trim(), telefone: telefone.trim(), email: email.trim() })) } catch { /* ignora */ }
      setCodigo(json.codigo ?? "")
      // A página de quem pediu: situação, videomaker, data e o vídeo quando chegar.
      setAcompanhamento(typeof json.acompanhamento === "string" ? json.acompanhamento : null)
    } catch (err: unknown) {
      setErro(erroDeEnvio(err))
    } finally {
      setEnviando(false)
    }
  }

  function outraGravacao() {
    setC(CAMPOS_VAZIOS); setProdutoIds([]); setCodigo(null); setAcompanhamento(null)
  }

  const nomeEmpresa = destino.estado === "pronto" ? destino.empresa.nome : "a equipe"

  if (codigo !== null) {
    return (
      <div className={`${superficie.page} flex items-center justify-center px-6`}>
        <div className="max-w-md text-center py-16">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-white" aria-hidden="true" />
          </div>
          <h1 className="text-white mb-2">Pedido recebido.</h1>
          {codigo && <p className="text-sm text-zinc-400 mb-4">Código: <span className="font-mono font-semibold text-white">{codigo}</span></p>}
          <p className="text-zinc-400 mb-8">{nomeEmpresa} confere a agenda e confirma o videomaker pelo WhatsApp informado.</p>
          <div className="flex flex-col items-center gap-4">
            {acompanhamento && <Link href={acompanhamento} className="px-5 py-2.5 text-sm font-semibold bg-purple-600 text-white rounded-xl hover:bg-purple-700">Acompanhar o pedido</Link>}
            <button type="button" onClick={outraGravacao} className={acompanhamento ? "px-5 py-2.5 text-sm text-zinc-300 border border-zinc-700 rounded-xl hover:bg-zinc-800" : "px-5 py-2.5 text-sm bg-purple-600 text-white rounded-xl hover:bg-purple-700"}>Pedir outra gravação</button>
            <Link href={destino.inicio} className="text-sm text-zinc-400 hover:text-white flex items-center gap-2"><ArrowLeft className="w-4 h-4" aria-hidden="true" /> Voltar ao início</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={superficie.page}>
      <nav className="border-b border-zinc-800">
        <div className="max-w-xl mx-auto px-6 py-4 flex items-center justify-between">
          <MarcaEmpresa destino={destino} />
          <Link href={destino.inicio} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Voltar
          </Link>
        </div>
      </nav>

      <div className="max-w-xl mx-auto px-6 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-white mb-2">Quero um videomaker</h1>
          <p className="text-zinc-400 text-sm">Onde e quando vamos gravar? O pedido vai direto para {nomeEmpresa}.</p>
        </div>
        <AvisoDestino destino={destino} />

        <form onSubmit={enviar} className="space-y-6" aria-busy={enviando}>
          <BlocoGravacao c={c} mudar={mudar} produtos={produtos} produtoIds={produtoIds} onProdutos={setProdutoIds} />

          <Bloco id="gravacao-quem" titulo="Quem acompanha" dica="Fica lembrado neste navegador para o próximo pedido.">
            <Campo id="nome" label="Seu nome">
              <input id="nome" value={nome} onChange={e => setNome(e.target.value)} required minLength={2} maxLength={120} autoComplete="name" className={inputClass} />
            </Campo>
            <div className="grid grid-cols-2 gap-4">
              <Campo id="telefone" label="WhatsApp">
                <input id="telefone" type="tel" value={telefone} onChange={e => setTelefone(e.target.value)} required autoComplete="tel" placeholder="(11) 99999-9999" className={inputClass} />
              </Campo>
              <Campo id="email" label="E-mail">
                <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" className={inputClass} />
              </Campo>
            </div>
          </Bloco>

          <Erro erro={erro} />

          <BotaoEnviar enviando={enviando} desabilitado={destino.estado === "inexistente"} rotulo="Solicitar gravação" rotuloEnviando="Enviando…" />
          <p className="text-center text-xs text-zinc-500">A equipe confirma a data e o videomaker antes da gravação.</p>
        </form>
      </div>
    </div>
  )
}

// ── Porta de dentro: "+ Nova gravação" ────────────────────────────────────────

type OpcaoVideomaker = { value: string; label: string; subtitle?: string }
type Pessoa = { id: string; nome: string; telefone?: string | null }

// O WhatsApp só vem para quem é da equipe interna (api/growth/responsaveis):
// sem o campo, a opção mostra só o nome, em vez de afirmar que não há número.
function rotuloDaPessoa(p: Pessoa): string {
  if (!("telefone" in p)) return p.nome
  return `${p.nome} · ${whatsappLegivel(p.telefone) ?? "sem WhatsApp"}`
}

/** O que vai para o rascunho do navegador. File fica de fora, de propósito. */
type RascunhoNovoJob = CamposGravacao & {
  videomaker: string
  acompanhanteId: string
  referencias: string[]
  novaReferencia: string
  linkBrutos: string
  produtoIds: string[]
}

function NovoJob({ aoFechar, aoCriar }: { aoFechar: () => void; aoCriar: (criado: JobCriado) => void }) {
  const [c, setC] = useState<CamposGravacao>(CAMPOS_VAZIOS)
  const [videomaker, setVideomaker] = useState("")
  const [acompanhanteId, setAcompanhanteId] = useState("")
  const [anexos, setAnexos] = useState<File[]>([])
  const [referencias, setReferencias] = useState<string[]>([])
  const [novaReferencia, setNovaReferencia] = useState("")
  const [linkBrutos, setLinkBrutos] = useState("")
  const [produtoIds, setProdutoIds] = useState<string[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const mudar = <K extends keyof CamposGravacao>(campo: K, valor: CamposGravacao[K]) => setC((atual) => ({ ...atual, [campo]: valor }))

  // Só os externos desta empresa: videomaker interno faria o card morar em
  // Demandas (lib/quadro-do-card.ts), e o job sumiria do quadro de onde nasceu.
  const { data: dataVms } = useSWR<{ opcoes: OpcaoVideomaker[] }>("/api/equipe-disponivel?papel=captacao&externos=1", fetcher)
  const { data: dataPessoas } = useSWR<{ responsaveis: Pessoa[] }>("/api/growth/responsaveis?area=todas", fetcher)
  const { data: dataProdutos } = useSWR<{ produtos: Produto[] }>("/api/produtos?limit=100", fetcher)
  const { data: me } = useMe()
  const videomakers = dataVms?.opcoes ?? []
  const pessoas = dataPessoas?.responsaveis ?? []
  const produtos = dataProdutos?.produtos ?? []

  // Quem cria costuma ser quem acompanha: vem marcado, e troca com um clique.
  const acompanhante = acompanhanteId || (me && pessoas.some((p) => p.id === me.id) ? me.id : "")
  const pessoaAcompanha = pessoas.find((p) => p.id === acompanhante) ?? null

  const temConteudo = !!(
    c.tipo || c.cliente.trim() || c.clienteTelefone.trim() || c.endereco.trim() || c.data || c.hora ||
    c.brinde.trim() || c.levar.trim() || c.observacao.trim() ||
    videomaker || acompanhanteId || anexos.length > 0 || referencias.length > 0 ||
    novaReferencia.trim() || linkBrutos.trim() || produtoIds.length > 0
  )

  const { rascunhoRecuperado, limpar: limparRascunho, descartar } = useRascunho<RascunhoNovoJob>({
    chave: "nuflow:rascunho-novo-job-gravacao",
    aberto: true,
    temConteudo,
    valores: { ...c, videomaker, acompanhanteId, referencias, novaReferencia, linkBrutos, produtoIds },
    aoRestaurar: (salvo) => {
      setC({
        ...CAMPOS_VAZIOS,
        tipo: salvo.tipo ?? "", cliente: salvo.cliente ?? "", clienteTelefone: salvo.clienteTelefone ?? "",
        endereco: salvo.endereco ?? "", data: salvo.data ?? "", hora: salvo.hora ?? "",
        temBrinde: salvo.temBrinde ?? true, brinde: salvo.brinde ?? "", levar: salvo.levar ?? "",
        observacao: salvo.observacao ?? "",
      })
      setVideomaker(salvo.videomaker ?? "")
      setAcompanhanteId(salvo.acompanhanteId ?? "")
      setReferencias(Array.isArray(salvo.referencias) ? salvo.referencias.filter((r) => typeof r === "string" && r.trim() !== "") : [])
      setNovaReferencia(salvo.novaReferencia ?? "")
      setLinkBrutos(salvo.linkBrutos ?? "")
      setProdutoIds(Array.isArray(salvo.produtoIds) ? salvo.produtoIds : [])
      setAnexos([])
      setErro(null)
    },
  })

  function tentarFechar() {
    const avisoAnexos = anexos.length > 0
      ? ` Os ${anexos.length} arquivo(s) selecionado(s) precisarão ser anexados de novo.`
      : ""
    if (temConteudo && !confirm(`Fechar sem criar a gravação? O que você escreveu fica guardado e volta na próxima vez que abrir.${avisoAnexos}`)) return
    aoFechar()
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (enviando) return
    setErro(null)
    if (!c.tipo) return setErro("Escolha o tipo da gravação.")
    if (Number.isNaN(new Date(momentoDaGravacao(c.data, c.hora)).getTime())) return setErro("Confira a data e o horário da gravação.")

    setEnviando(true)
    try {
      const corpo = corpoDoNovoJob({
        ...c, videomaker, linkBrutos, produtoIds,
        acompanhante: pessoaAcompanha,
        referencia: juntarReferencias(referencias, novaReferencia),
      })
      const res = await fetch("/api/demandas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      })
      // Body defensivo: em erro 500 o servidor pode devolver HTML ou nada.
      const text = await res.text()
      let json: Record<string, unknown> = {}
      try { json = JSON.parse(text) } catch { /* body não é JSON */ }
      if (!res.ok) throw erroDeCorpo(json, res.status, text, "Não foi possível criar a gravação.")

      // O servidor diz se o pedido já nasceu aprovado. Se não, a gravação só
      // aparece no quadro depois de Aprovações, e a frase avisa para ninguém achar que sumiu.
      const codigo = typeof json.codigo === "string" ? json.codigo : ""
      const aprovado = !AGUARDANDO_APROVACAO.includes(json.statusInterno as StatusInterno)
      if (aprovado) toast.success(`Gravação ${codigo} criada. Já está no quadro.`)
      else toast.success("Pedido criado. Ele aparece em Gravações Externas depois de aprovado em Aprovações.", { duration: 8000 })
      limparRascunho()

      // Anexos depois da criação: o upload é por demanda. Falha de anexo não
      // desfaz a gravação; o arquivo pode ser reenviado no detalhe.
      if (anexos.length > 0 && typeof json.id === "string") {
        const falhas = await enviarAnexos(json.id, anexos)
        if (falhas.length > 0) toast.error(`Não foi possível anexar: ${falhas.join(", ")}`)
        else toast.success(`${anexos.length} anexo(s) enviado(s)`)
      }

      aoFechar()
      if (typeof json.id === "string") aoCriar({ id: json.id, codigo, aprovado })
    } catch (err) {
      setErro(mensagemDeErro(err, "Não foi possível criar a gravação."))
    } finally {
      setEnviando(false)
    }
  }

  const alta = c.data && prioridadeDaGravacao(c.data) === "alta"

  return (
    <ModalFormulario
      aberto
      titulo="Nova gravação"
      icone={Plus}
      aoTentarFechar={tentarFechar}
      ocupado={enviando}
      semRodape
      className="max-w-xl"
    >
      {rascunhoRecuperado && <BannerRascunho aoDescartar={descartar} />}

      <form onSubmit={enviar} className="space-y-6" aria-busy={enviando}>
        <BlocoGravacao c={c} mudar={mudar} produtos={produtos} produtoIds={produtoIds} onProdutos={setProdutoIds}>
          {c.data && (
            <p className="text-xs text-zinc-500">
              Prazo: {dataBR(c.data)} · Prioridade {alta ? <span className="text-orange-300">Alta</span> : "Normal"}
              {alta && " (gravação em até 2 dias)"}
            </p>
          )}
          <div className="space-y-2">
            <p className="block text-xs font-medium text-zinc-400">Arquivos e referências (opcional)</p>
            <ZonaAnexos anexos={anexos} onAnexos={setAnexos} />
          </div>
        </BlocoGravacao>

        <Bloco id="job-quem-grava" titulo="Quem grava" dica="Videomakers externos da empresa. Sem ninguém, a gravação entra para escalar depois.">
          <Campo id="videomaker" label="Videomaker (opcional)">
            <div className="relative">
              <select id="videomaker" value={videomaker} onChange={e => setVideomaker(e.target.value)} className={selectClass}>
                <option value="">Escalar depois</option>
                {videomakers.map(o => (
                  <option key={o.value} value={o.value}>{o.label}{o.subtitle ? ` · ${o.subtitle}` : ""}</option>
                ))}
              </select>
              <Seta />
            </div>
          </Campo>
        </Bloco>

        <Bloco id="job-quem-acompanha" titulo="Quem acompanha" dica="A pessoa da equipe que vai estar na gravação.">
          <Campo id="acompanhante" label="Pessoa da equipe">
            <div className="relative">
              <select id="acompanhante" value={acompanhante} onChange={e => setAcompanhanteId(e.target.value)} required className={selectClass}>
                <option value="">Escolha quem acompanha</option>
                {pessoas.map(p => (
                  <option key={p.id} value={p.id}>{rotuloDaPessoa(p)}</option>
                ))}
              </select>
              <Seta />
            </div>
          </Campo>
        </Bloco>

        <Bloco id="job-links" titulo="Referências e brutos">
          <CampoReferencias
            referencias={referencias}
            onReferencias={setReferencias}
            novaReferencia={novaReferencia}
            onNovaReferencia={setNovaReferencia}
            classeInput={inputClass}
          />
          <Campo id="brutos" label="Link dos brutos (opcional)">
            <CampoBrutos id="brutos" linkBrutos={linkBrutos} onLinkBrutos={setLinkBrutos} classeInput={inputClass} />
          </Campo>
        </Bloco>

        <Erro erro={erro} />

        <BotaoEnviar enviando={enviando} rotulo="Criar gravação" rotuloEnviando="Criando…" />
      </form>
    </ModalFormulario>
  )
}

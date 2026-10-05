"use client"
// "Quero um videomaker": o pedido de gravação, curto e numa tela só.
//
// Nasceu como /agendar-gravacao no protótipo v8 (cinco campos: cliente,
// endereço, data, horário e consultora), que não entrou na main porque a API
// dele criava o Job direto, sem aprovação, e nunca tinha passado pelo RLS.
// Aqui a tela curta volta, mas o envio usa o mesmo caminho do pedido público
// (/api/publico/demanda como cobertura): entra em Aprovações e, aprovado, vira
// Job — a regra que a área da empresa já anuncia.
//
// Quem pede costuma pedir de novo (a consultora que acompanha as visitas), então
// nome, WhatsApp e e-mail ficam lembrados neste navegador, por empresa.
import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CalendarPlus, CheckCircle2, Loader2, AlertTriangle } from "lucide-react"
import superficie from "@/components/public/Recruitment.module.css"
import { slugDaPagina, urlComOrg } from "@/lib/org-publica-cliente"
import { erroDaResposta, erroDeEnvio } from "@/lib/erro-envio-publico"
import { useEmpresaDestino, MarcaEmpresa, AvisoDestino } from "@/components/publico/EmpresaDestino"

const inputClass =
  "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition-colors"

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

export default function FormularioGravacao() {
  const destino = useEmpresaDestino()
  const [nome, setNome] = useState("")
  const [telefone, setTelefone] = useState("")
  const [email, setEmail] = useState("")
  const [cliente, setCliente] = useState("")
  const [endereco, setEndereco] = useState("")
  const [data, setData] = useState("")
  const [hora, setHora] = useState("")
  const [observacao, setObservacao] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [codigo, setCodigo] = useState<string | null>(null)

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
    if (telefone.replace(/\D/g, "").length < 10) return setErro("Confira o WhatsApp: com DDD, pelo menos 10 números.")
    // Horário de Brasília explícito: sem fuso, o servidor (UTC na Vercel) lia
    // "14:00" como 14:00 UTC, e a agenda mostrava 11:00.
    const dataEvento = `${data}T${hora}:00-03:00`
    const quando = new Date(dataEvento)
    if (Number.isNaN(quando.getTime()) || quando.getTime() < Date.now()) return setErro("A data e o horário da gravação precisam ser no futuro.")

    const dataBR = data.split("-").reverse().join("/")
    const descricao = [
      `Gravação em ${cliente.trim()}.`,
      `Endereço: ${endereco.trim()}`,
      `Data: ${dataBR} às ${hora} (horário de Brasília)`,
      observacao.trim() && `O que gravar: ${observacao.trim()}`,
    ].filter(Boolean).join("\n")

    setEnviando(true)
    try {
      const res = await fetch(urlComOrg("/api/publico/demanda"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomeCliente: nome.trim(),
          email: email.trim(),
          telefone: telefone.trim(),
          titulo: `Gravação · ${cliente.trim()}`,
          descricao,
          tipoSolicitacao: "cobertura",
          tipoVideo: "cobertura_evento",
          localEvento: endereco.trim(),
          dataEvento,
          clienteFinalNome: cliente.trim(),
          detalhesEntrega: { origem: "formulario_gravacao" },
        }),
      })
      if (!res.ok) throw new Error(await erroDaResposta(res))
      const json = await res.json()
      try { localStorage.setItem(chaveContato(), JSON.stringify({ nome: nome.trim(), telefone: telefone.trim(), email: email.trim() })) } catch { /* ignora */ }
      setCodigo(json.codigo ?? "")
    } catch (err: unknown) {
      setErro(erroDeEnvio(err))
    } finally {
      setEnviando(false)
    }
  }

  function outraGravacao() {
    setCliente(""); setEndereco(""); setData(""); setHora(""); setObservacao(""); setCodigo(null)
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
            <button type="button" onClick={outraGravacao} className="px-5 py-2.5 text-sm bg-purple-600 text-white rounded-xl hover:bg-purple-700">Pedir outra gravação</button>
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
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4" aria-labelledby="gravacao-onde">
            <h2 id="gravacao-onde" className="font-semibold text-white">A gravação</h2>
            <Campo id="cliente" label="Cliente ou clínica">
              <input id="cliente" value={cliente} onChange={e => setCliente(e.target.value)} required minLength={2} maxLength={160} autoComplete="organization" placeholder="Clínica Dra. Solange" className={inputClass} />
            </Campo>
            <Campo id="endereco" label="Endereço completo">
              <input id="endereco" value={endereco} onChange={e => setEndereco(e.target.value)} required minLength={5} maxLength={500} autoComplete="street-address" placeholder="Rua, número, bairro e cidade" className={inputClass} />
            </Campo>
            <div className="grid grid-cols-2 gap-4">
              <Campo id="data" label="Data">
                <input id="data" type="date" value={data} onChange={e => setData(e.target.value)} required className={`${inputClass} min-w-0`} />
              </Campo>
              <Campo id="hora" label="Horário" dica="Horário de Brasília.">
                <input id="hora" type="time" value={hora} onChange={e => setHora(e.target.value)} required className={`${inputClass} min-w-0`} />
              </Campo>
            </div>
            <Campo id="observacao" label="O que gravar (opcional)">
              <textarea id="observacao" value={observacao} onChange={e => setObservacao(e.target.value)} rows={3} maxLength={1000} placeholder="Depoimento, procedimento, entrega de equipamento…" className={inputClass} />
            </Campo>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4" aria-labelledby="gravacao-quem">
            <div>
              <h2 id="gravacao-quem" className="font-semibold text-white">Quem acompanha</h2>
              <p className="text-xs text-zinc-500 mt-1">Fica lembrado neste navegador para o próximo pedido.</p>
            </div>
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
          </section>

          {erro && (
            <div role="alert" className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" /> {erro}
            </div>
          )}

          <button type="submit" disabled={enviando || destino.estado === "inexistente"} className="w-full flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-60 transition-colors">
            {enviando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <CalendarPlus className="w-4 h-4" aria-hidden="true" />}
            {enviando ? "Enviando…" : "Solicitar gravação"}
          </button>
          <p className="text-center text-xs text-zinc-500">A equipe confirma a data e o videomaker antes da gravação.</p>
        </form>
      </div>
    </div>
  )
}

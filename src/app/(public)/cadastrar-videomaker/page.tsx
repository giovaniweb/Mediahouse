"use client"

import styles from "@/components/public/Recruitment.module.css"
import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { CheckCircle2, ArrowLeft, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { urlComOrg } from "@/lib/org-publica-cliente"
import { erroDaResposta, erroDeEnvio } from "@/lib/erro-envio-publico"
import { useEmpresaDestino, MarcaEmpresa, AvisoDestino } from "@/components/publico/EmpresaDestino"

const AREAS = ["Casamento", "Eventos Corporativos", "Clipes Musicais", "Documentário", "Publicidade", "Redes Sociais / Reels", "Institucional", "Esportes", "Gastronomia", "Moda & Beauty", "Imóveis", "Jornalismo"]

export default function CadastrarVideomakerdPage() {
  const destino = useEmpresaDestino()
  const [passo, setPasso] = useState(1)
  const etapaRef = useRef<HTMLDivElement>(null)
  // O foco vai para o título só quando a etapa MUDA. Com uma flag de "primeira
  // vez", o efeito duplo do modo estrito marcava o título já na abertura.
  const passoAnterior = useRef(passo)
  useEffect(() => {
    if (passoAnterior.current === passo) return
    passoAnterior.current = passo
    etapaRef.current?.querySelector<HTMLHeadingElement>("h2")?.focus()
  }, [passo])
  function avancar() {
    const campos = etapaRef.current?.querySelectorAll<HTMLInputElement>("input")
    for (const campo of campos ?? []) {
      campo.setCustomValidity(campo.required && !campo.value.trim() ? "Preencha este campo." : "")
      if (!campo.reportValidity()) return
    }
    setErro(null)
    setPasso(p => p + 1)
  }
  const [enviado, setEnviado] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [form, setForm] = useState({
    // Passo 1 — Dados da empresa
    cpfCnpj: "",
    razaoSocial: "",
    nomeFantasia: "",
    representante: "",
    // Passo 2 — Contato & Localização
    nome: "",
    email: "",
    telefone: "",
    cidade: "",
    estado: "",
    endereco: "",
    // Passo 3 — Financeiro & Portfólio
    chavePix: "",
    valorDiaria: "",
    redesSociais: [""],
    portfolio: "",
    areasAtuacao: [] as string[],
    observacoes: "",
  })

  function set(field: string, val: unknown) {
    setForm((f) => ({ ...f, [field]: val }))
  }

  function toggleArea(area: string) {
    setForm((f) => ({
      ...f,
      areasAtuacao: f.areasAtuacao.includes(area)
        ? f.areasAtuacao.filter((a) => a !== area)
        : [...f.areasAtuacao, area],
    }))
  }

  async function enviar() {
    if (loading) return
    setLoading(true)
    setErro(null)
    try {
      const res = await fetch(urlComOrg("/api/publico/videomaker"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          valorDiaria: form.valorDiaria ? parseFloat(form.valorDiaria) : undefined,
          redesSociais: form.redesSociais.filter(Boolean),
        }),
      })
      if (!res.ok) throw new Error(await erroDaResposta(res))
      setEnviado(true)
    } catch (e: unknown) {
      setErro(erroDeEnvio(e))
    } finally {
      setLoading(false)
    }
  }

  if (enviado) {
    return (
      <div className={cn(styles.page,"flex items-center justify-center px-6")}>
        <div className="max-w-md text-center">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Cadastro enviado!</h2>
          <p className="text-zinc-400 mb-8">
            Recebemos suas informações e nossa equipe irá analisar em breve. Se houver uma oportunidade, a equipe poderá entrar em contato pelo e-mail ou WhatsApp informado.
          </p>
          <Link href={destino.inicio} className="text-zinc-400 hover:text-white transition-colors flex items-center gap-2 justify-center">
            <ArrowLeft className="w-4 h-4" /> Voltar ao início
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      {/* Nav */}
      <nav className="border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <MarcaEmpresa destino={destino} />
          <Link href={destino.inicio} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Seu olhar. Novas possibilidades.</h1>
          <p className="text-zinc-400">{destino.estado === "pronto" ? `Apresente seu trabalho para ${destino.empresa.nome}. A equipe vai analisar seu perfil e entrar em contato se houver uma oportunidade.` : "Apresente seu trabalho. A empresa responsável pelo link vai analisar seu perfil e entrar em contato se houver uma oportunidade."}</p>
        </div>
        <AvisoDestino destino={destino} />

        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3].map((n) => (
            <div key={n} className="flex-1 flex items-center gap-2">
              <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
                passo > n ? "bg-green-500 text-white" : passo === n ? "bg-white text-zinc-900" : "bg-zinc-800 text-zinc-500"
              )}>
                {passo > n ? "✓" : n}
              </div>
              <span className={cn("text-xs hidden sm:block", passo === n ? "text-white" : "text-zinc-500")}>
                {n === 1 ? "Empresa" : n === 2 ? "Contato" : "Portfólio"}
              </span>
              {n < 3 && <div className="flex-1 h-px bg-zinc-800" />}
            </div>
          ))}
        </div>

        {/* Erro */}
        {erro && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl mb-6">
            {erro}
          </div>
        )}

        <div ref={etapaRef} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
          {/* Passo 1 — Empresa */}
          {passo === 1 && (
            <>
              <h2 tabIndex={-1} className="text-lg font-semibold text-white mb-4">Dados da Empresa / PJ</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">CNPJ / CPF *</label>
                  <input className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                    aria-label="CNPJ ou CPF" required minLength={11} inputMode="numeric" value={form.cpfCnpj} onChange={e => { e.target.setCustomValidity(""); set("cpfCnpj", e.target.value) }} placeholder="00.000.000/0001-00" />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">Razão Social</label>
                  <input className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                    aria-label="Razão social" value={form.razaoSocial} onChange={e => { e.target.setCustomValidity(""); set("razaoSocial", e.target.value) }} placeholder="Empresa LTDA" />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">Nome Fantasia</label>
                  <input className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                    aria-label="Nome fantasia" value={form.nomeFantasia} onChange={e => { e.target.setCustomValidity(""); set("nomeFantasia", e.target.value) }} placeholder="Nome Fantasia" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">Nome do Representante / Responsável (opcional)</label>
                  <input className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                    aria-label="Representante" value={form.representante} onChange={e => { e.target.setCustomValidity(""); set("representante", e.target.value) }} placeholder="João da Silva" />
                </div>
              </div>
              <button onClick={avancar}
                className="w-full bg-white text-zinc-900 font-semibold py-3 rounded-xl mt-2 hover:bg-zinc-100 transition-colors disabled:opacity-40">
                Continuar →
              </button>
            </>
          )}

          {/* Passo 2 — Contato */}
          {passo === 2 && (
            <>
              <h2 tabIndex={-1} className="text-lg font-semibold text-white mb-4">Contato & Localização</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">Nome Completo *</label>
                  <input className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                    aria-label="Nome completo" required minLength={2} autoComplete="name" value={form.nome} onChange={e => { e.target.setCustomValidity(""); set("nome", e.target.value) }} placeholder="João da Silva" />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">E-mail *</label>
                  <input type="email" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                    aria-label="E-mail" required autoComplete="email" value={form.email} onChange={e => { e.target.setCustomValidity(""); set("email", e.target.value) }} placeholder="joao@email.com" />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">WhatsApp *</label>
                  <input className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                    aria-label="WhatsApp" required minLength={10} inputMode="tel" autoComplete="tel" value={form.telefone} onChange={e => { e.target.setCustomValidity(""); set("telefone", e.target.value) }} placeholder="(11) 99999-9999" />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">Cidade *</label>
                  <input className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                    aria-label="Cidade" required minLength={2} autoComplete="address-level2" value={form.cidade} onChange={e => { e.target.setCustomValidity(""); set("cidade", e.target.value) }} placeholder="São Paulo" />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">Estado *</label>
                  <input className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                    aria-label="Estado" required minLength={2} autoComplete="address-level1" value={form.estado} onChange={e => { e.target.setCustomValidity(""); set("estado", e.target.value) }} placeholder="SP" maxLength={2} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">Endereço Completo</label>
                  <input className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                    aria-label="Endereço" value={form.endereco} onChange={e => { e.target.setCustomValidity(""); set("endereco", e.target.value) }} placeholder="Rua das Flores, 123 — Bairro" />
                </div>
              </div>
              <div className="flex gap-3 mt-2">
                <button onClick={() => setPasso(1)} className="flex-1 border border-zinc-700 text-zinc-300 font-medium py-3 rounded-xl hover:border-zinc-500 transition-colors">← Voltar</button>
                <button onClick={avancar}
                  className="flex-1 bg-white text-zinc-900 font-semibold py-3 rounded-xl hover:bg-zinc-100 transition-colors disabled:opacity-40">
                  Continuar →
                </button>
              </div>
            </>
          )}

          {/* Passo 3 — Financeiro & Portfolio */}
          {passo === 3 && (
            <>
              <h2 tabIndex={-1} className="text-lg font-semibold text-white mb-4">Financeiro & Portfólio</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">Chave PIX (opcional)</label>
                  <input className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                    aria-label="Chave PIX" value={form.chavePix} onChange={e => { e.target.setCustomValidity(""); set("chavePix", e.target.value) }} placeholder="CPF, e-mail ou chave aleatória" />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">Valor da Diária (R$)</label>
                  <input type="number" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                    aria-label="Valor da diária" value={form.valorDiaria} onChange={e => { e.target.setCustomValidity(""); set("valorDiaria", e.target.value) }} placeholder="800" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-zinc-400 block mb-1.5">Link do Portfólio</label>
                  <input className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                    aria-label="Portfólio" value={form.portfolio} onChange={e => { e.target.setCustomValidity(""); set("portfolio", e.target.value) }} placeholder="https://meusite.com ou Vimeo/YouTube" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-zinc-400 block mb-2">Redes Sociais</label>
                  {form.redesSociais.map((r, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <input className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                        value={r} onChange={e => { const arr = [...form.redesSociais]; arr[i] = e.target.value; set("redesSociais", arr) }}
                        placeholder="@usuario ou URL" />
                      {form.redesSociais.length > 1 && (
                        <button onClick={() => set("redesSociais", form.redesSociais.filter((_, j) => j !== i))} className="text-zinc-500 hover:text-red-400">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => set("redesSociais", [...form.redesSociais, ""])} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white mt-1">
                    <Plus className="w-3.5 h-3.5" /> Adicionar rede social
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-2">Áreas de Atuação</label>
                <div className="flex flex-wrap gap-2">
                  {AREAS.map((a) => (
                    <button key={a} aria-pressed={form.areasAtuacao.includes(a)} onClick={() => toggleArea(a)}
                      className={cn("text-xs px-3 py-1.5 rounded-full border transition-colors",
                        form.areasAtuacao.includes(a)
                          ? "bg-white text-zinc-900 border-white"
                          : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
                      )}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">Observações adicionais</label>
                <textarea className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10 resize-none"
                  rows={3} aria-label="Observações" value={form.observacoes} onChange={e => { e.target.setCustomValidity(""); set("observacoes", e.target.value) }}
                  placeholder="Equipamentos, experiências, certificações, etc." />
              </div>

              <div className="flex gap-3 mt-2">
                <button onClick={() => setPasso(2)} className="flex-1 border border-zinc-700 text-zinc-300 font-medium py-3 rounded-xl hover:border-zinc-500 transition-colors">← Voltar</button>
                <button onClick={enviar} disabled={loading}
                  className="flex-1 bg-white text-zinc-900 font-semibold py-3 rounded-xl hover:bg-zinc-100 transition-colors disabled:opacity-40">
                  {loading ? "Enviando..." : "Enviar Cadastro ✓"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

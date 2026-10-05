"use client"
// "Mande uma ideia": quem não tem login manda uma ideia ou solicitação para a
// social media, pela área da empresa. Grava no banco de ideias com origem
// "publico"; não cria demanda nem avisa a equipe — a social decide.
//
// Os links usam só `destino.inicio` (o "Voltar"); "Mandar outra" limpa o
// formulário em vez de navegar. No subdomínio o início é "/", e montar
// `${inicio}/x` daria "//x", outro site.
import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2 } from "lucide-react"
import superficie from "@/components/public/Recruitment.module.css"
import { slugDaPagina, urlComOrg } from "@/lib/org-publica-cliente"
import { erroDaResposta, erroDeEnvio } from "@/lib/erro-envio-publico"
import { useEmpresaDestino, MarcaEmpresa, AvisoDestino } from "@/components/publico/EmpresaDestino"
import { FormularioSugestao, type EnvioSugestao } from "@/components/social/FormularioSugestao"

// Mesma chave do "Quero um videomaker": quem pede costuma pedir de novo.
const chaveContato = () => `nuflow-contato:${slugDaPagina() ?? "padrao"}`

export default function FormularioIdeia() {
  const destino = useEmpresaDestino()
  const [linhas, setLinhas] = useState<{ id: string; nome: string }[]>([])
  const [contato, setContato] = useState<{ nome: string; telefone: string } | null>(null)
  const [enviado, setEnviado] = useState(false)
  const [rodada, setRodada] = useState(0)

  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(chaveContato()) ?? "null")
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restaura o que o navegador guardou
      setContato({ nome: salvo?.nome ?? "", telefone: salvo?.telefone ?? "" })
    } catch { setContato({ nome: "", telefone: "" }) }
    fetch(urlComOrg("/api/publico/ideia")).then((r) => r.json()).then((j) => setLinhas(j.linhas ?? [])).catch(() => setLinhas([]))
  }, [])

  async function enviar(envio: EnvioSugestao) {
    let res: Response
    try {
      res = await fetch(urlComOrg("/api/publico/ideia"), {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(envio),
      })
    } catch (e) { throw new Error(erroDeEnvio(e)) }
    if (!res.ok) throw new Error(await erroDaResposta(res))
    try { localStorage.setItem(chaveContato(), JSON.stringify({ nome: envio.nome, telefone: envio.telefone })) } catch { /* ignora */ }
    setContato({ nome: envio.nome ?? "", telefone: envio.telefone ?? "" })
    setEnviado(true)
  }

  const nomeEmpresa = destino.estado === "pronto" ? destino.empresa.nome : "a equipe"

  if (enviado) {
    return (
      <div className={`${superficie.page} flex items-center justify-center px-6`}>
        <div className="max-w-md py-16 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-500">
            <CheckCircle2 className="h-8 w-8 text-white" aria-hidden="true" />
          </div>
          <h1 className="mb-2 text-white">Recebido. Obrigado!</h1>
          <p className="mb-8 text-zinc-400">A social media de {nomeEmpresa} vai olhar e decidir se entra no planejamento.</p>
          <div className="flex flex-col items-center gap-4">
            <button type="button" onClick={() => { setEnviado(false); setRodada((r) => r + 1) }} className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm text-white hover:bg-purple-700">Mandar outra</button>
            <Link href={destino.inicio} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar ao início</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={superficie.page}>
      <nav className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-xl items-center justify-between px-6 py-4">
          <MarcaEmpresa destino={destino} />
          <Link href={destino.inicio} className="flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar
          </Link>
        </div>
      </nav>
      <div className="mx-auto max-w-xl px-6 py-10">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-white">Mande uma ideia</h1>
          <p className="text-sm text-zinc-400">Uma ideia de post ou algo que você precisa. Vai para a social media de {nomeEmpresa}.</p>
        </div>
        <AvisoDestino destino={destino} />
        {contato && <FormularioSugestao key={rodada} linhas={linhas} semLogin contatoInicial={contato} aoEnviar={enviar} />}
      </div>
    </div>
  )
}

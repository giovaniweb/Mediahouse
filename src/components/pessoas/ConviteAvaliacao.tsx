"use client"
// QR e link para o cliente avaliar o profissional por UM serviço.
//
// Antes o QR era o endereço fixo do profissional, e qualquer pessoa com ele dava
// quantas notas quisesse. Agora quem gerencia a equipe escolhe o serviço (a
// demanda), e o link gerado vale uma avaliação, por 30 dias. Gerar de novo para o
// mesmo serviço não abre segunda avaliação: o serviço é que conta.
import { useEffect, useState, type ComponentType } from "react"
import { Copy } from "lucide-react"
import { toast } from "sonner"

type QR = ComponentType<{ value: string; size?: number; bgColor?: string; fgColor?: string; level?: string }>
export type ServicoAvaliavel = { id: string; codigo: string; titulo: string }

export function ConviteAvaliacao({ tipo, profissionalId, nome, servicos, onFechar }: {
  tipo: "videomaker" | "editor"
  profissionalId: string
  nome: string
  servicos: ServicoAvaliavel[]
  onFechar: () => void
}) {
  const [QRCode, setQRCode] = useState<QR | null>(null)
  const [servicoId, setServicoId] = useState(servicos[0]?.id ?? "")
  // O link e o erro valem para o serviço em que foram pedidos: trocar o serviço
  // esconde o anterior sem precisar limpar nada.
  const [gerado, setGerado] = useState<{ servicoId: string; link: string; erro: string } | null>(null)
  const link = gerado?.servicoId === servicoId ? gerado.link : ""
  const erro = gerado?.servicoId === servicoId ? gerado.erro : ""

  useEffect(() => {
    import("qrcode.react").then(m => setQRCode(() => m.QRCodeSVG as QR)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!servicoId) return
    let vivo = true
    fetch("/api/avaliacoes/convite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, profissionalId, demandaId: servicoId }),
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}))
        if (!vivo) return
        if (!r.ok) setGerado({ servicoId, link: "", erro: data.error || "Não foi possível gerar o link." })
        else setGerado({ servicoId, link: `${window.location.origin}${data.caminho}`, erro: "" })
      })
      .catch(() => { if (vivo) setGerado({ servicoId, link: "", erro: "Não foi possível gerar o link. Confira sua conexão." }) })
    return () => { vivo = false }
  }, [tipo, profissionalId, servicoId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl mx-4 text-center">
        <h3 className="font-semibold text-white mb-2">QR Code de Avaliação</h3>
        {servicos.length === 0 ? (
          <p className="text-sm text-zinc-400 mb-6">
            {nome} ainda não tem serviço nesta empresa. O link de avaliação é gerado por serviço.
          </p>
        ) : (
          <>
            <p className="text-sm text-zinc-400 mb-4">
              Para o cliente avaliar {nome} por um serviço. Vale uma avaliação, por 30 dias.
            </p>
            <label className="block text-left text-xs text-zinc-500 mb-1" htmlFor="servico-avaliacao">Serviço</label>
            <select
              id="servico-avaliacao"
              value={servicoId}
              onChange={e => setServicoId(e.target.value)}
              className="w-full mb-5 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm bg-zinc-800 text-zinc-200"
            >
              {servicos.map(s => <option key={s.id} value={s.id}>{s.codigo} · {s.titulo}</option>)}
            </select>
            <div className="flex justify-center mb-6">
              <div className="bg-white p-4 rounded-xl">
                {QRCode && link ? (
                  <QRCode value={link} size={180} bgColor="#ffffff" fgColor="#18181b" level="M" />
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center text-zinc-400 text-sm">{erro || "Gerando…"}</div>
                )}
              </div>
            </div>
            {link && (
              <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2 mb-4">
                <span className="flex-1 text-xs text-zinc-400 truncate">{link}</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copiado!") }}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                  aria-label="Copiar link"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
        <button onClick={onFechar} className="w-full border border-zinc-700 text-zinc-300 py-2 rounded-xl hover:bg-zinc-800 text-sm">
          Fechar
        </button>
      </div>
    </div>
  )
}

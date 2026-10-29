import { describe, expect, it } from "vitest"
import { resumoDoPedido, type PedidoParaResumir } from "@/lib/meus-pedidos"
import { acompanhamentoDaGravacao } from "@/lib/acompanhamento-gravacao"

// "Meus Pedidos" (29/10/2026): o andamento em palavras de quem pediu.
const hoje = "2026-10-29"
const pedido = (p: Partial<PedidoParaResumir>): PedidoParaResumir => ({
  titulo: "Vídeo institucional", statusInterno: "planejamento", statusVisivel: "producao",
  ehGravacao: false, podeAprovar: true, entregaPendente: false, ...p,
})

describe("resumo do pedido", () => {
  it("diz a etapa e marca o caminho já feito", () => {
    const r = resumoDoPedido(pedido({}), hoje)
    expect(r).toMatchObject({ situacao: "Em produção", tom: "andamento", aberto: true, esperandoVoce: false })
    expect(r.passos.map((s) => s.estado)).toEqual(["feito", "agora", "depois", "depois", "depois", "depois"])
  })

  it("a entrega em aprovação é a vez de quem pediu", () => {
    const r = resumoDoPedido(pedido({ statusInterno: "revisao_pendente", statusVisivel: "aprovacao", entregaPendente: true }), hoje)
    expect(r).toMatchObject({ situacao: "Vídeo pronto, esperando sua aprovação", tom: "voce", esperandoVoce: true })
    // Quem não aprova (fez a peça) vê só a etapa.
    const outro = resumoDoPedido(pedido({ statusInterno: "revisao_pendente", statusVisivel: "aprovacao", entregaPendente: true, podeAprovar: false }), hoje)
    expect(outro).toMatchObject({ situacao: "Em aprovação", esperandoVoce: false })
  })

  it("depois do ajuste pedido, a vez é de quem edita", () => {
    // O card continua na coluna de aprovação, mas não há versão para aprovar.
    const r = resumoDoPedido(pedido({ statusInterno: "ajuste_solicitado", statusVisivel: "aprovacao" }), hoje)
    expect(r).toMatchObject({ situacao: "Ajuste pedido, em correção", tom: "andamento", esperandoVoce: false })
  })

  it("pedido parado na aprovação da gestão aparece em análise", () => {
    const r = resumoDoPedido(pedido({ statusInterno: "aguardando_aprovacao_interna", statusVisivel: "entrada" }), hoje)
    expect(r.situacao).toBe("Pedido em análise")
  })

  it("entregue fecha o caminho; recusado não mostra caminho", () => {
    const entregue = resumoDoPedido(pedido({ statusInterno: "encerrado", statusVisivel: "finalizado" }), hoje)
    expect(entregue).toMatchObject({ situacao: "Entregue", tom: "ok", aberto: false })
    expect(entregue.passos.every((s) => s.estado === "feito")).toBe(true)
    const recusado = resumoDoPedido(pedido({ statusInterno: "encerrado", statusVisivel: "entrada" }), hoje)
    expect(recusado).toMatchObject({ situacao: "Pedido não aprovado", aberto: false, passos: [] })
  })

  it("atraso só conta enquanto a bola não está com quem pediu", () => {
    expect(resumoDoPedido(pedido({ dataLimite: "2026-10-01" }), hoje).atrasada).toBe(true)
    expect(resumoDoPedido(pedido({ dataLimite: "2026-10-01", statusInterno: "revisao_pendente", statusVisivel: "aprovacao" }), hoje).atrasada).toBe(false)
  })

  it("gravação externa usa a frase e a linha do tempo do acompanhamento", () => {
    const g = pedido({ ehGravacao: true, tipoVideo: "cobertura_evento", localGravacao: "Clínica X", statusVisivel: "entrada", statusInterno: "aguardando_triagem" } as Partial<PedidoParaResumir>)
    const esperado = acompanhamentoDaGravacao(g, hoje)
    const r = resumoDoPedido(g, hoje)
    expect(r.situacao).toBe(esperado.situacao)
    expect(r.onde).toBe("Clínica X")
    expect(r.passos.length).toBe(esperado.trilha?.length ?? 0)
  })
})

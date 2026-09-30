import { metadadosFonte } from "@/lib/arquivo-fonte"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { correlacaoAuditoria, registrarAuditoria } from "@/lib/auditoria"

export async function backfillAuditado(tipo: "custos" | "arquivos", acesso: { organizacaoId: string; usuarioId: string }) {
  const { organizacaoId } = acesso, correlationId = correlacaoAuditoria()
  const acao = tipo === "custos" ? "manutencao.custos" : "manutencao.arquivos"
  return comOrg(organizacaoId, async () => {
    await registrarAuditoria(prisma, acesso, { acao, recurso: "manutencao", recursoId: tipo, correlationId, resultado: "intencao" })
    const demandas = await prisma.demanda.findMany({ where: { organizacaoId,
      statusVisivel: { in: tipo === "custos" ? ["finalizado"] : ["finalizado", "para_postar"] },
      ...(tipo === "custos" ? { videomakerId: { not: null } } : { linkFinal: { not: null } }),
    }, select: { id: true, codigo: true } })
    let processados = 0, pulados = 0, erros = 0
    const detalhes: { codigo: string; status: string; detalhe: string }[] = []
    for (const d of demandas) {
      try {
        const criado = await prisma.$transaction(async tx => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`backfill:${tipo}:${d.id}`}, 0))`
          const atual = await tx.demanda.findFirst({ where: { id: d.id, organizacaoId } })
          if (!atual) return false
          if (tipo === "custos") {
            if (atual.statusVisivel !== "finalizado" || !atual.videomakerId) return false
            if (await tx.custoVideomaker.findFirst({ where: { organizacaoId, demandaId: d.id, videomakerId: atual.videomakerId } })) return false
            const vinculo = await tx.videomakerOrganizacao.findUnique({ where: { organizacaoId_videomakerId: { organizacaoId, videomakerId: atual.videomakerId } }, select: { valorDiaria: true } })
            if (vinculo?.valorDiaria == null) return false
            const custo = await tx.custoVideomaker.create({ data: { organizacaoId, demandaId: d.id, videomakerId: atual.videomakerId, tipo: "projeto", valor: vinculo.valorDiaria,
              descricao: `Serviço (backfill): ${atual.codigo} — ${atual.titulo}`, dataReferencia: atual.finalizadaEm ?? atual.updatedAt, pago: false, statusPagamento: "pendente_nf" } })
            await registrarAuditoria(tx, acesso, { acao, recurso: "custo", recursoId: custo.id, correlationId, depois: { alterados: 1 } })
          } else {
            if (!["finalizado", "para_postar"].includes(atual.statusVisivel) || !atual.linkFinal) return false
            if (await tx.arquivo.findFirst({ where: { demandaId: d.id, tipoArquivo: "final" } })) return false
            const arquivo = await tx.arquivo.create({ data: { ...metadadosFonte(atual.linkFinal, organizacaoId, d.id), demandaId: d.id, tipoArquivo: "final", nomeArquivo: `${atual.codigo}_001.${atual.linkFinal.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "mp4"}`, url: atual.linkFinal, thumbnailUrl: atual.thumbnailUrl, sequencia: 1 } })
            await registrarAuditoria(tx, acesso, { acao, recurso: "arquivo", recursoId: arquivo.id, correlationId, depois: { publicado: false, alterados: 1 } })
          }
          return true
        })
        if (criado) processados++; else pulados++
        detalhes.push({ codigo: d.codigo, status: criado ? "criado" : "pulado", detalhe: criado ? "Registro criado" : "Já existente ou sem dados suficientes" })
      } catch {
        erros++
        await registrarAuditoria(prisma, acesso, { acao, recurso: "demanda", recursoId: d.id, correlationId, resultado: "falha" })
        detalhes.push({ codigo: d.codigo, status: "erro", detalhe: "Não foi possível processar esta demanda" })
      }
    }
    await registrarAuditoria(prisma, acesso, { acao, recurso: "manutencao", recursoId: tipo, correlationId, resultado: erros ? "falha" : "sucesso", depois: { processados, pulados, erros } })
    return { ok: erros === 0, total: demandas.length, processados, pulados, erros, detalhes, correlationId }
  })
}

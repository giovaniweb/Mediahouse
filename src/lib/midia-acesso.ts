import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAcesso } from "@/lib/acesso"
import { comOrg } from "@/lib/org-contexto"
import { filtroMinhasDemandas } from "@/lib/escopo-demanda"
import { organizacaoDoCaminho, urlDaMidia } from "@/lib/midia"
import { PUBLICADO, urlPublicavel } from "@/lib/publicacao-midia"
import { anexosDaIdeia } from "@/lib/social-quadro"

/** Autoriza o objeto registrado, nunca apenas o prefixo da empresa ou um token válido. */
export async function podeLerMidia(caminho: string, token: string | null): Promise<boolean> {
  const org = organizacaoDoCaminho(caminho)
  if (!org) return false
  const url = urlDaMidia(caminho), tipo = caminho.split("/")[2]
  if (!await comOrg(org, () => prisma.organizacao.findFirst({ where: { id: org, ativo: true }, select: { id: true } }))) return false
  const publico = await comOrg(org, async () => {
    const publicado = await prisma.arquivo.findFirst({ where: { ...PUBLICADO, demanda: { organizacaoId: org }, OR: [{ publicacaoUrl: url }, { publicacaoThumbnailUrl: url }] }, select: { demandaId: true, publicacaoUrl: true, publicacaoThumbnailUrl: true } })
    if (publicado && urlPublicavel(url, org, publicado.demandaId, publicado.publicacaoThumbnailUrl === url)) return true
    if (tipo === "depoimentos" && await prisma.depoimento.findFirst({ where: { organizacaoId: org, ativo: true, OR: [{ videoUrl: url }, { thumbnailUrl: url }] }, select: { id: true } })) return true
    if (!token) return false
    if (["videos", "thumbnails"].includes(tipo)) {
      const d = await prisma.demanda.findFirst({ where: { organizacaoId: org, publicToken: token, publicTokenAtivo: true,
        AND: [{ OR: [{ publicTokenExpiraEm: null }, { publicTokenExpiraEm: { gt: new Date() } }] },
          { OR: [{ linkFinal: url }, { thumbnailUrl: url }, { arquivos: { some: { tipoArquivo: "final", OR: [{ url }, { thumbnailUrl: url }, { originalUrl: url }] } } }] }] }, select: { id: true } })
      if (d && urlPublicavel(url, org, d.id, tipo === "thumbnails")) return true
      const a = await prisma.aprovacaoVideo.findFirst({ where: { token, demanda: { organizacaoId: org }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { demandaId: true, urlVideo: true, createdAt: true } })
      if (a && urlPublicavel(url, org, a.demandaId)) {
        if (a.urlVideo === url) return true
        const anterior = await prisma.aprovacaoVideo.findFirst({ where: { demandaId: a.demandaId, createdAt: { lt: a.createdAt } }, orderBy: { createdAt: "desc" }, select: { urlVideo: true } })
        if (anterior?.urlVideo === url) return true
        // Depois da conversão, o vídeo em avaliação é a prévia; o original do mesmo arquivo é o que se baixa.
        const videos = [a.urlVideo, anterior?.urlVideo].filter((v): v is string => !!v)
        if (await prisma.arquivo.findFirst({ where: { demandaId: a.demandaId, tipoArquivo: "final", originalUrl: url, url: { in: videos } }, select: { id: true } })) return true
      }
    }
    if (tipo === "nf") {
      if (await prisma.notaFiscalUpload.findFirst({ where: { token, url, demanda: { organizacaoId: org } }, select: { id: true } })) return true
      if (await prisma.custoEvento.findFirst({ where: { notaFiscalUrl: url, evento: { organizacaoId: org }, fornecedor: { portalToken: token, organizacaoId: org } }, select: { id: true } })) return true
    }
    return false
  })
  if (publico) return true

  const acesso = await requireAcesso()
  if (acesso instanceof NextResponse) return false
  return comOrg(acesso.organizacaoId, async () => {
    const p = acesso.permissoes
    if (acesso.organizacaoId === org) {
      if (tipo === "nf") {
        if (p.verCustos && (await prisma.notaFiscalUpload.findFirst({ where: { url, demanda: { organizacaoId: org } }, select: { id: true } }) ||
          await prisma.custoVideomaker.findFirst({ where: { notaFiscalUrl: url, organizacaoId: org }, select: { id: true } }) ||
          await prisma.demanda.findFirst({ where: { notaFiscalUrl: url, organizacaoId: org }, select: { id: true } }))) return true
        return p.verFinanceiroEvento && !!await prisma.custoEvento.findFirst({ where: { notaFiscalUrl: url, evento: { organizacaoId: org } }, select: { id: true } })
      }
      if (tipo === "coberturas" || tipo === "thumbnails") {
        if (p.verCoberturas && await prisma.eventoCoberturaUpload.findFirst({ where: { OR: [{ url }, { thumbnailUrl: url }], cobertura: { organizacaoId: org } }, select: { id: true } })) return true
      }
      if (tipo === "depoimentos") return p.gerenciarConfig && !!await prisma.depoimento.findFirst({ where: { organizacaoId: org, OR: [{ videoUrl: url }, { thumbnailUrl: url }] }, select: { id: true } })
      // Arquivo de referência de uma ideia do quadro da social
      // (org/{org}/docs/{ideiaId}/…): só se estiver na lista da PRÓPRIA ideia.
      // A ideia é aberta para a empresa, então vale para quem vê a social, o
      // Audiovisual ou o Growth — os que trabalham o pedido que ela vira.
      if (tipo === "docs" && (p.verSocial || p.verDemandas || p.verDesign)) {
        const ideia = await prisma.ideiaVideo.findFirst({ where: { id: caminho.split("/")[3], organizacaoId: org }, select: { id: true, formulario: true } })
        if (ideia && anexosDaIdeia(ideia.formulario, org, ideia.id).some((a) => a.url === url)) return true
      }
      if (!p.verDemandas && !p.verDesign) return false
      const d = await prisma.demanda.findFirst({ where: { organizacaoId: org,
        AND: [
          { OR: [...(p.verDemandas ? [{ area: "audiovisual" as const }] : []), ...(p.verDesign ? [{ area: "design" as const }] : [])] },
          ...(p.verTodasDemandas ? [] : [await filtroMinhasDemandas(acesso.usuarioId, org)]),
          { OR: [{ linkFinal: url }, { linkBrutos: url }, { linkPostagem: url }, { linkCliente: url }, { thumbnailUrl: url }, { arquivos: { some: {
            ...(p.verCustos ? {} : { tipoArquivo: { not: "nota_fiscal" as const } }), OR: [{ url }, { thumbnailUrl: url }, { originalUrl: url }] } } },
            { aprovacoesVideo: { some: { urlVideo: url } } }] },
        ] }, select: { id: true } })
      // Arquivos de briefing recebidos pelo WhatsApp usam docs/whatsapp; a vinculação exata no banco é obrigatória.
      return !!d && ((tipo === "docs" && caminho.split("/")[3] === "whatsapp") || caminho.split("/")[3] === d.id)
    }
    if (!p.verDemandas && !p.verDesign) return false
    if (!["videos", "thumbnails"].includes(tipo)) return false
    const parceria = await prisma.parceriaOrganizacao.findFirst({ where: { status: "aceita", encerradaEm: null, OR: [
      { organizacaoConvidanteId: org, organizacaoConvidadaId: acesso.organizacaoId },
      { organizacaoConvidanteId: acesso.organizacaoId, organizacaoConvidadaId: org },
    ] }, select: { id: true } })
    if (!parceria) return false
    const d = await prisma.demanda.findFirst({ where: { organizacaoId: org,
      compartilhamentos: { some: { organizacaoDestinoId: acesso.organizacaoId, revogadoEm: null } },
      OR: [{ linkFinal: url }, { thumbnailUrl: url }, { arquivos: { some: { tipoArquivo: { in: ["final", "bruto", "referencia"] }, OR: [{ url }, { thumbnailUrl: url }, { originalUrl: url }] } } }],
    }, select: { id: true, area: true } })
    return !!d && caminho.split("/")[3] === d.id && (d.area === "design" ? p.verDesign : p.verDemandas)
  })
}

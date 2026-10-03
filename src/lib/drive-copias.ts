import { createHash, randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "@prisma/client"
import { comOrg } from "@/lib/org-contexto"
import { criarFila, enfileirar, LeasePerdido, type LeaseJob } from "@/lib/fila-duravel"
import { videoDaDemanda, identificarMidia } from "@/lib/midia-identidade"
import { BUCKET_PRIVADO, urlAssinadaDeLeitura } from "@/lib/midia"
import { lerTokenDrive } from "@/lib/integration-secret"
import { baixarOriginalDrive, ErroCopiaDrive, provedorCopiaDrive, tokenCopiaDrive } from "@/lib/drive-copia-provedor"

export const TIPO_COPIA_DRIVE = "drive.copiar"
export function driveCopiaAtiva(org?: string) {
  return !!org && process.env.DRIVE_SYNC_V2_ATIVO === "sim" && process.env.DRIVE_SYNC_ORGANIZACAO_ID === org
}
const hash = (p: unknown) => createHash("sha256").update(JSON.stringify(p)).digest("hex")
function identidadeConexao(c: { googleDriveConnectedAt: Date | null; googleDriveEmail: string | null }) {
  return hash([c.googleDriveConnectedAt?.toISOString(), c.googleDriveEmail])
}
async function configuracao(tx: Prisma.TransactionClient, org: string, exigirPiloto = true) {
  if (exigirPiloto && !driveCopiaAtiva(org)) throw new ErroCopiaDrive("piloto_desativado")
  const c = await tx.configEmpresa.findFirst({ where: { organizacaoId: org } })
  if (!c?.googleRefreshToken || !c.googleDriveConnectedAt || !c.googleDriveFolderId || !/^[\w-]{1,200}$/.test(c.googleDriveFolderId)) throw new ErroCopiaDrive("conectar_conta_e_pasta")
  return c
}
/** Um lote limitado; a próxima página usa o último ID visto, mesmo quando inelegível. */
export async function enfileirarCopiasDrive(db: PrismaClient, org: string, cursor?: string) {
  if (cursor && !/^[\w-]{1,128}$/.test(cursor)) throw new ErroCopiaDrive("cursor_invalido")
  return comOrg(org, () => db.$transaction(async tx => {
    const c = await configuracao(tx,org), conexao = identidadeConexao(c)
    const arquivos = await tx.arquivo.findMany({ where: { ...(cursor ? { id: { gt: cursor } } : {}), tipoArquivo: "final", demanda: { organizacaoId: org, statusVisivel: { in: ["finalizado", "para_postar"] } } }, include: { demanda: { select: { id: true } } }, orderBy: { id: "asc" }, take: 51 })
    const lote = arquivos.slice(0,50)
    let enfileirados = 0, existentes = 0, ignorados = 0
    for (const a of lote) {
      const identidade = a.fonteProvedor === "supabase" && a.fonteBucket && a.fonteObjectKey ? { provedor: "supabase" as const, bucket: a.fonteBucket, objectKey: a.fonteObjectKey } : null
      // Legado sem identidade deve passar pelo inventário; não inferir original da prévia.
      if (!a.fonteVersao || !videoDaDemanda(identidade,org,a.demanda.id) || !identidade ||
        identificarMidia(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${identidade.bucket}/${identidade.objectKey}`)?.provedor !== "supabase") { ignorados++; continue }
      const chave = hash([org,a.id,a.fonteVersao,c.googleDriveFolderId,conexao])
      const criado = await tx.copiaDrive.createMany({ data: { id: randomUUID(), organizacaoId: org, arquivoId: a.id, fonteVersao: a.fonteVersao,
        fonteBucket: identidade.bucket, fonteObjectKey: identidade.objectKey, fonteSha256: a.fonteSha256, pastaId: c.googleDriveFolderId!, conexao, chave }, skipDuplicates: true })
      const copia = await tx.copiaDrive.findFirstOrThrow({ where: { organizacaoId: org, chave } })
      await enfileirar(tx,{ organizacaoId: org, tipo: TIPO_COPIA_DRIVE, referencia: copia.id, chave, expiraEm: new Date(Date.now()+7*86400_000) })
      if (criado.count) enfileirados++; else existentes++
    }
    return { enfileirados, existentes, ignorados, proximoCursor: arquivos.length > 50 ? lote.at(-1)!.id : null }
  }, { timeout: 15_000 }))
}
async function vigente(tx: Prisma.TransactionClient, lease: LeaseJob, referencia: string) {
  const c = await configuracao(tx,lease.organizacaoId)
  const copia = await tx.copiaDrive.findFirst({ where: { id: referencia, organizacaoId: lease.organizacaoId }, include: { arquivo: { include: { demanda: { select: { organizacaoId: true } } } } } })
  const a = copia?.arquivo
  if (!copia || !a || a.demanda.organizacaoId !== lease.organizacaoId || a.tipoArquivo !== "final" || a.fonteProvedor !== "supabase" ||
    copia.conexao !== identidadeConexao(c) || copia.pastaId !== c.googleDriveFolderId || copia.fonteVersao !== a.fonteVersao ||
    copia.fonteBucket !== a.fonteBucket || copia.fonteObjectKey !== a.fonteObjectKey || copia.fonteSha256 !== a.fonteSha256 ||
    !videoDaDemanda({ provedor: "supabase", bucket: copia.fonteBucket, objectKey: copia.fonteObjectKey },lease.organizacaoId,a.demandaId)) throw new ErroCopiaDrive("origem_ou_configuracao_alterada")
  return { copia, c }
}
export async function executarCopiaDrive(db: PrismaClient, org: string) {
  if (!driveCopiaAtiva(org)) return { estado: "desativado" }
  const fila = criarFila(db), [j] = await fila.reivindicar(org,1,[TIPO_COPIA_DRIVE],1)
  if (!j?.leaseToken) return { estado: "sem_trabalho" }
  const lease = { id: j.id, organizacaoId: org, leaseToken: j.leaseToken }
  const abort = new AbortController(), prazo = setTimeout(() => abort.abort(),180_000)
  let renovando: Promise<void> | undefined
  const timer = setInterval(() => {
    if (renovando) return
    renovando = fila.renovar(lease).then(ok => { if (!ok) abort.abort() }).catch(() => { abort.abort() }).finally(() => { renovando = undefined })
  },20_000)
  let download: Awaited<ReturnType<typeof baixarOriginalDrive>> | undefined
  const ler = async () => {
    const r = await fila.comLease(lease,(tx) => vigente(tx,lease,j.referencia))
    if (!r || abort.signal.aborted) throw new LeasePerdido()
    return r
  }
  try {
    const { copia, c } = await ler()
    const token = await tokenCopiaDrive(lerTokenDrive(c.googleRefreshToken!,org),abort.signal)
    const provedor = provedorCopiaDrive(token,abort.signal)
    await provedor.validarPasta(copia.pastaId)
    let id = copia.driveFileId
    if (!id) {
      const gerado = await provedor.gerarId()
      const salvo = await fila.comLease(lease,async tx => {
        const atual = await vigente(tx,lease,j.referencia)
        if (atual.copia.driveFileId) return atual.copia.driveFileId
        await tx.copiaDrive.update({ where: { id: copia.id, organizacaoId: org }, data: { driveFileId: gerado } })
        return gerado
      })
      if (!salvo) throw new LeasePerdido()
      id = salvo
    }
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!base) throw new ErroCopiaDrive("origem_nao_configurada")
    const url = copia.fonteBucket === BUCKET_PRIVADO ? await urlAssinadaDeLeitura(copia.fonteObjectKey,300) : `${base}/storage/v1/object/public/${copia.fonteBucket}/${copia.fonteObjectKey}`
    const identidade = identificarMidia(url)
    if (!url || identidade?.provedor !== "supabase" || identidade.bucket !== copia.fonteBucket || identidade.objectKey !== copia.fonteObjectKey) throw new ErroCopiaDrive("url_origem_invalida")
    await ler()
    download = await baixarOriginalDrive(url,abort.signal)
    const prova = download.prova
    if (copia.fonteSha256 && copia.fonteSha256 !== prova.sha256) throw new ErroCopiaDrive("checksum_origem_divergente")
    const salva = await fila.comLease(lease,async tx => {
      const atual = await vigente(tx,lease,j.referencia)
      if (atual.copia.sha256 && (atual.copia.sha256 !== prova.sha256 || atual.copia.tamanho !== prova.tamanho || atual.copia.md5 !== prova.md5)) throw new ErroCopiaDrive("origem_modificada")
      await tx.copiaDrive.update({ where: { id: copia.id, organizacaoId: org }, data: { ...prova, estado: "executando", erro: null } })
      return true
    })
    if (!salva) throw new LeasePerdido()
    const recibo = await provedor.copiar({ id, pasta: copia.pastaId, chave: copia.chave, nome: copia.fonteObjectKey.split("/").at(-1)!, path: download.path, prova,
      antesDeEscrever: async () => { await ler() } })
    const concluido = await fila.concluirLocal(lease,async tx => {
      await vigente(tx,lease,j.referencia)
      await tx.copiaDrive.update({ where: { id: copia.id, organizacaoId: org }, data: { estado: "concluido", driveVersion: recibo.version, erro: null, concluidoEm: new Date() } })
    })
    return { estado: concluido ? "concluido" : "lease_perdido" }
  } catch (e) {
    const erro = e instanceof ErroCopiaDrive ? e : new ErroCopiaDrive(e instanceof LeasePerdido ? "lease_perdido" : "falha_temporaria",true)
    await fila.comLease(lease,async tx => { await tx.copiaDrive.updateMany({ where: { id: j.referencia, organizacaoId: org }, data: { estado: "erro", erro: erro.codigo } }) })
    await fila.falhar(lease,erro.recuperavel ? "falha_temporaria" : "objeto_invalido",erro.recuperavel)
    return { estado: "erro", erro: erro.codigo }
  } finally { clearInterval(timer); clearTimeout(prazo); await renovando; await download?.limpar() }
}
export async function statusCopiasDrive(db: PrismaClient, org: string) {
  return comOrg(org,async () => {
    const [estados, recentes, ultima] = await Promise.all([
      db.jobAutomacao.groupBy({ by: ["estado"], where: { organizacaoId: org, tipo: TIPO_COPIA_DRIVE }, _count: true }),
      db.copiaDrive.findMany({ where: { organizacaoId: org }, orderBy: { updatedAt: "desc" }, take: 10, select: { id: true, arquivoId: true, estado: true, erro: true, concluidoEm: true, updatedAt: true } }),
      db.copiaDrive.findFirst({ where: { organizacaoId: org, estado: "concluido" }, orderBy: { concluidoEm: "desc" }, select: { concluidoEm: true } }),
    ])
    return { ultimaCopiaEm: ultima?.concluidoEm ?? null, ativo: driveCopiaAtiva(org), estados: Object.fromEntries(estados.map(e => [e.estado,e._count])), recentes }
  })
}

/** Verificação de leitura: não cria arquivo nem abre sessão de upload. */
export async function verificarPastaDrive(db: PrismaClient, org: string) {
  const c = await comOrg(org, () => db.$transaction(tx => configuracao(tx,org,false)))
  const signal = AbortSignal.timeout(15_000)
  const token = await tokenCopiaDrive(lerTokenDrive(c.googleRefreshToken!,org),signal)
  await provedorCopiaDrive(token,signal).validarPasta(c.googleDriveFolderId!)
  return { ok: true, verificadoEm: new Date().toISOString() }
}

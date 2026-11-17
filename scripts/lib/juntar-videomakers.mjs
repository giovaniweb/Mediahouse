// Juntar videomakers duplicados (16/11/2026). Usado por
// scripts/juntar-videomakers-duplicados.mjs e pelo teste de integração.
//
// Por que existe: o cadastro aceitava uma cidade só, e o videomaker que atende
// várias se cadastrava uma vez por cidade, com o mesmo telefone (Kevew Felix ×3,
// Matheus Lemes ×2 na Contourline). Com o número em mais de um cadastro da
// empresa, a identificação do WhatsApp (src/lib/whatsapp-identidade.ts) fica
// ambígua e todo aviso para ele é descartado, sem erro.
//
// Trabalha com SQL direto (cliente `pg`, conexão de dono): é manutenção, roda
// fora da aplicação e precisa enxergar todas as tabelas que apontam para o
// perfil. Tudo numa transação: ou junta tudo, ou nada muda.

import { createHash, randomUUID } from "node:crypto"

/** O mesmo número completo de `telefoneCompleto` (src/lib/whatsapp-identidade.ts). */
export function telefoneNormalizado(valor) {
  if (typeof valor !== "string") return null
  const internacional = valor.trim().startsWith("+")
  let d = valor.replace(/\D/g, "")
  if (!internacional && (d.length === 10 || d.length === 11)) d = `55${d}`
  return /^[1-9]\d{9,14}$/.test(d) ? d : null
}

/** Mesma chave de src/lib/cidades-videomaker.ts: sem acento, minúscula, sem a UF no fim. */
export function chaveCidade(texto) {
  return String(texto ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*[,/-]\s*[a-z]{2}$/, "")
    .replace(/\s+/g, " ")
    .trim()
}

function limpar(c) {
  const t = String(c ?? "").replace(/\s+/g, " ").trim().slice(0, 80).trim()
  return t.length >= 2 ? t : null
}

/** Cidades atendidas do que fica + base e atendidas dos que saem, sem repetir nem a base. */
export function juntarCidades(manter, outros) {
  const vistas = new Set()
  const base = limpar(manter.cidade)
  if (base) vistas.add(chaveCidade(base))
  const saida = []
  for (const c of [...(manter.cidadesAtendidas ?? []), ...outros.flatMap(o => [o.cidade, ...(o.cidadesAtendidas ?? [])])]) {
    const l = limpar(c)
    if (!l) continue
    const k = chaveCidade(l)
    if (!k || vistas.has(k)) continue
    vistas.add(k)
    saida.push(l)
  }
  return saida.slice(0, 30)
}

const uniao = (...listas) => [...new Set(listas.flat().filter(x => typeof x === "string" && x.trim()))]

/**
 * Grupos de videomakers com o mesmo telefone na mesma empresa. Para cada um,
 * os números do histórico e uma sugestão de qual manter: o que tem mais
 * histórico; empate, o mais antigo.
 */
export async function listarGrupos(c) {
  // A leitura roda também antes da migration 20261129000000 (sem a coluna).
  const { rows: [{ tem }] } = await c.query(`SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='videomakers' AND column_name='cidadesAtendidas') AS tem`)
  const atendidas = tem ? `v."cidadesAtendidas"` : `ARRAY[]::text[] AS "cidadesAtendidas"`
  const { rows } = await c.query(`
    SELECT vo."organizacaoId", o.nome AS empresa, vo.status AS "statusVinculo",
           v.id, v.nome, v.cidade, v.estado, ${atendidas}, v.email, v.telefone, v."createdAt",
           v."usuarioId", u.email AS "emailConta", u.status AS "statusConta",
           (SELECT count(*)::int FROM demandas x WHERE x."videomakerId"=v.id) AS demandas,
           (SELECT count(*)::int FROM convites_videomaker x WHERE x."videomakerId"=v.id) AS convites,
           (SELECT count(*)::int FROM custos_videomaker x WHERE x."videomakerId"=v.id) AS custos,
           (SELECT count(*)::int FROM avaliacoes_videomaker x WHERE x."videomakerId"=v.id) AS avaliacoes,
           (SELECT count(*)::int FROM notas_fiscais x WHERE x."videomakerId"=v.id) AS "notasFiscais",
           (SELECT count(*)::int FROM eventos x WHERE x."videomakerId"=v.id) AS eventos,
           (SELECT count(*)::int FROM coberturas_equipe x WHERE x."videomakerId"=v.id) AS coberturas
      FROM videomakers v
      JOIN videomaker_organizacao vo ON vo."videomakerId"=v.id
      JOIN organizacoes o ON o.id=vo."organizacaoId"
      LEFT JOIN usuarios u ON u.id=v."usuarioId"
     WHERE v.telefone IS NOT NULL`)
  const porChave = new Map()
  for (const r of rows) {
    const tel = telefoneNormalizado(r.telefone)
    if (!tel) continue
    const k = `${r.organizacaoId}|${tel}`
    if (!porChave.has(k)) porChave.set(k, { organizacaoId: r.organizacaoId, empresa: r.empresa, telefone: tel, cadastros: [] })
    r.historico = r.demandas + r.convites + r.custos + r.avaliacoes + r.notasFiscais + r.eventos + r.coberturas
    porChave.get(k).cadastros.push(r)
  }
  return [...porChave.values()]
    .filter(g => g.cadastros.length > 1)
    .map(g => {
      g.cadastros.sort((a, b) => a.createdAt - b.createdAt)
      const sugestao = [...g.cadastros].sort((a, b) => b.historico - a.historico || a.createdAt - b.createdAt)[0]
      return { ...g, sugestao: sugestao.id }
    })
    .sort((a, b) => a.empresa.localeCompare(b.empresa) || a.telefone.localeCompare(b.telefone))
}

/** Tudo que aponta para `videomakers.id`, lido do catálogo: nada fica para trás. */
async function referencias(c) {
  const { rows } = await c.query(`
    SELECT cl.relname AS tabela, a.attname AS coluna
      FROM pg_constraint k
      JOIN pg_class cl ON cl.oid=k.conrelid
      JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=ANY(k.conkey)
     WHERE k.contype='f' AND k.confrelid='public.videomakers'::regclass`)
  return rows
}

const ORDEM_STATUS = { preferencial: 0, ativo: 1, pendente: 2, inativo: 3 }

/**
 * Junta `juntar` em `manter`, numa transação. Devolve o resumo e a cópia do
 * que foi apagado ou alterado (para guardar fora do banco).
 *
 * Contas (usuarios): fica a do cadastro mantido; se ele não tiver, a primeira
 * ativa dos juntados passa para ele (o login dela continua valendo). As outras
 * saem desta empresa como no "Desativar cadastro" (src/lib/remover-da-empresa.ts):
 * só nesta empresa → inativa e sem telefone; em outra também → perde só o
 * vínculo daqui. Os pedidos que elas fizeram nesta empresa passam para a conta
 * que fica, como no Mesclar.
 *
 * @param {import("pg").Client} c
 * @param {{ manterId: string, juntarIds: string[], organizacaoId?: string, forcar?: boolean, ator?: string,
 *   antesDeConfirmar?: (copia: any) => unknown }} opcoes
 */
export async function juntarVideomakers(c, { manterId, juntarIds, organizacaoId: orgPedida, forcar = false, ator = "script:juntar-videomakers", antesDeConfirmar }) {
  if (!manterId || !juntarIds?.length) throw new Error("Informe --manter <id> e --juntar <ids>.")
  if (juntarIds.includes(manterId)) throw new Error("O cadastro mantido não pode estar em --juntar.")
  const ids = [manterId, ...juntarIds]

  await c.query("BEGIN")
  try {
    const { rows: perfis } = await c.query(`SELECT * FROM videomakers WHERE id = ANY($1) FOR UPDATE`, [ids])
    const perfil = new Map(perfis.map(p => [p.id, p]))
    for (const id of ids) if (!perfil.has(id)) throw new Error(`Videomaker ${id} não existe.`)
    const manter = perfil.get(manterId)
    const outros = juntarIds.map(id => perfil.get(id))

    // Empresa: a pedida, ou a única em que todos têm vínculo.
    const { rows: vinc } = await c.query(`SELECT * FROM videomaker_organizacao WHERE "videomakerId" = ANY($1)`, [ids])
    const orgsDeTodos = [...new Set(vinc.map(v => v.organizacaoId))].filter(o => ids.every(id => vinc.some(v => v.videomakerId === id && v.organizacaoId === o)))
    const organizacaoId = orgPedida ?? (orgsDeTodos.length === 1 ? orgsDeTodos[0] : null)
    if (!organizacaoId) throw new Error(`Não há uma empresa só em comum (${orgsDeTodos.length}); passe --org.`)
    if (!orgsDeTodos.includes(organizacaoId)) throw new Error("Nem todos têm vínculo com a empresa informada.")

    const tel = telefoneNormalizado(manter.telefone)
    const diferentes = outros.filter(o => telefoneNormalizado(o.telefone) !== tel)
    if (diferentes.length && !forcar) throw new Error(`Telefone diferente do mantido: ${diferentes.map(d => d.id).join(", ")} (use --forcar se for a mesma pessoa).`)

    // "Empresa dele" (organizacaoExecutoraId) num juntado: só junta se o
    // mantido já tem a MESMA nessa empresa. Passá-la para o mantido exige que a
    // conta dele seja admin/gestor lá (gatilho videomaker_empresa_executora_regras)
    // e decide quem executa os cards abertos: isso se acerta na ficha, antes.
    for (const v of vinc.filter(x => x.videomakerId !== manterId && x.organizacaoExecutoraId)) {
      const meu = vinc.find(x => x.videomakerId === manterId && x.organizacaoId === v.organizacaoId)
      if (meu?.organizacaoExecutoraId !== v.organizacaoExecutoraId) {
        throw new Error(`O cadastro ${v.videomakerId} tem "Empresa dele" (${v.organizacaoExecutoraId}) na empresa ${v.organizacaoId} e o mantido não tem a mesma. ` +
          `Ponha a mesma "Empresa dele" na ficha do mantido (ou mantenha o ${v.videomakerId}) e rode de novo.`)
      }
    }

    // Retrato de ANTES (clonado: os objetos abaixo mudam durante a junção).
    const copia = structuredClone({ em: new Date().toISOString(), organizacaoId, manter, juntados: outros, vinculos: vinc, fiscais: [], contas: [] })
    const contagem = {}
    const conta = (k, n) => { contagem[k] = (contagem[k] ?? 0) + n }

    // ── 1) Perfil: cidades, listas e o que faltar no mantido ────────────────
    const cidadesAtendidas = juntarCidades(manter, outros)
    await c.query(`UPDATE videomakers SET
        "cidadesAtendidas"=$2,
        "areasAtuacao"=$3, habilidades=$4, equipamentos=$5, "redesSociais"=$6,
        email=COALESCE(email,$7), estado=COALESCE(estado,$8), portfolio=COALESCE(portfolio,$9), cidade=COALESCE(cidade,$10),
        "updatedAt"=now()
      WHERE id=$1`, [
      manterId, cidadesAtendidas,
      uniao(manter.areasAtuacao ?? [], ...outros.map(o => o.areasAtuacao ?? [])),
      uniao(manter.habilidades ?? [], ...outros.map(o => o.habilidades ?? [])),
      uniao(manter.equipamentos ?? [], ...outros.map(o => o.equipamentos ?? [])),
      uniao(manter.redesSociais ?? [], ...outros.map(o => o.redesSociais ?? [])),
      outros.find(o => o.email)?.email ?? null,
      outros.find(o => o.estado)?.estado ?? null,
      outros.find(o => o.portfolio)?.portfolio ?? null,
      outros.find(o => o.cidade)?.cidade ?? null,
    ])

    // ── 2) Vínculos e dados fiscais, por empresa ────────────────────────────
    // O vínculo que o mantido não tem passa para ele já (o executor da parceira
    // só aceita quem tem vínculo com ela). O que os dois têm só se junta DEPOIS
    // do histórico: apagar o vínculo do juntado com "Empresa dele" revoga os
    // espelhos feitos por ele (gatilho empresa_executora_revoga_espelho), e
    // eles ainda apontariam para o juntado.
    const vinculosParaJuntar = []
    for (const o of outros) {
      for (const v of vinc.filter(x => x.videomakerId === o.id)) {
        const meu = vinc.find(x => x.videomakerId === manterId && x.organizacaoId === v.organizacaoId)
        if (!meu) {
          await c.query(`UPDATE videomaker_organizacao SET "videomakerId"=$1, "updatedAt"=now() WHERE id=$2`, [manterId, v.id])
          v.videomakerId = manterId
          conta("vinculos movidos", 1)
        } else {
          vinculosParaJuntar.push({ v, meu })
        }
      }
      const { rows: fiscais } = await c.query(`SELECT * FROM videomaker_dados_fiscais WHERE "videomakerId"=$1`, [o.id])
      copia.fiscais.push(...structuredClone(fiscais))
      for (const f of fiscais) {
        const { rows: [meu] } = await c.query(`SELECT id FROM videomaker_dados_fiscais WHERE "videomakerId"=$1 AND "organizacaoId"=$2`, [manterId, f.organizacaoId])
        if (!meu) {
          await c.query(`UPDATE videomaker_dados_fiscais SET "videomakerId"=$1, "updatedAt"=now() WHERE id=$2`, [manterId, f.id])
        } else {
          await c.query(`UPDATE videomaker_dados_fiscais SET
              "cpfCnpj"=COALESCE("cpfCnpj",$2), "razaoSocial"=COALESCE("razaoSocial",$3), "nomeFantasia"=COALESCE("nomeFantasia",$4),
              representante=COALESCE(representante,$5), endereco=COALESCE(endereco,$6),
              "dadosBancarios"=COALESCE("dadosBancarios",$7), "chavePix"=COALESCE("chavePix",$8), "updatedAt"=now()
            WHERE id=$1`, [meu.id, f.cpfCnpj, f.razaoSocial, f.nomeFantasia, f.representante, f.endereco, f.dadosBancarios, f.chavePix])
          await c.query(`DELETE FROM videomaker_dados_fiscais WHERE id=$1`, [f.id])
        }
        conta("dados fiscais", 1)
      }
    }

    // ── 3) Histórico ────────────────────────────────────────────────────────
    // Espelhos antes das demandas: trocar o videomaker do card revoga o espelho
    // feito "por" quem saiu (gatilho demandas_videomaker_revoga_espelho).
    const mover = async (rotulo, sql) => conta(rotulo, (await c.query(sql, [manterId, juntarIds])).rowCount)
    await mover("espelhos", `UPDATE demanda_compartilhamento SET "porVideomakerId"=$1 WHERE "porVideomakerId"=ANY($2)`)
    await mover("demandas", `UPDATE demandas SET "videomakerId"=$1 WHERE "videomakerId"=ANY($2)`)
    await mover("eventos", `UPDATE eventos SET "videomakerId"=$1 WHERE "videomakerId"=ANY($2)`)
    await mover("coberturas", `UPDATE coberturas_equipe SET "videomakerId"=$1 WHERE "videomakerId"=ANY($2)`)
    await mover("custos", `UPDATE custos_videomaker SET "videomakerId"=$1 WHERE "videomakerId"=ANY($2)`)
    await mover("avaliacoes", `UPDATE avaliacoes_videomaker SET "videomakerId"=$1 WHERE "videomakerId"=ANY($2)`)
    await mover("notas fiscais", `UPDATE notas_fiscais SET "videomakerId"=$1 WHERE "videomakerId"=ANY($2)`)
    await mover("executor espelho", `UPDATE executor_espelho SET "videomakerId"=$1 WHERE "videomakerId"=ANY($2)`)
    // Convite da rede pendente: um por empresa e profissional. O repetido sai.
    await mover("convites da rede repetidos", `DELETE FROM convites_rede r WHERE r."videomakerId"=ANY($2) AND r.status='pendente'
      AND EXISTS (SELECT 1 FROM convites_rede m WHERE m."videomakerId"=$1 AND m.status='pendente' AND m."organizacaoId"=r."organizacaoId")`)
    await mover("convites da rede", `UPDATE convites_rede SET "videomakerId"=$1 WHERE "videomakerId"=ANY($2)`)
    // O convite é imutável (gatilho convite_condicao_imutavel: a condição
    // aceita não muda). Aqui só muda QUEM, para o mesmo profissional; a trava
    // sai e volta dentro desta transação.
    await c.query(`ALTER TABLE convites_videomaker DISABLE TRIGGER convite_condicao_imutavel`)
    await mover("convites", `UPDATE convites_videomaker SET "videomakerId"=$1 WHERE "videomakerId"=ANY($2)`)
    await c.query(`ALTER TABLE convites_videomaker ENABLE TRIGGER convite_condicao_imutavel`)
    await mover("aceites dos termos", `UPDATE aceites_termos SET "titularId"=$1 WHERE "titularTipo"='videomaker' AND "titularId"=ANY($2)`)

    // ── 3b) Vínculos que os dois tinham na mesma empresa ────────────────────
    // Fica o do mantido, com o que faltar nele, a melhor situação e a lista
    // negra se qualquer um tinha. Com o histórico já no mantido, apagar o
    // vínculo do juntado não revoga espelho nenhum.
    for (const { v, meu } of vinculosParaJuntar) {
      const status = ORDEM_STATUS[v.status] < ORDEM_STATUS[meu.status] ? v.status : meu.status
      await c.query(`UPDATE videomaker_organizacao SET
          status=$2, "valorDiaria"=COALESCE("valorDiaria",$3), observacoes=COALESCE(observacoes,$4),
          "emListaNegra"=("emListaNegra" OR $5), "listaNegraMotivo"=COALESCE("listaNegraMotivo",$6),
          "podeEditar"=("podeEditar" OR $7), "organizacaoExecutoraId"=COALESCE("organizacaoExecutoraId",$8), "updatedAt"=now()
        WHERE id=$1`, [meu.id, status, v.valorDiaria, v.observacoes, v.emListaNegra, v.listaNegraMotivo, v.podeEditar, v.organizacaoExecutoraId])
      meu.status = status
      await c.query(`DELETE FROM videomaker_organizacao WHERE id=$1`, [v.id])
      conta("vinculos juntados", 1)
    }

    // ── 4) Contas ───────────────────────────────────────────────────────────
    const contaIds = [...new Set(outros.map(o => o.usuarioId).filter(Boolean))]
    const { rows: contas } = contaIds.length || manter.usuarioId
      ? await c.query(`SELECT id, nome, email, telefone, status FROM usuarios WHERE id = ANY($1)`, [[...contaIds, manter.usuarioId].filter(Boolean)])
      : { rows: [] }
    copia.contas = contas
    let contaQueFica = manter.usuarioId
    // Desliga os perfis juntados das contas antes (usuarioId é único).
    await c.query(`UPDATE videomakers SET "usuarioId"=NULL WHERE id = ANY($1)`, [juntarIds])
    if (!contaQueFica) {
      const herdada = outros.map(o => contas.find(u => u.id === o.usuarioId)).find(u => u && u.status === "ativo")
        ?? outros.map(o => contas.find(u => u.id === o.usuarioId)).find(Boolean)
      if (herdada) {
        contaQueFica = herdada.id
        await c.query(`UPDATE videomakers SET "usuarioId"=$2 WHERE id=$1`, [manterId, contaQueFica])
        conta("conta herdada", 1)
      }
    }
    for (const uid of contaIds.filter(id => id !== contaQueFica)) {
      if (contaQueFica) {
        conta("pedidos da conta", (await c.query(`UPDATE demandas SET "solicitanteId"=$1 WHERE "organizacaoId"=$2 AND "solicitanteId"=$3`, [contaQueFica, organizacaoId, uid])).rowCount)
      }
      await c.query(`DELETE FROM permissoes_usuario WHERE "usuarioId"=$1 AND "organizacaoId"=$2`, [uid, organizacaoId])
      const { rows: [{ n }] } = await c.query(`SELECT count(*)::int AS n FROM usuario_organizacao WHERE "usuarioId"=$1 AND "organizacaoId"<>$2`, [uid, organizacaoId])
      if (n === 0) {
        await c.query(`UPDATE usuarios SET status='inativo', telefone=NULL, "updatedAt"=now() WHERE id=$1`, [uid])
        conta("contas desativadas", 1)
      } else {
        await c.query(`DELETE FROM usuario_organizacao WHERE "usuarioId"=$1 AND "organizacaoId"=$2`, [uid, organizacaoId])
        conta("contas tiradas desta empresa", 1)
      }
    }

    // ── 5) Nada mais aponta para os juntados: apaga ─────────────────────────
    for (const r of await referencias(c)) {
      const { rows: [{ n }] } = await c.query(`SELECT count(*)::int AS n FROM "${r.tabela}" WHERE "${r.coluna}" = ANY($1)`, [juntarIds])
      if (n > 0) throw new Error(`Ainda há ${n} linha(s) em ${r.tabela}.${r.coluna} apontando para um juntado; nada foi alterado.`)
    }
    conta("cadastros apagados", (await c.query(`DELETE FROM videomakers WHERE id = ANY($1)`, [juntarIds])).rowCount)

    // ── 6) Auditoria (mesmo formato de src/lib/auditoria.ts) ────────────────
    const correlationId = randomUUID()
    const alterados = Object.values(contagem).reduce((a, b) => a + b, 0)
    const chave = createHash("sha256").update(JSON.stringify(["tecnico", ator, correlationId, "videomaker.juntar", "videomaker", manterId, "sucesso"])).digest("hex")
    await c.query(`INSERT INTO eventos_auditoria (id,"organizacaoId","atorTipo","atorId",acao,recurso,"recursoId",resultado,"correlationId",chave,antes,depois,"createdAt","payloadExpiraEm")
      VALUES ($1,$2,'tecnico',$3,'videomaker.juntar','videomaker',$4,'sucesso',$5,$6,$7,$8,now(),now()+interval '90 days')`,
      [randomUUID(), organizacaoId, ator, manterId, correlationId, chave, JSON.stringify({ processados: juntarIds.length }), JSON.stringify({ alterados, campos: ["cidade", "telefone"] })])

    // A cópia vai para fora do banco ANTES do COMMIT: se não der para
    // guardá-la, nada muda.
    if (antesDeConfirmar) await antesDeConfirmar(copia)
    await c.query("COMMIT")
    return { organizacaoId, manterId, juntados: juntarIds, cidadesAtendidas, contaQueFica, contagem, correlationId, copia }
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {})
    throw e
  }
}

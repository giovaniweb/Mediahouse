-- Onda 2A: empresa nova pronta (escrita em 21/10/2026, renomeada em 12/11/2026
-- para vir depois da Onda 3).
--
-- Sobe DEPOIS de 20261111120000_aceites_termos (a última aplicada em produção em
-- 12/11/2026), nunca junto. Aditiva para o código que está no ar, com UMA
-- exceção, a do item 3: o código da demanda deixa de ser único na plataforma e
-- passa a ser único por empresa. O código antigo continua funcionando com isso
-- (ele sorteia e tenta de novo quando o banco recusa; o índice novo também
-- recusa repetido dentro da empresa). Nada é apagado e nenhum código existente
-- muda.
--
-- 1) Prefixo e numeração por empresa. Quem já existe fica com VOP, que é o que
--    os códigos antigos usam, menos a GH Produção (gh-producao), que fica com
--    GH. Empresa nova recebe o prefixo na criação.
-- 2) Primeiros passos do painel. As empresas que já existem não veem a lista:
--    ela é para empresa nova.
-- 3) Unicidade de demandas.codigo por (organizacaoId, codigo).
-- 4) Duas funções para o conversor de vídeo atender todas as empresas.
--
-- Volta: scripts/volta/20261112120000_empresa_nasce_pronta.sql (depois de
-- voltar o código).

-- 1) Prefixo e contador ────────────────────────────────────────────────────────
ALTER TABLE "organizacoes" ADD COLUMN "prefixoCodigo" TEXT;
ALTER TABLE "organizacoes" ADD CONSTRAINT "organizacoes_prefixoCodigo_check"
  CHECK ("prefixoCodigo" IS NULL OR "prefixoCodigo" ~ '^[A-Z]{2,5}$');
UPDATE "organizacoes" SET "prefixoCodigo" = 'VOP';
-- GH Produção (piloto da Onda 4) fica com GH, decisão do Giovani em 12/11/2026.
-- Em 12/11 ela não tinha nenhuma demanda nem evento; se tivesse, os códigos
-- VOP-... gravados continuariam como estão (só o próximo código muda). O
-- contador nasce vazio, então a primeira sai GH-AA-0001. Sem a empresa (outro
-- banco), o UPDATE não acha nada e segue.
UPDATE "organizacoes" SET "prefixoCodigo" = 'GH' WHERE "slug" = 'gh-producao';

CREATE TABLE "contadores_codigo" (
  "organizacaoId" TEXT NOT NULL,
  "ano" INTEGER NOT NULL,
  "ultimo" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contadores_codigo_pkey" PRIMARY KEY ("organizacaoId", "ano"),
  CONSTRAINT "contadores_codigo_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contadores_codigo_ano_check" CHECK ("ano" BETWEEN 0 AND 99),
  CONSTRAINT "contadores_codigo_ultimo_check" CHECK ("ultimo" >= 0)
);
ALTER TABLE "contadores_codigo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contadores_codigo" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "contadores_codigo" FROM PUBLIC, app_auth, app_user;
GRANT SELECT, INSERT, UPDATE ON "contadores_codigo" TO app_user;
CREATE POLICY "contadores_codigo_org" ON "contadores_codigo" TO app_user
USING ("organizacaoId" = current_setting('app.org_id', true))
WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));

-- 2) Primeiros passos ──────────────────────────────────────────────────────────
ALTER TABLE "organizacoes" ADD COLUMN "primeirosPassosDispensadosEm" TIMESTAMP(3),
  ADD COLUMN "linkPaginaCopiadoEm" TIMESTAMP(3);
UPDATE "organizacoes" SET "primeirosPassosDispensadosEm" = CURRENT_TIMESTAMP;

-- 3) Código único por empresa ──────────────────────────────────────────────────
-- O índice novo nasce antes de o antigo sair: em nenhum momento a tabela fica
-- sem unicidade. Todo par (empresa, código) já é único, porque o código era
-- único sozinho.
CREATE UNIQUE INDEX "demandas_organizacaoId_codigo_key" ON "demandas"("organizacaoId", "codigo");
DROP INDEX "demandas_codigo_key";

-- 4) Conversor de vídeo para todas as empresas ─────────────────────────────────
-- O worker do Railway não tem empresa: ele pede trabalho e devolve o resultado.
-- Antes, a empresa era uma variável de ambiente (MIDIA_WORKER_ORGANIZACAO_ID).
-- Agora cada job carrega a sua, e estas duas funções devolvem SÓ ids — nunca
-- conteúdo — para a rota do worker entrar na empresa certa (comOrg) antes de
-- tocar em qualquer coisa. O lease continua sendo conferido dentro da empresa.

-- Empresas ativas com mídia na fila, da espera mais antiga para a mais nova.
CREATE FUNCTION public.empresas_com_midia_pendente(p_limite INTEGER)
RETURNS TABLE (org TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT j."organizacaoId"
    FROM public.jobs_automacao j
    JOIN public.organizacoes o ON o.id = j."organizacaoId"
   WHERE o.ativo
     AND j.tipo IN ('midia.preparar', 'midia.converter')
     AND j.estado IN ('pendente', 'executando')
   GROUP BY j."organizacaoId"
   ORDER BY min(j."agendadoPara")
   LIMIT LEAST(GREATEST(COALESCE(p_limite, 20), 1), 100)
$$;

-- A empresa de um job de conversão, pelo id que o próprio worker recebeu.
CREATE FUNCTION public.org_do_job_midia(p_job TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT "organizacaoId" FROM public.jobs_automacao
   WHERE id = p_job AND tipo = 'midia.converter'
$$;

REVOKE ALL ON FUNCTION public.empresas_com_midia_pendente(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.org_do_job_midia(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.empresas_com_midia_pendente(INTEGER) TO app_user;
GRANT EXECUTE ON FUNCTION public.org_do_job_midia(TEXT) TO app_user;

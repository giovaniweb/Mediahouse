-- Validade dos links públicos que nunca expiravam (Onda 1). Escrita em 07/10/2026 e
-- renomeada em 02/11 para vir depois da 20261030200000_tokens_mcp, a última aplicada.
--
-- O portal do fornecedor (/fornecedor/<token>), a página pública da cobertura
-- (/e/<slug>) e o relatório executivo (?token= e o MCP) valiam para sempre: um
-- link encaminhado uma vez continuava abrindo notas fiscais, fotos do evento e
-- números da empresa por anos. Agora cada um tem data de validade, e a tela
-- interna gera outro link quando precisa.
--
-- Os links que já circulam NÃO quebram hoje: ganham a validade a partir de
-- agora (o DEFAULT é avaliado uma vez, no ALTER, para as linhas existentes).
--   fornecedor  90 dias
--   cobertura   180 dias
--   relatório   180 dias, só para a empresa que já tem token
--
-- Aditiva e sem trava: a conferência da data fica no código (rotas públicas e
-- lib/midia-acesso). O código que está no ar ignora as colunas, então a ordem
-- entre esta migration e o deploy não abre janela. A função org_por_credencial
-- não muda — de propósito, para não disputar o corpo dela com outra migration.
--
-- Volta: ALTER TABLE ... DROP COLUMN das três colunas (depois de voltar o código).

ALTER TABLE "fornecedores" ADD COLUMN "portalTokenExpiraEm" TIMESTAMP(3) NOT NULL DEFAULT (now() + '90 days'::interval);

ALTER TABLE "coberturas" ADD COLUMN "linkPublicoExpiraEm" TIMESTAMP(3) NOT NULL DEFAULT (now() + '180 days'::interval);

ALTER TABLE "organizacoes" ADD COLUMN "relatorioTokenExpiraEm" TIMESTAMP(3);
UPDATE "organizacoes"
   SET "relatorioTokenExpiraEm" = now() + '180 days'::interval
 WHERE "relatorioToken" IS NOT NULL;

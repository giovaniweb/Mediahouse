-- VOLTA da migration 20261030200000_tokens_mcp.
--
-- Tira as chaves por pessoa do MCP e a marca de origem das demandas. As
-- demandas criadas pelo assistente CONTINUAM existindo: só deixam de saber de
-- qual chave vieram. Para apagá-las, use antes o "Desfazer" em Configurações →
-- Assistentes (MCP).
--
-- Escrita em produção: roda só com o sim do Giovani, numa transação única
-- (`psql -1`). Não mexe em _prisma_migrations.

DROP FUNCTION IF EXISTS public.pessoa_por_token_mcp(TEXT);
ALTER TABLE "demandas" DROP CONSTRAINT IF EXISTS "demandas_mcpTokenId_fkey";
DROP INDEX IF EXISTS "demandas_mcpTokenId_idx";
ALTER TABLE "demandas" DROP COLUMN IF EXISTS "mcpTokenId";
DROP TABLE IF EXISTS "tokens_mcp";

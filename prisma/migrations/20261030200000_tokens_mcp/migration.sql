-- Chave do assistente (MCP) por PESSOA (30/10/2026).
--
-- Até aqui o MCP só aceitava o token da empresa (organizacoes.relatorioToken),
-- o mesmo do link público do Relatório Executivo: ninguém sabia quem estava do
-- outro lado. Agora cada pessoa recebe a própria chave, gerada por um admin em
-- Configurações. O assistente age como ela: lê o que ela vê no NuFlow, cria
-- demanda pelas regras dela, e a Auditoria mostra o nome dela.
--
-- Guarda só o hash (sha256) da chave; a chave aparece uma vez, na hora de gerar.
-- Revogar = preencher revogadoEm. Não há DELETE: a chave revogada continua
-- dizendo de quem foram as demandas que criou.
--
-- `demandas.mcpTokenId` marca a demanda criada por uma chave. É o que permite
-- listar e desfazer "tudo o que veio pela API" de uma pessoa.
--
-- Aditiva: o código antigo não lê nenhuma das duas.
CREATE TABLE "tokens_mcp" (
  "id" TEXT NOT NULL,
  "organizacaoId" TEXT NOT NULL,
  "usuarioId" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "rotulo" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revogadoEm" TIMESTAMP(3),
  CONSTRAINT "tokens_mcp_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tokens_mcp_hash_key" ON "tokens_mcp"("hash");
CREATE INDEX "tokens_mcp_organizacaoId_idx" ON "tokens_mcp"("organizacaoId");
ALTER TABLE "tokens_mcp" ADD CONSTRAINT "tokens_mcp_organizacaoId_fkey"
  FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tokens_mcp" ADD CONSTRAINT "tokens_mcp_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "demandas" ADD COLUMN "mcpTokenId" TEXT;
CREATE INDEX "demandas_mcpTokenId_idx" ON "demandas"("mcpTokenId");
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_mcpTokenId_fkey"
  FOREIGN KEY ("mcpTokenId") REFERENCES "tokens_mcp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Isolada por empresa como as outras. Sem DELETE para ninguém da aplicação.
ALTER TABLE "tokens_mcp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tokens_mcp" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "tokens_mcp" FROM PUBLIC, app_auth, app_user;
GRANT SELECT, INSERT, UPDATE ON "tokens_mcp" TO app_user;
CREATE POLICY "tokens_mcp_org" ON "tokens_mcp" TO app_user
USING ("organizacaoId"=current_setting('app.org_id',true))
WITH CHECK ("organizacaoId"=current_setting('app.org_id',true));

-- A chave chega antes de haver empresa declarada (o mesmo problema de ordem do
-- login e de org_por_credencial). Esta função recebe o HASH e devolve só de
-- quem é a chave, se ela não foi revogada — sem abrir a tabela.
-- `search_path` fixo é obrigatório em SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.pessoa_por_token_mcp(p_hash TEXT)
RETURNS TABLE ("tokenId" TEXT, "organizacaoId" TEXT, "usuarioId" TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT t."id", t."organizacaoId", t."usuarioId"
    FROM tokens_mcp t
   WHERE p_hash IS NOT NULL AND length(p_hash) = 64
     AND t."hash" = p_hash AND t."revogadoEm" IS NULL
$$;
REVOKE ALL ON FUNCTION public.pessoa_por_token_mcp(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pessoa_por_token_mcp(TEXT) TO app_user;

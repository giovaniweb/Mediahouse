-- Formulário de interesse da landing (/comecar) e limite de tentativas que
-- sobrevive à Vercel.
--
-- Duas peças, as duas sem empresa de propósito:
--
-- 1. leads_comerciais — quem quer conhecer o NuFlow. Ainda não é cliente de
--    nenhuma empresa; é contato da plataforma. A rota pública só INSERE (sem
--    RETURNING, sem SELECT): um formulário aberto não pode virar leitura da lista.
--    Quem lê é o superadmin, pela conexão administrativa (prismaAdmin).
--
-- 2. limites_publicos — contagem de tentativas por chave e janela. O limite que
--    existia vivia na memória de cada instância serverless: com o tráfego
--    espalhado entre instâncias, cada uma via poucas tentativas e ninguém
--    barrava o spam. Aqui a contagem é no banco, e só uma função toca na tabela.

CREATE TABLE "leads_comerciais" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "telefone" TEXT NOT NULL,
  "empresa" TEXT NOT NULL,
  "mensagem" TEXT,
  "origem" TEXT,
  "campanha" TEXT,
  -- HMAC do IP com segredo do servidor: serve para contar tentativas, não
  -- identifica a pessoa (LGPD). Nunca o IP puro, nunca hash sem segredo.
  "ip_hash" TEXT,
  "consentimentoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "leads_comerciais_createdAt_idx" ON "leads_comerciais" ("createdAt");

ALTER TABLE "leads_comerciais" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_insert" ON "leads_comerciais" FOR INSERT WITH CHECK (true);
-- O ALTER DEFAULT PRIVILEGES da 20260826000000 dá SELECT/INSERT/UPDATE/DELETE a
-- app_user em toda tabela nova. Aqui o contrato é só INSERT: a RLS já
-- devolveria vazio, mas o GRANT também não deve prometer leitura.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON "leads_comerciais" FROM "app_user";
    GRANT INSERT ON "leads_comerciais" TO "app_user";
  END IF;
END $$;

CREATE TABLE "limites_publicos" (
  "chave" TEXT NOT NULL PRIMARY KEY,
  "janelaInicio" TIMESTAMP(3) NOT NULL,
  "contagem" INTEGER NOT NULL
);
CREATE INDEX "limites_publicos_janelaInicio_idx" ON "limites_publicos" ("janelaInicio");

-- RLS ligada e SEM política: ninguém lê nem escreve direto, nem a aplicação.
-- O único caminho é a função abaixo (ver "previstas" em scripts/verificar-rls.mjs).
ALTER TABLE "limites_publicos" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "limites_publicos" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON "limites_publicos" FROM "app_user";
  END IF;
END $$;

-- Devolve true enquanto a chave está dentro do teto na janela; false quando
-- passou. A janela vencida da própria chave é apagada a cada chamada, e de vez em
-- quando as vencidas de todas as chaves, para a tabela não crescer sem fim.
--
-- search_path fixo é obrigatório em SECURITY DEFINER (mesmo motivo de
-- org_por_credencial, 20260901120000): sem ele, quem chama poderia pôr uma
-- tabela falsa na frente e sequestrar a função.
CREATE OR REPLACE FUNCTION public.consumir_limite_publico(p_chave TEXT, p_max INTEGER, p_janela_seg INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contagem INTEGER;
BEGIN
  IF p_chave IS NULL OR length(p_chave) = 0 OR length(p_chave) > 200
     OR p_max IS NULL OR p_max < 1 OR p_janela_seg IS NULL OR p_janela_seg < 1 OR p_janela_seg > 86400 THEN
    RETURN false;
  END IF;

  DELETE FROM limites_publicos
   WHERE chave = p_chave AND "janelaInicio" < now() - make_interval(secs => p_janela_seg);

  IF random() < 0.02 THEN
    DELETE FROM limites_publicos WHERE "janelaInicio" < now() - interval '1 day';
  END IF;

  INSERT INTO limites_publicos (chave, "janelaInicio", contagem)
  VALUES (p_chave, now(), 1)
  ON CONFLICT (chave) DO UPDATE SET contagem = limites_publicos.contagem + 1
  RETURNING contagem INTO v_contagem;

  RETURN v_contagem <= p_max;
END;
$$;

-- Ninguém por padrão; só o role da aplicação.
REVOKE ALL ON FUNCTION public.consumir_limite_publico(TEXT, INTEGER, INTEGER) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT EXECUTE ON FUNCTION public.consumir_limite_publico(TEXT, INTEGER, INTEGER) TO "app_user";
  END IF;
END $$;

-- Trava: a função tem que estar amarrada ao search_path.
DO $$
DECLARE cfg TEXT[];
BEGIN
  SELECT proconfig INTO cfg FROM pg_proc WHERE proname = 'consumir_limite_publico';
  IF cfg IS NULL OR NOT ('search_path=public' = ANY (cfg)) THEN
    RAISE EXCEPTION 'Abortado: consumir_limite_publico sem search_path fixo.';
  END IF;
END $$;

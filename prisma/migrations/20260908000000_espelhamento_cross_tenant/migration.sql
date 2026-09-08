-- Espelhamento cross-tenant: uma empresa executa a demanda de outra.
--
-- O card NÃO muda de dono. `demandas.organizacaoId` continua sendo da empresa
-- que tem o contrato com o cliente, e o que nasce aqui é uma ARESTA dizendo
-- "esta demanda também é visível, e talvez operável, pela empresa X".
--
-- Duas camadas, e a ordem entre elas é a segurança inteira do recurso:
--
--   parceria_organizacao       o aperto de mão entre as duas empresas, com
--                              aceite dos dois lados. Sem ele, qualquer empresa
--                              da plataforma jogaria card no Kanban de qualquer
--                              outra.
--   demanda_compartilhamento   a aresta por demanda, que só nasce sob parceria
--                              aceita.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ESTA MIGRATION É INERTE ATÉ EXISTIR UMA ARESTA. Não há rota que crie uma
-- (isso é o PR 3), e os gatilhos só agem sobre linhas destas tabelas novas — com
-- a exceção documentada na seção 5, que sai pela porta imediatamente quando não
-- há espelho envolvido.
--
-- E ela precisa vir ANTES da Virada B. Ligar a RLS sem as políticas da seção 6
-- faria todo card espelhado sumir da tela do destino sem erro nenhum — e some
-- silenciosamente é o modo de falha que este projeto inteiro tenta evitar.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Os tipos ─────────────────────────────────────────────────────────────
CREATE TYPE "StatusParceria" AS ENUM ('pendente', 'aceita', 'recusada', 'encerrada');
CREATE TYPE "EscopoCompartilhamento" AS ENUM ('acompanhar', 'executar');

-- ── 2) As duas tabelas ──────────────────────────────────────────────────────
CREATE TABLE "parceria_organizacao" (
    "id" TEXT NOT NULL,
    "organizacaoConviteId" TEXT NOT NULL,
    "organizacaoConvidadaId" TEXT NOT NULL,
    "status" "StatusParceria" NOT NULL DEFAULT 'pendente',
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondidoPorId" TEXT,
    "respondidoEm" TIMESTAMP(3),
    "encerradaEm" TIMESTAMP(3),
    "encerradaPorId" TEXT,

    CONSTRAINT "parceria_organizacao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "demanda_compartilhamento" (
    "id" TEXT NOT NULL,
    "demandaId" TEXT NOT NULL,
    "organizacaoOrigemId" TEXT NOT NULL,
    "organizacaoDestinoId" TEXT NOT NULL,
    "nomeOrigem" TEXT NOT NULL,
    "nomeDestino" TEXT NOT NULL,
    "escopo" "EscopoCompartilhamento" NOT NULL DEFAULT 'executar',
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revogadoEm" TIMESTAMP(3),
    "revogadoPorId" TEXT,

    CONSTRAINT "demanda_compartilhamento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "parceria_organizacao_organizacaoConvidadaId_status_idx" ON "parceria_organizacao"("organizacaoConvidadaId", "status");
CREATE INDEX "parceria_organizacao_organizacaoConviteId_status_idx" ON "parceria_organizacao"("organizacaoConviteId", "status");
CREATE UNIQUE INDEX "parceria_organizacao_organizacaoConviteId_organizacaoConvid_key" ON "parceria_organizacao"("organizacaoConviteId", "organizacaoConvidadaId");
CREATE INDEX "demanda_compartilhamento_organizacaoDestinoId_revogadoEm_idx" ON "demanda_compartilhamento"("organizacaoDestinoId", "revogadoEm");
CREATE INDEX "demanda_compartilhamento_demandaId_idx" ON "demanda_compartilhamento"("demandaId");
CREATE UNIQUE INDEX "demanda_compartilhamento_demandaId_organizacaoDestinoId_key" ON "demanda_compartilhamento"("demandaId", "organizacaoDestinoId");

ALTER TABLE "parceria_organizacao" ADD CONSTRAINT "parceria_organizacao_organizacaoConviteId_fkey" FOREIGN KEY ("organizacaoConviteId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parceria_organizacao" ADD CONSTRAINT "parceria_organizacao_organizacaoConvidadaId_fkey" FOREIGN KEY ("organizacaoConvidadaId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demanda_compartilhamento" ADD CONSTRAINT "demanda_compartilhamento_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demanda_compartilhamento" ADD CONSTRAINT "demanda_compartilhamento_organizacaoOrigemId_fkey" FOREIGN KEY ("organizacaoOrigemId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demanda_compartilhamento" ADD CONSTRAINT "demanda_compartilhamento_organizacaoDestinoId_fkey" FOREIGN KEY ("organizacaoDestinoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- O `ALTER DEFAULT PRIVILEGES` da 20260826000000 já cobre tabela nova criada
-- pelo mesmo dono. O GRANT explícito fica assim mesmo: default privilege é uma
-- regra à distância, e uma tabela sem GRANT devolve "permission denied" no
-- primeiro acesso do cliente, não aqui.
GRANT SELECT, INSERT, UPDATE, DELETE ON "parceria_organizacao", "demanda_compartilhamento" TO "app_user";

-- ── 3) A parceria: quem convida não é quem aceita ───────────────────────────
--
-- Duas regras que a RLS não sabe expressar, porque as duas comparam o estado
-- ANTIGO com o novo — e `WITH CHECK` só enxerga a linha nova.
CREATE OR REPLACE FUNCTION nuflow_parceria_regras()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_atual TEXT := NULLIF(current_setting('app.org_id', true), '');
  par_a TEXT;
  par_b TEXT;
BEGIN
  IF NEW."organizacaoConviteId" = NEW."organizacaoConvidadaId" THEN
    RAISE EXCEPTION 'Uma empresa não faz parceria consigo mesma.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A simetria que o `@@unique` não enxerga: A→B e B→A são o MESMO par, e
    -- duas linhas aceitas para o mesmo par significariam dois estados de
    -- verdade. O lock ordena o par para que dois convites simultâneos em
    -- direções opostas não passem os dois — sem ele a checagem abaixo é uma
    -- corrida, e corrida em regra de acesso é falha de segurança, não de dado.
    par_a := LEAST(NEW."organizacaoConviteId", NEW."organizacaoConvidadaId");
    par_b := GREATEST(NEW."organizacaoConviteId", NEW."organizacaoConvidadaId");
    PERFORM pg_advisory_xact_lock(hashtext(par_a || '|' || par_b));

    IF EXISTS (
      SELECT 1 FROM parceria_organizacao p
      WHERE p."organizacaoConviteId" = NEW."organizacaoConvidadaId"
        AND p."organizacaoConvidadaId" = NEW."organizacaoConviteId"
    ) THEN
      RAISE EXCEPTION 'Já existe uma parceria entre estas duas empresas, no sentido inverso.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."organizacaoConviteId" IS DISTINCT FROM OLD."organizacaoConviteId"
       OR NEW."organizacaoConvidadaId" IS DISTINCT FROM OLD."organizacaoConvidadaId" THEN
      RAISE EXCEPTION 'As empresas de uma parceria não mudam. Encerre e crie outra.';
    END IF;

    -- Aceitar é ato de quem foi convidado. Sem isto, a empresa que convidou
    -- aceitaria o próprio convite e o aperto de mão viraria decoração.
    -- `org_atual` nulo = RLS desligada, conexão de dono, migration ou script:
    -- ali não há "quem age" para conferir, e a regra fica com a aplicação.
    IF org_atual IS NOT NULL
       AND NEW.status = 'aceita' AND OLD.status IS DISTINCT FROM 'aceita'
       AND org_atual <> OLD."organizacaoConvidadaId" THEN
      RAISE EXCEPTION 'Só a empresa convidada aceita a parceria.';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER parceria_regras
  BEFORE INSERT OR UPDATE ON "parceria_organizacao"
  FOR EACH ROW EXECUTE FUNCTION nuflow_parceria_regras();

-- ── 4) A aresta: origem derivada, nunca digitada ────────────────────────────
--
-- `organizacaoOrigemId` é denormalizado de `demandas`, contra a regra da Fase 2,
-- e a exceção é obrigatória: a política de `demandas` (seção 6) consulta ESTA
-- tabela. Se esta consultasse `demandas` de volta para descobrir a origem, o
-- Postgres entraria em recursão de política. A aresta tem que ser legível sem
-- ler o vértice.
--
-- O preço dessa denormalização é o risco de a coluna discordar do pai. É este
-- gatilho que paga: a origem e os rótulos não são campos que a aplicação
-- escreve, são campos que o banco deriva. SECURITY DEFINER para que a leitura da
-- demanda não dependa da RLS de quem está inserindo.
CREATE OR REPLACE FUNCTION nuflow_compartilhamento_derivar_origem()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_dona TEXT;
  nome_dona TEXT;
  nome_dest TEXT;
BEGIN
  SELECT d."organizacaoId" INTO org_dona FROM demandas d WHERE d.id = NEW."demandaId";
  IF org_dona IS NULL THEN
    RAISE EXCEPTION 'Demanda % não existe.', NEW."demandaId";
  END IF;
  IF org_dona = NEW."organizacaoDestinoId" THEN
    RAISE EXCEPTION 'Compartilhar uma demanda com a própria dona não faz sentido.';
  END IF;

  -- O aperto de mão é pré-requisito, e ele é conferido AQUI e não só na rota:
  -- a rota é uma porta, o gatilho é a parede.
  IF NOT EXISTS (
    SELECT 1 FROM parceria_organizacao p
    WHERE p.status = 'aceita'
      AND p."encerradaEm" IS NULL
      AND ((p."organizacaoConviteId" = org_dona AND p."organizacaoConvidadaId" = NEW."organizacaoDestinoId")
        OR (p."organizacaoConvidadaId" = org_dona AND p."organizacaoConviteId" = NEW."organizacaoDestinoId"))
  ) THEN
    RAISE EXCEPTION 'Não há parceria aceita entre estas empresas. O compartilhamento exige o aceite dos dois lados.';
  END IF;

  SELECT o.nome INTO nome_dona FROM organizacoes o WHERE o.id = org_dona;
  SELECT o.nome INTO nome_dest FROM organizacoes o WHERE o.id = NEW."organizacaoDestinoId";
  IF nome_dest IS NULL THEN
    RAISE EXCEPTION 'Organização de destino % não existe.', NEW."organizacaoDestinoId";
  END IF;

  NEW."organizacaoOrigemId" := org_dona;
  NEW."nomeOrigem"  := nome_dona;
  NEW."nomeDestino" := nome_dest;

  IF TG_OP = 'UPDATE' AND NEW."demandaId" IS DISTINCT FROM OLD."demandaId" THEN
    RAISE EXCEPTION 'Um compartilhamento não muda de demanda. Revogue e crie outro.';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER compartilhamento_derivar_origem
  BEFORE INSERT OR UPDATE ON "demanda_compartilhamento"
  FOR EACH ROW EXECUTE FUNCTION nuflow_compartilhamento_derivar_origem();

-- ── 5) A pergunta que a RLS não responde: QUAIS COLUNAS ─────────────────────
--
-- `WITH CHECK` enxerga a linha nova, nunca a antiga, então não há como escrever
-- em política "o destino muda o status mas não o prazo". E `GRANT UPDATE(coluna)`
-- não serve: `app_user` é um role só, a restrição valeria também para a dona.
--
-- Então a coluna é decidida aqui. E a lista é de PERMITIDAS, com todo o resto
-- voltando ao valor anterior — não de proibidas. A diferença importa: coluna
-- nova em `demandas` nasce IMUTÁVEL para o espelho, sem ninguém precisar
-- lembrar de atualizar este arquivo. Falha fechada, e sem teste de deriva para
-- alguém ignorar depois.
--
-- Restaura em silêncio em vez de levantar exceção: o PATCH da tela manda o
-- objeto inteiro, e recusar por causa de um campo que ninguém tocou quebraria o
-- card do destino por completo. O que o destino não pode mudar, a tela dele não
-- oferece (PR 4); isto aqui é a rede embaixo.
CREATE OR REPLACE FUNCTION nuflow_espelho_colunas_permitidas()
RETURNS TRIGGER
LANGUAGE plpgsql
-- Sem SECURITY DEFINER: esta função não consulta tabela nenhuma, só compara
-- OLD com NEW. Elevar privilégio sem precisar é dívida de segurança de graça.
-- As outras duas precisam — a de origem, por exemplo, lê o NOME da empresa de
-- destino, que `organizacoes_a_propria` esconde justamente de quem a insere.
SET search_path = public
AS $$
DECLARE
  org_atual TEXT := NULLIF(current_setting('app.org_id', true), '');
  permitidas TEXT[] := ARRAY[
    'statusInterno', 'statusVisivel', 'posicaoKanban',
    'videomakerId', 'editorId',
    'dataCaptacao', 'localGravacao',
    'linkBrutos', 'linkFolderBrutos', 'linkFinal', 'linkFolderFinal',
    'motivoImpedimento', 'thumbnailUrl',
    'updatedAt'
  ];
BEGIN
  -- Sem empresa declarada (RLS desligada, conexão de dono, migration, script):
  -- não há espelho para limitar.
  IF org_atual IS NULL THEN RETURN NEW; END IF;
  -- Quem age é a dona do card: nada a limitar.
  IF OLD."organizacaoId" = org_atual THEN RETURN NEW; END IF;

  -- Daqui para baixo, quem age é um espelho. A posse nunca se move.
  IF NEW."organizacaoId" IS DISTINCT FROM OLD."organizacaoId" THEN
    RAISE EXCEPTION 'Espelhamento não transfere a posse da demanda.';
  END IF;

  -- NEW, com todas as colunas fora da lista branca forçadas de volta ao OLD.
  NEW := jsonb_populate_record(NEW, to_jsonb(OLD) - permitidas);
  RETURN NEW;
END $$;

CREATE TRIGGER demandas_espelho_colunas
  BEFORE UPDATE ON "demandas"
  FOR EACH ROW EXECUTE FUNCTION nuflow_espelho_colunas_permitidas();

-- ── 6) RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE "parceria_organizacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "demanda_compartilhamento" ENABLE ROW LEVEL SECURITY;

-- A parceria é visível para os dois lados — senão a convidada não vê o convite.
CREATE POLICY "parceria_leitura_dos_dois_lados" ON "parceria_organizacao"
  FOR SELECT TO "app_user"
  USING ("organizacaoConviteId"   = current_setting('app.org_id', true)
      OR "organizacaoConvidadaId" = current_setting('app.org_id', true));

-- Convidar é ato de quem convida.
CREATE POLICY "parceria_convite_da_convidante" ON "parceria_organizacao"
  FOR INSERT TO "app_user"
  WITH CHECK ("organizacaoConviteId" = current_setting('app.org_id', true));

-- Responder e encerrar: os dois lados podem. QUAL transição cada um pode fazer
-- é a seção 3 — a política diz quais LINHAS, o gatilho diz quais MUDANÇAS.
CREATE POLICY "parceria_resposta_dos_dois_lados" ON "parceria_organizacao"
  FOR UPDATE TO "app_user"
  USING ("organizacaoConviteId"   = current_setting('app.org_id', true)
      OR "organizacaoConvidadaId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoConviteId"   = current_setting('app.org_id', true)
           OR "organizacaoConvidadaId" = current_setting('app.org_id', true));

-- Sem política de DELETE, de propósito: parceria encerrada vira `encerrada`,
-- não desaparece. A prova de que o acesso existiu é o que uma auditoria pede.

-- ── A aresta: ler dos dois lados, escrever só da origem ─────────────────────
--
-- Esta assimetria é a segurança do recurso. Se as duas regras vivessem numa
-- política `FOR ALL` com o mesmo OR, o destino apagaria a própria restrição —
-- ou inseriria uma aresta apontando qualquer demanda para si mesmo.
CREATE POLICY "compartilhamento_leitura_dos_dois_lados" ON "demanda_compartilhamento"
  FOR SELECT TO "app_user"
  USING ("organizacaoOrigemId"  = current_setting('app.org_id', true)
      OR "organizacaoDestinoId" = current_setting('app.org_id', true));

CREATE POLICY "compartilhamento_escrita_da_origem" ON "demanda_compartilhamento"
  FOR ALL TO "app_user"
  USING      ("organizacaoOrigemId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoOrigemId" = current_setting('app.org_id', true));

-- ── `demandas`: uma política A MAIS, nunca a existente editada ──────────────
--
-- `demandas_por_org` fica intacta — é ela que o verificar-rls.mjs já prova, e
-- somando em vez de editar o `pg_policies` continua dizendo se a linha saiu por
-- posse ou por espelho.
--
-- Não há política de DELETE para o espelho: excluir o card é da dona, sempre.
CREATE POLICY "demandas_espelhadas_leitura" ON "demandas"
  FOR SELECT TO "app_user"
  USING (EXISTS (
    SELECT 1 FROM "demanda_compartilhamento" c
    WHERE c."demandaId" = "demandas"."id"
      AND c."organizacaoDestinoId" = current_setting('app.org_id', true)
      AND c."revogadoEm" IS NULL));

CREATE POLICY "demandas_espelhadas_execucao" ON "demandas"
  FOR UPDATE TO "app_user"
  USING (EXISTS (
    SELECT 1 FROM "demanda_compartilhamento" c
    WHERE c."demandaId" = "demandas"."id"
      AND c."organizacaoDestinoId" = current_setting('app.org_id', true)
      AND c."revogadoEm" IS NULL
      AND c."escopo" = 'executar'))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "demanda_compartilhamento" c
    WHERE c."demandaId" = "demandas"."id"
      AND c."organizacaoDestinoId" = current_setting('app.org_id', true)
      AND c."revogadoEm" IS NULL
      AND c."escopo" = 'executar'));

-- ── Tabelas filhas: cada uma é uma decisão ──────────────────────────────────
--
-- As políticas filhas perguntam ao pai com `p."organizacaoId" = app.org_id`, e
-- estender `demandas` NÃO as estende. É bom que seja assim: é aqui que se separa
-- "operar o job" de "ver a operação da outra empresa".
--
-- ATRAVESSAM: historico_status (mover o card grava aqui), comentarios (é o canal
-- entre as duas equipes), arquivos (brutos e entrega), checklist_itens (a lista
-- de execução).
--
-- NÃO ATRAVESSAM, e a ausência é a decisão: aprovacoes_video (aprovar é do
-- cliente da origem — §24 do documento de Jobs), custos_videomaker (o cache é
-- negociado pela origem), notas_fiscais (dado fiscal de terceiro),
-- demanda_produto (catálogo comercial), convites_videomaker (o destino usa a
-- rede dele), alertas_ia / mensagens_whatsapp / logs_automacao (operação interna
-- da origem, e o WhatsApp carrega a conversa com o cliente final).
CREATE POLICY "historico_status_espelhado" ON "historico_status"
  FOR SELECT TO "app_user"
  USING (EXISTS (SELECT 1 FROM "demanda_compartilhamento" c
                 WHERE c."demandaId" = "historico_status"."demandaId"
                   AND c."organizacaoDestinoId" = current_setting('app.org_id', true)
                   AND c."revogadoEm" IS NULL));
CREATE POLICY "historico_status_espelhado_escrita" ON "historico_status"
  FOR INSERT TO "app_user"
  WITH CHECK (EXISTS (SELECT 1 FROM "demanda_compartilhamento" c
                 WHERE c."demandaId" = "historico_status"."demandaId"
                   AND c."organizacaoDestinoId" = current_setting('app.org_id', true)
                   AND c."revogadoEm" IS NULL
                   AND c."escopo" = 'executar'));

CREATE POLICY "comentarios_espelhado" ON "comentarios"
  FOR SELECT TO "app_user"
  USING (EXISTS (SELECT 1 FROM "demanda_compartilhamento" c
                 WHERE c."demandaId" = "comentarios"."demandaId"
                   AND c."organizacaoDestinoId" = current_setting('app.org_id', true)
                   AND c."revogadoEm" IS NULL));
CREATE POLICY "comentarios_espelhado_escrita" ON "comentarios"
  FOR INSERT TO "app_user"
  WITH CHECK (EXISTS (SELECT 1 FROM "demanda_compartilhamento" c
                 WHERE c."demandaId" = "comentarios"."demandaId"
                   AND c."organizacaoDestinoId" = current_setting('app.org_id', true)
                   AND c."revogadoEm" IS NULL
                   AND c."escopo" = 'executar'));

-- Sem DELETE: o destino envia material, não apaga o da origem.
CREATE POLICY "arquivos_espelhado" ON "arquivos"
  FOR SELECT TO "app_user"
  USING (EXISTS (SELECT 1 FROM "demanda_compartilhamento" c
                 WHERE c."demandaId" = "arquivos"."demandaId"
                   AND c."organizacaoDestinoId" = current_setting('app.org_id', true)
                   AND c."revogadoEm" IS NULL));
CREATE POLICY "arquivos_espelhado_escrita" ON "arquivos"
  FOR INSERT TO "app_user"
  WITH CHECK (EXISTS (SELECT 1 FROM "demanda_compartilhamento" c
                 WHERE c."demandaId" = "arquivos"."demandaId"
                   AND c."organizacaoDestinoId" = current_setting('app.org_id', true)
                   AND c."revogadoEm" IS NULL
                   AND c."escopo" = 'executar'));

CREATE POLICY "checklist_itens_espelhado" ON "checklist_itens"
  FOR SELECT TO "app_user"
  USING (EXISTS (SELECT 1 FROM "demanda_compartilhamento" c
                 WHERE c."demandaId" = "checklist_itens"."demandaId"
                   AND c."organizacaoDestinoId" = current_setting('app.org_id', true)
                   AND c."revogadoEm" IS NULL));
CREATE POLICY "checklist_itens_espelhado_marcar" ON "checklist_itens"
  FOR UPDATE TO "app_user"
  USING (EXISTS (SELECT 1 FROM "demanda_compartilhamento" c
                 WHERE c."demandaId" = "checklist_itens"."demandaId"
                   AND c."organizacaoDestinoId" = current_setting('app.org_id', true)
                   AND c."revogadoEm" IS NULL
                   AND c."escopo" = 'executar'))
  WITH CHECK (EXISTS (SELECT 1 FROM "demanda_compartilhamento" c
                 WHERE c."demandaId" = "checklist_itens"."demandaId"
                   AND c."organizacaoDestinoId" = current_setting('app.org_id', true)
                   AND c."revogadoEm" IS NULL
                   AND c."escopo" = 'executar'));

-- ── 7) TRAVA DE SAÍDA ───────────────────────────────────────────────────────
--
-- Mesma disciplina das migrations anteriores: a transação aborta se o estado
-- final não for exatamente o previsto. Migration que aborta é mais barata que
-- migration que passa pela metade.
DO $$
DECLARE
  faltando TEXT;
  n INT;
BEGIN
  -- As duas tabelas novas precisam de RLS. Sem isso, `verificar-rls.mjs` falha
  -- no CI (e com razão): tabela de negócio fora da RLS é decisão não tomada.
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO faltando
  FROM pg_class c JOIN pg_namespace n2 ON n2.oid = c.relnamespace
  WHERE n2.nspname = 'public'
    AND c.relname IN ('parceria_organizacao', 'demanda_compartilhamento')
    AND NOT c.relrowsecurity;
  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Abortado: tabela nova sem RLS: %.', faltando;
  END IF;

  -- A política antiga tem que continuar de pé. Se alguém um dia trocar
  -- "somar política" por "editar a existente", é aqui que se descobre.
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'demandas_por_org') THEN
    RAISE EXCEPTION 'Abortado: `demandas_por_org` sumiu. O espelho SOMA política, nunca substitui.';
  END IF;

  -- Os três gatilhos existem? Eles são as três regras que a RLS não sabe dizer.
  SELECT count(*) INTO n FROM pg_trigger
  WHERE NOT tgisinternal
    AND tgname IN ('parceria_regras', 'compartilhamento_derivar_origem', 'demandas_espelho_colunas');
  IF n <> 3 THEN
    RAISE EXCEPTION 'Abortado: esperava 3 gatilhos do espelhamento, encontrei %.', n;
  END IF;

  -- E as políticas novas, uma a uma. Contagem cega esconderia a que faltou.
  FOR faltando IN
    SELECT x FROM unnest(ARRAY[
      'parceria_leitura_dos_dois_lados', 'parceria_convite_da_convidante',
      'parceria_resposta_dos_dois_lados',
      'compartilhamento_leitura_dos_dois_lados', 'compartilhamento_escrita_da_origem',
      'demandas_espelhadas_leitura', 'demandas_espelhadas_execucao',
      'historico_status_espelhado', 'historico_status_espelhado_escrita',
      'comentarios_espelhado', 'comentarios_espelhado_escrita',
      'arquivos_espelhado', 'arquivos_espelhado_escrita',
      'checklist_itens_espelhado', 'checklist_itens_espelhado_marcar'
    ]) x
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = faltando) THEN
      RAISE EXCEPTION 'Abortado: política % não foi criada.', faltando;
    END IF;
  END LOOP;
END $$;

-- Fundação do isolamento: o banco passa a saber o que é uma empresa.
--
-- Até aqui o isolamento existia só no código. `organizacaoId` era TEXT nulável e,
-- em 18 das 19 tabelas, sem chave estrangeira nenhuma — o banco aceitaria um id
-- inventado, uma string vazia ou NULL sem reclamar. Toda a garantia estava em
-- lembrar de escrever `where: { organizacaoId }` em cada consulta. As Fases 1
-- deste trabalho fecharam 26 rotas onde alguém tinha esquecido.
--
-- Esta migration muda a natureza da garantia: NOT NULL para o dado não nascer
-- órfão, FOREIGN KEY para o dono existir de verdade, e índice em toda coluna de
-- empresa — porque na Fase 3 cada política de RLS vai filtrar por ela.
--
-- Medido antes de escrever qualquer DDL (scripts/checar-fundacao.mjs):
-- zero nulos e zero órfãos nas 19 tabelas. As travas entram sobre dado limpo.
--
-- ATENÇÃO — ordem de release: esta é uma migration de EXPANSÃO. Colunas novas
-- nascem NULÁVEIS e nenhuma coluna é apagada, então o código que já está no ar
-- continua funcionando com o schema novo. Aplique a migration ANTES do deploy.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) TRAVA DE ENTRADA
--
-- Um SET NOT NULL sobre uma linha nula falha, e uma FK sobre uma linha órfã
-- falha. Falhar no meio de uma migration de produção é como se descobre que
-- ninguém mediu antes. Aqui a transação inteira aborta antes de tocar em nada.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  n INT;
  tabelas TEXT[] := ARRAY[
    'demandas','alertas_ia','config_whatsapp','mensagens_whatsapp','contatos_whatsapp',
    'mapa_lid_whatsapp','eventos','custos_videomaker','relatorios_ia','config_email',
    'config_parametros','fabricantes','produtos','ideias_video','config_empresa',
    'coberturas','eventos_gestao','fornecedores','producao_manual'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE "organizacaoId" IS NULL', t) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'Abortado: %.organizacaoId tem % linha(s) NULA(s). O NOT NULL falharia — rode o backfill antes.', t, n;
    END IF;

    EXECUTE format(
      'SELECT count(*) FROM %I x WHERE x."organizacaoId" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM organizacoes o WHERE o.id = x."organizacaoId")', t
    ) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'Abortado: %.organizacaoId tem % linha(s) apontando para empresa inexistente. A FK falharia.', t, n;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Cinco tabelas ganham dono
--
-- São as que sobraram da Fase 1 sem ter como escopar: a rota até queria filtrar
-- por empresa, mas não havia coluna. Nascem NULÁVEIS de propósito — o código que
-- as preenche entra no mesmo PR, e só depois disso o NOT NULL faz sentido.
--
--   depoimentos            a vitrine pública mostrava o depoimento de uma empresa no site das outras
--   checklist_templates    template criado por uma empresa aparecia para todas
--   config_trello          credencial de board sem dono (hoje 0 linhas; a integração roda por env)
--   avaliacoes_videomaker  a NOTA é global de propósito — é a reputação na rede.
--   avaliacoes_editor      o COMENTÁRIO não: é observação interna de quem contratou.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "depoimentos" ADD COLUMN "organizacaoId" TEXT;
ALTER TABLE "checklist_templates" ADD COLUMN "organizacaoId" TEXT;
ALTER TABLE "config_trello" ADD COLUMN "organizacaoId" TEXT;
ALTER TABLE "avaliacoes_videomaker" ADD COLUMN "organizacaoId" TEXT;
ALTER TABLE "avaliacoes_editor" ADD COLUMN "organizacaoId" TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Backfill do que já existe
-- ─────────────────────────────────────────────────────────────────────────────

-- Avaliação amarrada a uma demanda herda o dono da demanda: quem contratou é
-- quem avaliou. Avaliação por QR público não tem demanda e fica sem dono — é o
-- cliente final falando do profissional, e isso pertence à rede, não a uma
-- empresa. É por isso que a coluna é nulável e vai continuar sendo.
UPDATE "avaliacoes_videomaker" a
SET "organizacaoId" = d."organizacaoId"
FROM "demandas" d
WHERE a."demandaId" = d.id AND a."organizacaoId" IS NULL;

UPDATE "avaliacoes_editor" a
SET "organizacaoId" = d."organizacaoId"
FROM "demandas" d
WHERE a."demandaId" = d.id AND a."organizacaoId" IS NULL;

-- Depoimento é anterior à multiempresa: os que existem são de quem usava o
-- sistema quando ele tinha um cliente só. O dono é a organização mais antiga da
-- instalação — não "contourline" cravado, para a migration valer em qualquer
-- banco. Instalação nova não tem depoimento e não tem o que fazer aqui.
UPDATE "depoimentos"
SET "organizacaoId" = (SELECT id FROM "organizacoes" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "organizacaoId" IS NULL
  AND EXISTS (SELECT 1 FROM "organizacoes");

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Chaves estrangeiras: o dono passa a precisar existir
--
-- 18 das 19 tabelas guardavam `organizacaoId` como TEXT solto. Um id inventado,
-- um id de empresa já apagada ou uma string vazia entravam sem reclamação — e
-- ficavam invisíveis para sempre, porque nenhuma consulta com escopo acharia.
-- Só `fabricantes` tinha FK, do PR do catálogo.
--
-- ON DELETE CASCADE em todas: apagar uma empresa apaga o que é dela. É o
-- comportamento que as tabelas de vínculo já usavam.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alertas_ia" ADD CONSTRAINT "alertas_ia_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "config_whatsapp" ADD CONSTRAINT "config_whatsapp_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contatos_whatsapp" ADD CONSTRAINT "contatos_whatsapp_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mapa_lid_whatsapp" ADD CONSTRAINT "mapa_lid_whatsapp_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "custos_videomaker" ADD CONSTRAINT "custos_videomaker_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "relatorios_ia" ADD CONSTRAINT "relatorios_ia_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "config_email" ADD CONSTRAINT "config_email_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "avaliacoes_videomaker" ADD CONSTRAINT "avaliacoes_videomaker_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "avaliacoes_editor" ADD CONSTRAINT "avaliacoes_editor_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "config_parametros" ADD CONSTRAINT "config_parametros_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ideias_video" ADD CONSTRAINT "ideias_video_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "config_trello" ADD CONSTRAINT "config_trello_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "config_empresa" ADD CONSTRAINT "config_empresa_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "depoimentos" ADD CONSTRAINT "depoimentos_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coberturas" ADD CONSTRAINT "coberturas_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eventos_gestao" ADD CONSTRAINT "eventos_gestao_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "producao_manual" ADD CONSTRAINT "producao_manual_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Índice em toda coluna de empresa
--
-- FK no Postgres não cria índice. E na Fase 3 cada política de RLS vai começar
-- por `organizacaoId = ...`: sem índice, cada leitura vira varredura de tabela.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX "checklist_templates_organizacaoId_idx" ON "checklist_templates"("organizacaoId");
CREATE INDEX "relatorios_ia_organizacaoId_idx" ON "relatorios_ia"("organizacaoId");
CREATE INDEX "config_email_organizacaoId_idx" ON "config_email"("organizacaoId");
CREATE INDEX "avaliacoes_videomaker_organizacaoId_idx" ON "avaliacoes_videomaker"("organizacaoId");
CREATE INDEX "avaliacoes_editor_organizacaoId_idx" ON "avaliacoes_editor"("organizacaoId");
CREATE INDEX "produtos_organizacaoId_idx" ON "produtos"("organizacaoId");
CREATE INDEX "config_trello_organizacaoId_idx" ON "config_trello"("organizacaoId");
CREATE INDEX "config_empresa_organizacaoId_idx" ON "config_empresa"("organizacaoId");
CREATE INDEX "depoimentos_organizacaoId_idx" ON "depoimentos"("organizacaoId");
CREATE INDEX "fornecedores_organizacaoId_idx" ON "fornecedores"("organizacaoId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) NOT NULL: a coluna deixa de ser opcional
--
-- Por último, depois de FK e índice, para que uma falha aqui aborte a transação
-- com o banco ainda coerente. Dado sem empresa não é dado "de todo mundo" — é
-- dado que some do sistema, porque toda consulta com escopo o exclui.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "demandas" ALTER COLUMN "organizacaoId" SET NOT NULL;
ALTER TABLE "alertas_ia" ALTER COLUMN "organizacaoId" SET NOT NULL;
ALTER TABLE "config_whatsapp" ALTER COLUMN "organizacaoId" SET NOT NULL;
ALTER TABLE "mensagens_whatsapp" ALTER COLUMN "organizacaoId" SET NOT NULL;
ALTER TABLE "contatos_whatsapp" ALTER COLUMN "organizacaoId" SET NOT NULL;
ALTER TABLE "mapa_lid_whatsapp" ALTER COLUMN "organizacaoId" SET NOT NULL;
ALTER TABLE "eventos" ALTER COLUMN "organizacaoId" SET NOT NULL;
ALTER TABLE "custos_videomaker" ALTER COLUMN "organizacaoId" SET NOT NULL;
ALTER TABLE "relatorios_ia" ALTER COLUMN "organizacaoId" SET NOT NULL;
ALTER TABLE "config_email" ALTER COLUMN "organizacaoId" SET NOT NULL;
ALTER TABLE "config_parametros" ALTER COLUMN "organizacaoId" SET NOT NULL;
ALTER TABLE "fabricantes" ALTER COLUMN "organizacaoId" SET NOT NULL;
ALTER TABLE "produtos" ALTER COLUMN "organizacaoId" SET NOT NULL;
ALTER TABLE "ideias_video" ALTER COLUMN "organizacaoId" SET NOT NULL;
ALTER TABLE "config_empresa" ALTER COLUMN "organizacaoId" SET NOT NULL;
ALTER TABLE "coberturas" ALTER COLUMN "organizacaoId" SET NOT NULL;
ALTER TABLE "eventos_gestao" ALTER COLUMN "organizacaoId" SET NOT NULL;
ALTER TABLE "fornecedores" ALTER COLUMN "organizacaoId" SET NOT NULL;
ALTER TABLE "producao_manual" ALTER COLUMN "organizacaoId" SET NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) TRAVA DE SAÍDA
--
-- Confere o que a migration prometeu: as 19 colunas NOT NULL e com FK. Se
-- alguma escapou, a transação inteira volta atrás — melhor não migrar do que
-- migrar pela metade e descobrir depois.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  n INT;
  tabelas TEXT[] := ARRAY[
    'demandas','alertas_ia','config_whatsapp','mensagens_whatsapp','contatos_whatsapp',
    'mapa_lid_whatsapp','eventos','custos_videomaker','relatorios_ia','config_email',
    'config_parametros','fabricantes','produtos','ideias_video','config_empresa',
    'coberturas','eventos_gestao','fornecedores','producao_manual'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    SELECT count(*) INTO n
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = t
      AND column_name = 'organizacaoId' AND is_nullable = 'NO';
    IF n <> 1 THEN
      RAISE EXCEPTION 'Abortado: %.organizacaoId continua nulável.', t;
    END IF;

    SELECT count(*) INTO n
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = t
      AND kcu.column_name = 'organizacaoId' AND ccu.table_name = 'organizacoes';
    IF n < 1 THEN
      RAISE EXCEPTION 'Abortado: % ficou sem chave estrangeira para organizacoes.', t;
    END IF;
  END LOOP;
END $$;

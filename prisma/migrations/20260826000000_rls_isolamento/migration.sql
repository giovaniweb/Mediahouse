-- RLS: a tranca final do isolamento.
--
-- Até aqui o isolamento tinha duas camadas. O CÓDIGO escreve `where organizacaoId`
-- em toda consulta (Fase 1, 26 rotas corrigidas), e o BANCO garante que a coluna
-- existe, não é nula e aponta para uma empresa de verdade (Fase 2). Falta a
-- terceira: hoje, se uma consulta nova esquecer o `where`, o banco entrega tudo.
-- O auditor estático pega o caso óbvio; não pega o filtro montado em runtime.
--
-- Row Level Security move a decisão para dentro do Postgres. A conexão declara
-- em qual empresa está, por transação, e o banco recusa devolver linha de outra —
-- mesmo que a consulta peça.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ESTA MIGRATION NÃO MUDA NADA EM PRODUÇÃO HOJE. Leia antes de se preocupar.
--
-- A aplicação conecta como `postgres`, e `postgres` tem rolbypassrls = true:
-- ignora RLS por definição, políticas e tudo. Habilitar RLS aqui é montar a
-- fechadura na porta sem trocar a chave de ninguém.
--
-- O que LIGA de fato é trocar a DATABASE_URL para o role `app_user`, num
-- `vercel env` + redeploy — reversível em um comando. E isso só acontece depois
-- do plano de voo (ver RLS-PLANO-DE-VOO.md).
--
-- Os roles nascem NOLOGIN de propósito: senha não entra em repositório. Conceder
-- LOGIN e definir a senha é passo manual, documentado no plano de voo.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) agente_execucoes ganha dono ──────────────────────────────────────────
--
-- 523 linhas, todas de cron, todas com `criadoPor` nulo — não há de onde inferir
-- o dono das antigas, e elas ficam sem. O que importa é daqui pra frente: cada
-- rota de agente já sabe a empresa, e passa a gravá-la. Sob RLS, linha sem dono
-- é invisível para a aplicação e visível só para quem administra o banco, que é
-- o comportamento certo para log histórico.
ALTER TABLE "agente_execucoes" ADD COLUMN "organizacaoId" TEXT;
ALTER TABLE "agente_execucoes" ADD CONSTRAINT "agente_execucoes_organizacaoId_fkey"
  FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "agente_execucoes_organizacaoId_idx" ON "agente_execucoes"("organizacaoId");

-- ── 2) Os dois roles ────────────────────────────────────────────────────────
--
-- `app_user`  é quem a aplicação vira. Sem BYPASSRLS, sem ser dono de tabela
--             nenhuma: as políticas abaixo valem para ele.
--
-- `app_auth`  existe por um problema de ordem: o login precisa LER `usuarios`
--             para conferir a senha, e nesse instante ainda não há empresa —
--             ela só é conhecida DEPOIS de saber quem é a pessoa. Um role com
--             RLS ligada em `usuarios` não conseguiria autenticar ninguém.
--             Então o caminho de autenticação tem um role próprio, com permissão
--             para ler exatamente duas tabelas e nada mais.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE "app_user" NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_auth') THEN
    CREATE ROLE "app_auth" NOLOGIN;
  END IF;
END $$;

-- Nenhum dos dois pode criar tabela, e nenhum herda privilégio de dono.
GRANT USAGE ON SCHEMA "public" TO "app_user", "app_auth";
REVOKE CREATE ON SCHEMA "public" FROM "app_user", "app_auth";

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO "app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "public" TO "app_user";

-- Tabela criada no futuro nasce acessível para a aplicação — senão a próxima
-- migration quebra em produção com "permission denied" e ninguém entende por quê.
-- O acesso continua mediado pelas políticas: sem política, GRANT não devolve linha.
ALTER DEFAULT PRIVILEGES IN SCHEMA "public"
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA "public"
  GRANT USAGE, SELECT ON SEQUENCES TO "app_user";

-- O caminho de resolução lê três tabelas, só leitura. São as que respondem
-- "quem é você e em qual empresa você está" — a pergunta que precede o filtro
-- por empresa e por isso não pode depender dele.
GRANT SELECT ON "usuarios", "usuario_organizacao", "organizacoes" TO "app_auth";
-- Recuperação de senha precisa escrever o token e marcá-lo como usado.
GRANT SELECT, INSERT, UPDATE ON "password_reset_tokens" TO "app_auth";


-- ── 3) Ligar RLS ────────────────────────────────────────────────────────────
--
-- Sem FORCE: o dono da tabela (postgres) continua passando direto, que é o que
-- mantém esta migration inerte e o que permite administrar o banco. FORCE entra
-- depois da virada, quando ninguém mais conectar como dono em runtime.
--
-- Regra que vale para todas: RLS LIGADA E SEM POLÍTICA = NEGA TUDO. É o padrão
-- que se quer — tabela nova sem política não vaza, ela some.
ALTER TABLE "agente_execucoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "alertas_ia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "aprovacoes_video" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "arquivos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "avaliacoes_editor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "avaliacoes_videomaker" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_ia_mensagens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checklist_itens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checklist_template_itens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checklist_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coberturas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coberturas_album" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coberturas_checklist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coberturas_equipe" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coberturas_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coberturas_uploads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comentarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "config_email" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "config_email_entrada" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "config_empresa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "config_parametros" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "config_trello" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "config_whatsapp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contatos_whatsapp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "convites_videomaker" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custos_evento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custos_videomaker" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "demanda_produto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "demanda_responsavel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "demandas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "depoimentos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "designer_dados_fiscais" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "designer_organizacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "designers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "editor_dados_fiscais" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "editor_organizacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "editores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "emails_entrada" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evento_face_descriptors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eventos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eventos_gestao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eventos_gestao_aprovacoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eventos_gestao_checklist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eventos_gestao_documentos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "eventos_gestao_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fabricantes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fornecedores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "historico_status" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ideias_video" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "linhas_projeto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "logs_automacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mapa_lid_whatsapp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mensagens_whatsapp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "modulo_organizacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notas_fiscais" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizacoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permissoes_usuario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "producao_manual" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "produtos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "produtos_servico_evento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "relatorios_ia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usuario_organizacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usuarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "videomaker_dados_fiscais" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "videomaker_organizacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "videomakers" ENABLE ROW LEVEL SECURITY;

-- ── 4) Políticas: a empresa vem da transação ────────────────────────────────
--
-- `current_setting('app.org_id', true)` devolve NULL quando ninguém definiu.
-- Comparar com NULL dá NULL, que não é verdadeiro: a consulta não retorna nada.
-- Falha FECHADO. Uma rota que esquecer de declarar a empresa devolve lista
-- vazia — chato de descobrir, impossível de vazar. É a troca certa.
--
-- WITH CHECK repete o USING: sem ele, dava para INSERIR na empresa dos outros
-- (não veria depois, mas o dado estaria lá).
CREATE POLICY "agente_execucoes_por_org" ON "agente_execucoes" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "alertas_ia_por_org" ON "alertas_ia" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "avaliacoes_editor_por_org" ON "avaliacoes_editor" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "avaliacoes_videomaker_por_org" ON "avaliacoes_videomaker" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "checklist_templates_por_org" ON "checklist_templates" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "coberturas_por_org" ON "coberturas" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "config_email_por_org" ON "config_email" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "config_email_entrada_por_org" ON "config_email_entrada" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "config_empresa_por_org" ON "config_empresa" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "config_parametros_por_org" ON "config_parametros" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "config_trello_por_org" ON "config_trello" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "config_whatsapp_por_org" ON "config_whatsapp" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "contatos_whatsapp_por_org" ON "contatos_whatsapp" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "custos_videomaker_por_org" ON "custos_videomaker" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "demandas_por_org" ON "demandas" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "depoimentos_por_org" ON "depoimentos" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "designer_dados_fiscais_por_org" ON "designer_dados_fiscais" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "designer_organizacao_por_org" ON "designer_organizacao" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "editor_dados_fiscais_por_org" ON "editor_dados_fiscais" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "editor_organizacao_por_org" ON "editor_organizacao" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "emails_entrada_por_org" ON "emails_entrada" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "eventos_por_org" ON "eventos" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "eventos_gestao_por_org" ON "eventos_gestao" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "fabricantes_por_org" ON "fabricantes" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "fornecedores_por_org" ON "fornecedores" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "ideias_video_por_org" ON "ideias_video" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "linhas_projeto_por_org" ON "linhas_projeto" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "mapa_lid_whatsapp_por_org" ON "mapa_lid_whatsapp" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "mensagens_whatsapp_por_org" ON "mensagens_whatsapp" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "modulo_organizacao_por_org" ON "modulo_organizacao" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "permissoes_usuario_por_org" ON "permissoes_usuario" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "producao_manual_por_org" ON "producao_manual" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "produtos_por_org" ON "produtos" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "relatorios_ia_por_org" ON "relatorios_ia" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "usuario_organizacao_por_org" ON "usuario_organizacao" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "videomaker_dados_fiscais_por_org" ON "videomaker_dados_fiscais" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));
CREATE POLICY "videomaker_organizacao_por_org" ON "videomaker_organizacao" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true))
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true));

-- ── 5) Tabelas filhas: a empresa vem do pai ─────────────────────────────────
--
-- Elas não têm coluna de empresa, e isso é decisão de projeto: a FK para o pai
-- já impõe a posse, e uma coluna replicada poderia DISCORDAR dele — dado que
-- parece de uma empresa e é de outra. A política pergunta ao pai.
--
-- O custo é um índice-lookup por linha, sobre a PK do pai. A maior destas
-- tabelas tem 1.958 linhas.
CREATE POLICY "aprovacoes_video_por_org" ON "aprovacoes_video" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "aprovacoes_video"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "aprovacoes_video"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "arquivos_por_org" ON "arquivos" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "arquivos"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "arquivos"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "checklist_itens_por_org" ON "checklist_itens" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "checklist_itens"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "checklist_itens"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "checklist_template_itens_por_org" ON "checklist_template_itens" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "checklist_templates" p WHERE p."id" = "checklist_template_itens"."templateId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "checklist_templates" p WHERE p."id" = "checklist_template_itens"."templateId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "coberturas_album_por_org" ON "coberturas_album" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "coberturas" p WHERE p."id" = "coberturas_album"."coberturaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "coberturas" p WHERE p."id" = "coberturas_album"."coberturaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "coberturas_checklist_por_org" ON "coberturas_checklist" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "coberturas" p WHERE p."id" = "coberturas_checklist"."coberturaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "coberturas" p WHERE p."id" = "coberturas_checklist"."coberturaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "coberturas_equipe_por_org" ON "coberturas_equipe" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "coberturas" p WHERE p."id" = "coberturas_equipe"."coberturaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "coberturas" p WHERE p."id" = "coberturas_equipe"."coberturaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "coberturas_log_por_org" ON "coberturas_log" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "coberturas" p WHERE p."id" = "coberturas_log"."coberturaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "coberturas" p WHERE p."id" = "coberturas_log"."coberturaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "coberturas_uploads_por_org" ON "coberturas_uploads" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "coberturas" p WHERE p."id" = "coberturas_uploads"."coberturaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "coberturas" p WHERE p."id" = "coberturas_uploads"."coberturaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "comentarios_por_org" ON "comentarios" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "comentarios"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "comentarios"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "convites_videomaker_por_org" ON "convites_videomaker" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "convites_videomaker"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "convites_videomaker"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "custos_evento_por_org" ON "custos_evento" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "eventos_gestao" p WHERE p."id" = "custos_evento"."eventoId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "eventos_gestao" p WHERE p."id" = "custos_evento"."eventoId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "demanda_produto_por_org" ON "demanda_produto" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "demanda_produto"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "demanda_produto"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "demanda_responsavel_por_org" ON "demanda_responsavel" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "demanda_responsavel"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "demanda_responsavel"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "evento_face_descriptors_por_org" ON "evento_face_descriptors" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "coberturas_uploads" p WHERE p."id" = "evento_face_descriptors"."uploadId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "coberturas_uploads" p WHERE p."id" = "evento_face_descriptors"."uploadId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "eventos_gestao_aprovacoes_por_org" ON "eventos_gestao_aprovacoes" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "eventos_gestao" p WHERE p."id" = "eventos_gestao_aprovacoes"."eventoId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "eventos_gestao" p WHERE p."id" = "eventos_gestao_aprovacoes"."eventoId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "eventos_gestao_checklist_por_org" ON "eventos_gestao_checklist" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "eventos_gestao" p WHERE p."id" = "eventos_gestao_checklist"."eventoId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "eventos_gestao" p WHERE p."id" = "eventos_gestao_checklist"."eventoId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "eventos_gestao_documentos_por_org" ON "eventos_gestao_documentos" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "eventos_gestao" p WHERE p."id" = "eventos_gestao_documentos"."eventoId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "eventos_gestao" p WHERE p."id" = "eventos_gestao_documentos"."eventoId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "eventos_gestao_log_por_org" ON "eventos_gestao_log" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "eventos_gestao" p WHERE p."id" = "eventos_gestao_log"."eventoId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "eventos_gestao" p WHERE p."id" = "eventos_gestao_log"."eventoId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "historico_status_por_org" ON "historico_status" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "historico_status"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "historico_status"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "logs_automacao_por_org" ON "logs_automacao" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "logs_automacao"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "logs_automacao"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));
CREATE POLICY "notas_fiscais_por_org" ON "notas_fiscais" TO "app_user"
  USING (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "notas_fiscais"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)))
  WITH CHECK (EXISTS (SELECT 1 FROM "demandas" p WHERE p."id" = "notas_fiscais"."demandaId"
                   AND p."organizacaoId" = current_setting('app.org_id', true)));

-- ── 6) As dez que não são de uma empresa ────────────────────────────────────

-- `organizacoes`: a aplicação enxerga a empresa em que está, e só ela. A tela de
-- Super Admin, que lista todas, não passa por aqui — ela usa a conexão de dono,
-- explicitamente, em src/lib/prisma-admin.ts. Escapatória em connection string é
-- auditável; escapatória em variável de sessão qualquer consulta pode ligar.
CREATE POLICY "organizacoes_a_propria" ON "organizacoes" TO "app_user"
  USING ("id" = current_setting('app.org_id', true))
  WITH CHECK ("id" = current_setting('app.org_id', true));

-- `usuarios` é global no modelo — a mesma pessoa pode trabalhar para várias
-- empresas, e é `usuario_organizacao` que diz onde. A política pergunta: esta
-- pessoa é membro da empresa em que estou? Se não for, ela não existe para mim.
-- Sem isso, uma consulta sem escopo listaria nome, e-mail e telefone de todo
-- mundo da plataforma.
CREATE POLICY "usuarios_por_membresia" ON "usuarios" TO "app_user"
  USING (EXISTS (
    SELECT 1 FROM "usuario_organizacao" uo
    WHERE uo."usuarioId" = "usuarios"."id"
      AND uo."organizacaoId" = current_setting('app.org_id', true)
  ));

-- Criar usuário é o convite de um membro novo: ele ainda não tem vínculo no
-- instante do INSERT, então o WITH CHECK acima o impediria de nascer. A criação
-- é liberada; o vínculo que vem logo depois é que decide quem enxerga.
CREATE POLICY "usuarios_criacao" ON "usuarios" FOR INSERT TO "app_user"
  WITH CHECK (true);

-- O login precisa ler `usuarios` ANTES de existir empresa — é a ordem do
-- problema, não um atalho: só depois de saber quem é a pessoa dá para descobrir
-- de qual empresa ela é. Por isso o role separado, e por isso ele só lê.
CREATE POLICY "usuarios_login" ON "usuarios" FOR SELECT TO "app_auth" USING (true);
CREATE POLICY "vinculo_login" ON "usuario_organizacao" FOR SELECT TO "app_auth" USING (true);
-- `orgPublica` resolve a empresa pelo slug do formulário público, antes de haver
-- sessão. Mesma categoria: resolver a empresa não pode exigir a empresa.
CREATE POLICY "organizacoes_resolucao" ON "organizacoes" FOR SELECT TO "app_auth" USING (true);
CREATE POLICY "reset_senha" ON "password_reset_tokens" TO "app_auth" USING (true) WITH CHECK (true);

-- ── A REDE de profissionais ─────────────────────────────────────────────────
--
-- Videomaker, Editor e Designer são o marketplace: o perfil é público entre as
-- empresas de propósito — é o que permite contratar quem já trabalhou para
-- outra. O que é privado (diária, CPF, PIX, lista negra, observação) foi movido
-- para as tabelas por empresa nas Fases A e B, e essas seguem a política normal.
--
-- Ler: qualquer empresa. Escrever: só quem tem vínculo com o profissional —
-- senão a empresa A renomeia o profissional da empresa B na rede inteira.
CREATE POLICY "videomakers_rede_leitura" ON "videomakers" FOR SELECT TO "app_user" USING (true);
CREATE POLICY "videomakers_cadastro" ON "videomakers" FOR INSERT TO "app_user" WITH CHECK (true);
CREATE POLICY "videomakers_edicao" ON "videomakers" FOR UPDATE TO "app_user"
  USING (EXISTS (SELECT 1 FROM "videomaker_organizacao" v
                 WHERE v."videomakerId" = "videomakers"."id"
                   AND v."organizacaoId" = current_setting('app.org_id', true)));

CREATE POLICY "editores_rede_leitura" ON "editores" FOR SELECT TO "app_user" USING (true);
CREATE POLICY "editores_cadastro" ON "editores" FOR INSERT TO "app_user" WITH CHECK (true);
CREATE POLICY "editores_edicao" ON "editores" FOR UPDATE TO "app_user"
  USING (EXISTS (SELECT 1 FROM "editor_organizacao" v
                 WHERE v."editorId" = "editores"."id"
                   AND v."organizacaoId" = current_setting('app.org_id', true)));

CREATE POLICY "designers_rede_leitura" ON "designers" FOR SELECT TO "app_user" USING (true);
CREATE POLICY "designers_cadastro" ON "designers" FOR INSERT TO "app_user" WITH CHECK (true);
CREATE POLICY "designers_edicao" ON "designers" FOR UPDATE TO "app_user"
  USING (EXISTS (SELECT 1 FROM "designer_organizacao" v
                 WHERE v."designerId" = "designers"."id"
                   AND v."organizacaoId" = current_setting('app.org_id', true)));

-- ── Sem política, de propósito: RLS ligada nega tudo ────────────────────────
--
--   sessions               0 linhas. A autenticação é JWT puro, sem tabela de
--                          sessão. A tabela é resquício e vai ser removida numa
--                          migration de contração.
--   chat_ia_mensagens      0 linhas e nenhuma referência no código. Idem.
--   produtos_servico_evento  0 linhas, e não tem coluna de empresa. Pertence ao
--                          módulo `eventos`, que está DESLIGADO na plataforma
--                          (DISPONIVEL_NA_PLATAFORMA.eventos = false). Ligar o
--                          módulo exige dar dono a esta tabela antes — e negar
--                          agora é o que garante que ninguém ligue por engano.
--
-- Nada a fazer aqui além de registrar o porquê: as três já estão com RLS ligada
-- na seção 3, e sem política nenhuma linha sai.

-- ── 7) TRAVA DE SAÍDA ───────────────────────────────────────────────────────
--
-- Uma tabela que fique com RLS ligada e sem política vira 404 silencioso para a
-- aplicação inteira. As três acima são intencionais; qualquer outra é erro, e
-- erro descoberto depois da virada é erro descoberto pelo cliente.
DO $$
DECLARE
  faltando TEXT;
  esperadas_sem_politica TEXT[] := ARRAY['sessions','chat_ia_mensagens','produtos_servico_evento'];
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO faltando
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity
    AND NOT (c.relname = ANY (esperadas_sem_politica))
    AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid);

  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Abortado: RLS ligada sem política nenhuma em: %. Estas tabelas ficariam vazias para a aplicação.', faltando;
  END IF;

  -- E o contrário: tabela de negócio que ficou FORA da RLS.
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO faltando
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity
    AND c.relname <> '_prisma_migrations';

  IF faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Abortado: tabela sem RLS: %. Toda tabela do schema public precisa de decisão explícita.', faltando;
  END IF;
END $$;

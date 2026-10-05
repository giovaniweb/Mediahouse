-- VOLTA da migration 20261005140000_public_fora_da_api_supabase.
--
-- Devolve exatamente o que produção tinha em 05/10/2026: anon, authenticated e
-- service_role com tudo em public (tabelas, sequências, funções e privilégio
-- padrão do postgres), e PUBLIC com EXECUTE nas quatro funções de gatilho.
-- Reabre a API REST do Supabase sobre public. Só faz sentido se algo que
-- dependia dela parar depois da migration. Até hoje nada no código depende.
--
-- Escrita em produção: roda só com o sim do Giovani, numa transação única
-- (`psql -1`). Não mexe em _prisma_migrations: a migration continua registrada
-- como aplicada, e refazer o fechamento depois é rodar o SQL dela de novo.
-- Testada em 05/10/2026 num Postgres descartável com os privilégios padrão do
-- Supabase: depois da volta, o catálogo bate com a leitura de produção.

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.nuflow_parceria_regras(),
  public.nuflow_compartilhamento_derivar_origem(),
  public.nuflow_espelho_colunas_permitidas(),
  public.evento_notificar_em()
TO PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

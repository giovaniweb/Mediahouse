-- VOLTA da migration 20261120000000_espelho_conserto.
--
-- Devolve as duas funções de gatilho do espelhamento exatamente como a
-- 20260908000000 as criou (texto copiado de lá). Efeito: revogar espelho com a
-- parceria encerrada volta a dar erro, e a parceira volta a poder mudar
-- videomakerId/editorId do card (só com a RLS ligada).
--
-- Escrita em produção: só com o sim do Giovani, numa transação (`psql -1`). Não
-- mexe em _prisma_migrations: refazer depois é rodar o SQL da migration de novo.
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
      AND ((p."organizacaoConvidanteId" = org_dona AND p."organizacaoConvidadaId" = NEW."organizacaoDestinoId")
        OR (p."organizacaoConvidadaId" = org_dona AND p."organizacaoConvidanteId" = NEW."organizacaoDestinoId"))
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

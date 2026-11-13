-- Conserto do espelhamento entre empresas (PR #68), antes de o recurso ser
-- usado de verdade pelo "videomaker que trabalha por uma empresa".
--
-- SÓ `CREATE OR REPLACE` de duas funções de gatilho. Nenhuma tabela, coluna,
-- política ou gatilho novo. Volta: scripts/volta/20261120000000_espelho_conserto.sql.
-- Em 12/11/2026 produção tinha 0 parcerias e 0 espelhos: a mudança não altera
-- linha nenhuma, só o que os próximos INSERT/UPDATE podem fazer.

-- ── 1) A aresta: a parceria é conferida só ao ATIVAR ─────────────────────────
--
-- Antes, o gatilho conferia a parceria aceita em TODO update. Encerrada a
-- parceria, revogar o espelho (preencher `revogadoEm`) batia nesta conferência
-- e voltava erro 500: o acesso ficava preso aberto justamente quando deveria
-- fechar. Agora a parceria é exigida quando a aresta passa a dar acesso:
--   - INSERT já ativo;
--   - UPDATE que reativa (revogadoEm deixa de ser nulo → nulo);
--   - UPDATE que muda o escopo de uma aresta ativa (acompanhar → executar).
-- Revogar, e qualquer update de aresta já revogada, passa sem a conferência.
--
-- Também fica proibido trocar o DESTINO de uma aresta: o par (demanda, destino)
-- é a identidade dela, e trocar o destino seria entregar o card a outra empresa
-- sem a conferência de parceria acima.
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
  ativando BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."demandaId" IS DISTINCT FROM OLD."demandaId" THEN
      RAISE EXCEPTION 'Um compartilhamento não muda de demanda. Revogue e crie outro.';
    END IF;
    IF NEW."organizacaoDestinoId" IS DISTINCT FROM OLD."organizacaoDestinoId" THEN
      RAISE EXCEPTION 'Um compartilhamento não muda de empresa. Revogue e crie outro.';
    END IF;
  END IF;

  SELECT d."organizacaoId" INTO org_dona FROM demandas d WHERE d.id = NEW."demandaId";
  IF org_dona IS NULL THEN
    RAISE EXCEPTION 'Demanda % não existe.', NEW."demandaId";
  END IF;
  IF org_dona = NEW."organizacaoDestinoId" THEN
    RAISE EXCEPTION 'Compartilhar uma demanda com a própria dona não faz sentido.';
  END IF;

  ativando := NEW."revogadoEm" IS NULL AND (
    TG_OP = 'INSERT'
    OR OLD."revogadoEm" IS NOT NULL
    OR NEW.escopo IS DISTINCT FROM OLD.escopo
  );

  -- O aperto de mão é pré-requisito para DAR acesso, e ele é conferido AQUI e
  -- não só na rota: a rota é uma porta, o gatilho é a parede.
  IF ativando AND NOT EXISTS (
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

  RETURN NEW;
END $$;

-- ── 2) Colunas que o espelho move: sem videomakerId e editorId ──────────────
--
-- Quem é o videomaker e o editor do card é decisão da DONA: é com eles que ela
-- tem convite, diária, nota e pagamento. Com as duas na lista, a empresa que
-- executa podia trocar o videomaker da dona. A escolha de quem da parceira faz
-- o trabalho mora numa tabela da própria parceira (Fase B), não no card.
CREATE OR REPLACE FUNCTION nuflow_espelho_colunas_permitidas()
RETURNS TRIGGER
LANGUAGE plpgsql
-- Sem SECURITY DEFINER: esta função não consulta tabela nenhuma.
SET search_path = public
AS $$
DECLARE
  org_atual TEXT := NULLIF(current_setting('app.org_id', true), '');
  permitidas TEXT[] := ARRAY[
    'statusInterno', 'statusVisivel', 'posicaoKanban',
    'dataCaptacao', 'localGravacao',
    'linkBrutos', 'linkFolderBrutos', 'linkFinal', 'linkFolderFinal',
    'motivoImpedimento', 'thumbnailUrl',
    'updatedAt'
  ];
BEGIN
  IF org_atual IS NULL THEN RETURN NEW; END IF;
  IF OLD."organizacaoId" = org_atual THEN RETURN NEW; END IF;

  IF NEW."organizacaoId" IS DISTINCT FROM OLD."organizacaoId" THEN
    RAISE EXCEPTION 'Espelhamento não transfere a posse da demanda.';
  END IF;

  NEW := jsonb_populate_record(NEW, to_jsonb(OLD) - permitidas);
  RETURN NEW;
END $$;

-- ── 3) Trava de saída ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF position('videomakerId' IN pg_get_functiondef('nuflow_espelho_colunas_permitidas()'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'Abortado: videomakerId continua na lista do espelho.';
  END IF;
  IF position('ativando' IN pg_get_functiondef('nuflow_compartilhamento_derivar_origem()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Abortado: a conferência da parceria não ficou restrita à ativação.';
  END IF;
END $$;

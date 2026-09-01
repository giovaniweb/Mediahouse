-- Avaliação por QR público sob RLS: dois furos que só apareceriam em produção.
--
-- A Fase 2 decidiu que a avaliação vinda de QR público nasce SEM DONO: quem
-- avalia ali é o cliente final com o celular na mão, e o que ele diz pertence à
-- rede, não a uma empresa. A coluna é nulável exatamente por isso.
--
-- Só que a política escrita na Fase 3 compara por igualdade:
--
--   organizacaoId = current_setting('app.org_id', true)
--
-- Com `organizacaoId` NULL isso dá NULL, que não é verdadeiro. O INSERT do QR
-- público seria RECUSADO — a tela diria "avaliação enviada" e nada teria sido
-- gravado. As duas decisões estavam certas sozinhas e erradas juntas.
--
-- E tem o segundo furo: depois de gravar, a média do perfil é recalculada. O
-- perfil é da REDE, mas a política de escrita dele exige vínculo com a empresa
-- ativa — e o QR público não tem empresa nenhuma. O UPDATE também não passaria.

-- ── 1) Avaliação sem dono é legítima ────────────────────────────────────────
--
-- `IS NULL` entra no USING e no WITH CHECK. Uma empresa passa a enxergar as
-- avaliações dela mais as públicas — que é exatamente o que as rotas de leitura
-- já fazem em código (`OR: [{ organizacaoId }, { organizacaoId: null }]`), agora
-- dito também no banco.
DROP POLICY IF EXISTS "avaliacoes_videomaker_por_org" ON "avaliacoes_videomaker";
CREATE POLICY "avaliacoes_videomaker_por_org" ON "avaliacoes_videomaker" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true) OR "organizacaoId" IS NULL)
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true) OR "organizacaoId" IS NULL);

DROP POLICY IF EXISTS "avaliacoes_editor_por_org" ON "avaliacoes_editor";
CREATE POLICY "avaliacoes_editor_por_org" ON "avaliacoes_editor" TO "app_user"
  USING ("organizacaoId" = current_setting('app.org_id', true) OR "organizacaoId" IS NULL)
  WITH CHECK ("organizacaoId" = current_setting('app.org_id', true) OR "organizacaoId" IS NULL);

-- ── 2) A média é da rede, e só ela ──────────────────────────────────────────
--
-- RLS decide por LINHA, não por coluna: não há como dizer "pode atualizar
-- `avaliacao` e mais nada". Uma política de UPDATE larga o bastante para o QR
-- público recalcular a média deixaria a empresa A renomear o profissional da
-- empresa B na rede inteira.
--
-- Então o recálculo vira função: ela escreve UMA coluna, calculada pelo próprio
-- banco a partir de todas as avaliações. Não recebe o valor de fora — recebe só
-- de quem recalcular — o que a torna incapaz de gravar uma nota inventada.
CREATE OR REPLACE FUNCTION public.recalcular_media_videomaker(p_id TEXT)
RETURNS DOUBLE PRECISION
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE videomakers v
     SET avaliacao = COALESCE(
       (SELECT round(avg(a.nota)::numeric, 1) FROM avaliacoes_videomaker a WHERE a."videomakerId" = p_id),
       0
     )
   WHERE v.id = p_id
  RETURNING v.avaliacao
$$;

CREATE OR REPLACE FUNCTION public.recalcular_media_editor(p_id TEXT)
RETURNS DOUBLE PRECISION
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE editores e
     SET avaliacao = COALESCE(
       (SELECT round(avg(a.nota)::numeric, 1) FROM avaliacoes_editor a WHERE a."editorId" = p_id),
       0
     )
   WHERE e.id = p_id
  RETURNING e.avaliacao
$$;

REVOKE ALL ON FUNCTION public.recalcular_media_videomaker(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalcular_media_editor(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalcular_media_videomaker(TEXT) TO "app_user";
GRANT EXECUTE ON FUNCTION public.recalcular_media_editor(TEXT) TO "app_user";

-- Mesma trava da função de credencial: SECURITY DEFINER sem search_path fixo é
-- sequestrável por um schema plantado na frente.
DO $$
DECLARE f TEXT; cfg TEXT[];
BEGIN
  FOREACH f IN ARRAY ARRAY['recalcular_media_videomaker','recalcular_media_editor'] LOOP
    SELECT proconfig INTO cfg FROM pg_proc WHERE proname = f;
    IF cfg IS NULL OR NOT ('search_path=public' = ANY (cfg)) THEN
      RAISE EXCEPTION 'Abortado: % sem search_path fixo.', f;
    END IF;
  END LOOP;
END $$;

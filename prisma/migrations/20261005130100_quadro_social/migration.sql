-- Área Social Media do NuFlow (continuação de 20261005130000).
--
-- Tudo aditivo: colunas novas anuláveis ou com padrão e uma tabela nova. O
-- código antigo não lê nem grava nada daqui, então pode rodar antes do deploy.
-- Sobe DEPOIS de 20261005120000_designer_pendente (outra frente do piloto).
--
-- ideias_video: a ideia do quadro guarda a área (vídeo ou arte), o dia em que
-- deve ser postada, a linha de produto e o formulário de demanda como ela o
-- deixou ao salvar como ideia. Mesmo banco de ideias de /ideias.
-- social_linhas: quem é a social media de cada linha. Pendura no vínculo com a
-- empresa (usuario_organizacao): quem sai da empresa sai da linha pelo cascade.
-- demandas.cobrancas/cobradoEm: o "Cobrar", uma vez por dia por pedido.
-- permissoes_usuario.verSocial: a área no menu, como verDesign para o Growth.

ALTER TABLE "demandas" ADD COLUMN     "cobradoEm" TIMESTAMP(3),
ADD COLUMN     "cobrancas" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ideias_video" ADD COLUMN     "area" "AreaDemanda",
ADD COLUMN     "dataPostagem" DATE,
ADD COLUMN     "formulario" JSONB,
ADD COLUMN     "linhaProjetoId" TEXT;

ALTER TABLE "permissoes_usuario" ADD COLUMN     "verSocial" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "social_linhas" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "usuarioOrganizacaoId" TEXT NOT NULL,
    "linhaProjetoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_linhas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "social_linhas_organizacaoId_idx" ON "social_linhas"("organizacaoId");
CREATE INDEX "social_linhas_linhaProjetoId_idx" ON "social_linhas"("linhaProjetoId");
CREATE UNIQUE INDEX "social_linhas_usuarioOrganizacaoId_linhaProjetoId_key" ON "social_linhas"("usuarioOrganizacaoId", "linhaProjetoId");
CREATE INDEX "ideias_video_organizacaoId_linhaProjetoId_idx" ON "ideias_video"("organizacaoId", "linhaProjetoId");

ALTER TABLE "ideias_video" ADD CONSTRAINT "ideias_video_linhaProjetoId_fkey" FOREIGN KEY ("linhaProjetoId") REFERENCES "linhas_projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "social_linhas" ADD CONSTRAINT "social_linhas_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_linhas" ADD CONSTRAINT "social_linhas_usuarioOrganizacaoId_fkey" FOREIGN KEY ("usuarioOrganizacaoId") REFERENCES "usuario_organizacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_linhas" ADD CONSTRAINT "social_linhas_linhaProjetoId_fkey" FOREIGN KEY ("linhaProjetoId") REFERENCES "linhas_projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Isolamento por empresa, no mesmo molde de lotes_acervo. DELETE é necessário:
-- tirar a social de uma linha apaga a ligação.
ALTER TABLE "social_linhas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "social_linhas" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON "social_linhas" FROM PUBLIC, app_auth, app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "social_linhas" TO app_user;
CREATE POLICY "social_linhas_org" ON "social_linhas" TO app_user
USING ("organizacaoId"=current_setting('app.org_id',true))
WITH CHECK ("organizacaoId"=current_setting('app.org_id',true));

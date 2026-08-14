-- CreateIndex
CREATE INDEX "demandas_organizacaoId_idx" ON "demandas"("organizacaoId");

-- CreateIndex
CREATE INDEX "demandas_organizacaoId_statusVisivel_idx" ON "demandas"("organizacaoId", "statusVisivel");

-- CreateIndex
CREATE INDEX "alertas_ia_organizacaoId_idx" ON "alertas_ia"("organizacaoId");

-- CreateIndex
CREATE INDEX "alertas_ia_organizacaoId_status_idx" ON "alertas_ia"("organizacaoId", "status");

-- CreateIndex
CREATE INDEX "mensagens_whatsapp_organizacaoId_idx" ON "mensagens_whatsapp"("organizacaoId");

-- CreateIndex
CREATE INDEX "mensagens_whatsapp_organizacaoId_createdAt_idx" ON "mensagens_whatsapp"("organizacaoId", "createdAt");

-- CreateIndex
CREATE INDEX "eventos_organizacaoId_idx" ON "eventos"("organizacaoId");

-- CreateIndex
CREATE INDEX "eventos_organizacaoId_inicio_idx" ON "eventos"("organizacaoId", "inicio");

-- CreateIndex
CREATE INDEX "custos_videomaker_organizacaoId_idx" ON "custos_videomaker"("organizacaoId");

-- CreateIndex
CREATE INDEX "custos_videomaker_organizacaoId_pago_idx" ON "custos_videomaker"("organizacaoId", "pago");

-- CreateIndex
CREATE INDEX "ideias_video_organizacaoId_idx" ON "ideias_video"("organizacaoId");

-- CreateIndex
CREATE INDEX "coberturas_organizacaoId_idx" ON "coberturas"("organizacaoId");

-- CreateIndex
CREATE INDEX "eventos_gestao_organizacaoId_idx" ON "eventos_gestao"("organizacaoId");

-- CreateIndex
CREATE INDEX "producao_manual_organizacaoId_idx" ON "producao_manual"("organizacaoId");


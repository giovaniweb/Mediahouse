# Inventário de superfícies do workspace

Gerado em 20/09/2026 a partir do código do preview. Esta é uma inspeção estática; não comprova funcionamento em produção. Endpoints abaixo são referências diretas na página; componentes importados podem acrescentar operações.

| Página | Linhas | Referências diretas a API |
|---|---:|---|
| /admin/organizacoes | 22 |  |
| /agenda | 574 | `/api/agenda`, `/api/agenda/${id}`, `/api/agenda/exportar.ics`, `/api/agenda?inicio=${qsInicio}` |
| /alertas | 196 | `/api/alertas` |
| /aprovacoes/growth | 7 |  |
| /aprovacoes | 7 |  |
| /auditoria | 223 | `/api/auditoria?${params}`, `/api/growth/responsaveis?area=todas` |
| /caixa-entrada | 6 |  |
| /coberturas/[id] | 899 | `/api/coberturas/${coberturaId}`, `/api/coberturas/${coberturaId}/checklist`, `/api/coberturas/${coberturaId}/equipe`, `/api/coberturas/${coberturaId}/equipe?membroId=${membroId}`, `/api/coberturas/${coberturaId}/relatorio`, `/api/coberturas/${coberturaId}/uploads`, `/api/coberturas/${coberturaId}/uploads/upload-url?tipo=thumbnail`, `/api/coberturas/${coberturaId}/uploads/upload-url?tipo=video`, `/api/coberturas/${coberturaId}/uploads?uploadId=${uploadId}`, `/api/equipe-disponivel?papel=${papel}` |
| /coberturas | 814 | `/api/coberturas`, `/api/coberturas/briefing`, `/api/coberturas?${params}` |
| /configuracoes/linhas-projetos | 100 | `/api/growth/linhas-projetos`, `/api/growth/linhas-projetos/${id}`, `/api/growth/linhas-projetos?incluirInativas=1` |
| /configuracoes | 2013 | `/api/admin/backfill-arquivos`, `/api/admin/backfill-custos`, `/api/admin/depoimentos`, `/api/admin/depoimentos/${dep.id}`, `/api/admin/depoimentos/${id}`, `/api/admin/depoimentos/${other.id}`, `/api/admin/depoimentos/upload-url?contentType=${encodeURIComponent`, `/api/admin/depoimentos/upload-url?contentType=image`, `/api/admin/sync-drive`, `/api/admin/transcode-hevc`, `/api/auth/setup-drive`, `/api/auth/setup-drive/test`, `/api/config/empresa`, `/api/configuracoes/email`, `/api/configuracoes/parametros`, `/api/configuracoes/parametros/${p.id}`, `/api/configuracoes/parametros?grupo=${grupo}`, `/api/configuracoes/whatsapp`, `/api/configuracoes/whatsapp/desconectar`, `/api/configuracoes/whatsapp/qr`, `/api/configuracoes/whatsapp/teste`, `/api/configuracoes/whatsapp/webhook`, `/api/editores`, `/api/editores?usuarioId=${userId}`, `/api/videomakers`, `/api/videomakers?usuarioId=${userId}`, `/api/whatsapp/status` |
| /custos | 908 | `/api/custos-videomaker`, `/api/custos-videomaker/${id}`, `/api/custos-videomaker?${params.toString`, `/api/producao`, `/api/producao?mes=${mesSelecionado}`, `/api/videomakers?status=ativo` |
| /dashboard | 250 | `/api/dashboard/metrics`, `/api/ideias/kpi`, `/api/kpi/b2c-b2b` |
| /demandas/[id] | 11 |  |
| /demandas/nova | 36 | `/api/equipe-disponivel` |
| /demandas | 436 | `/api/configuracoes/parametros?grupo=departamentos`, `/api/demandas/${demandaId}`, `/api/demandas/${demandaId}/duplicate`, `/api/demandas/${demandaId}/status`, `/api/demandas?${params}`, `/api/editores?status=ativo`, `/api/eventos`, `/api/growth/responsaveis?area=audiovisual`, `/api/produtos?limit=200`, `/api/videomakers?status=ativo` |
| /design | 234 | `/api/demandas/${demandaId}/status`, `/api/demandas/${id}`, `/api/demandas/${id}/duplicate`, `/api/demandas?${params}`, `/api/growth/linhas-projetos`, `/api/growth/responsaveis`, `/api/produtos?limit=200` |
| /equipe/[id] | 813 | `/api/editores/${id}`, `/api/editores/${id}/avaliar` |
| /equipe | 479 | `/api/editores`, `/api/editores/${id}` |
| /eventos/[id] | 505 | `/api/demandas`, `/api/eventos/${ev.id}`, `/api/eventos/${eventoId}/aprovacoes`, `/api/eventos/${eventoId}/checklist`, `/api/eventos/${eventoId}/checklist?itemId=${tid}`, `/api/eventos/${eventoId}/custos`, `/api/eventos/${eventoId}/custos?custoId=${cid}`, `/api/eventos/${eventoId}/documentos`, `/api/eventos/${eventoId}/documentos?docId=${did}`, `/api/eventos/${eventoId}/relatorio`, `/api/eventos/${id}` |
| /eventos | 405 | `/api/coberturas/briefing`, `/api/eventos`, `/api/eventos/${id}`, `/api/eventos/dashboard`, `/api/eventos?${qs}` |
| /fornecedores | 155 | `/api/fornecedores`, `/api/fornecedores/${id}`, `/api/fornecedores?${qs}` |
| /galeria-artes | 93 | `/api/growth/galeria?${qs}` |
| /growth/equipe | 56 | `/api/growth/equipe` |
| /historico | 278 | `/api/configuracoes/parametros?grupo=tipos_video`, `/api/demandas?${params}` |
| /ia | 726 | `/api/ia/agentes/gerar-alertas`, `/api/ia/agentes/monitor`, `/api/ia/agentes/prazos`, `/api/ia/agentes/vistoria`, `/api/ia/chat`, `/api/relatorios/gerar`, `/api/whatsapp/enviar` |
| /ideias | 792 | `/api/ideias`, `/api/ideias/${detailIdeia.id}`, `/api/ideias/${id}`, `/api/ideias/${id}/analisar`, `/api/ideias/${id}/converter`, `/api/ideias/analisar-batch`, `/api/ideias/bulk`, `/api/ideias/kpi`, `/api/ideias?${params}`, `/api/produtos?all=true` |
| /jobs/[id] | 21 |  |
| /jobs | 196 | `/api/demandas`, `/api/demandas?${params}`, `/api/editores`, `/api/videomakers` |
| /mensagens | 251 | `/api/editores?status=ativo`, `/api/usuarios`, `/api/videomakers?status=ativo`, `/api/whatsapp/enviar` |
| /mensagens-falhadas | 155 | `/api/mensagens-falhadas`, `/api/mensagens-falhadas?limit=200` |
| /minhas-notas | 251 | `/api/me/nf-token`, `/api/me/videomaker` |
| /parcerias | 193 | `/api/parcerias`, `/api/parcerias/${p.parceriaId}` |
| /produtos/[id] | 510 | `/api/demandas?search=${encodeURIComponent`, `/api/produtos/${id}`, `/api/produtos/${id}/demandas`, `/api/produtos/${id}/demandas?demandaId=${demandaId}`, `/api/produtos/sugestoes` |
| /produtos | 733 | `/api/fabricantes`, `/api/kpi/b2c-b2b`, `/api/produtos`, `/api/produtos/${id}`, `/api/produtos/${p.id}`, `/api/produtos/${produto.id}`, `/api/produtos?all=true` |
| /produtos-servico | 133 | `/api/fornecedores`, `/api/produtos-servico`, `/api/produtos-servico/${id}`, `/api/produtos-servico?${search` |
| /relatorios/finalizadas-sem-video | 195 | `/api/admin/scan-drive-final`, `/api/admin/scan-drive-final?demandaId=${id}`, `/api/relatorios/finalizadas-sem-video?${params}` |
| /relatorios | 1298 | `/api/eventos/dashboard`, `/api/producao-manual`, `/api/producao-manual?area=${area}`, `/api/producao-manual?area=${resAreaParam}`, `/api/relatorios`, `/api/relatorios/gerar`, `/api/relatorios/metricas`, `/api/relatorios/metricas?periodo=${periodo}`, `/api/relatorios/metricas?periodo=custom` |
| /usuarios | 1508 | `/api/demandas?solicitanteId=${encontrado.id}`, `/api/usuarios`, `/api/usuarios/${conflito.id}`, `/api/usuarios/${deleteTarget.id}?modo=hard`, `/api/usuarios/${id}`, `/api/usuarios/${mesclarModal.principal.id}/mesclar`, `/api/usuarios/${promoverTarget.id}/promover`, `/api/usuarios/${u.id}/vinculos`, `/api/usuarios/${usuario.id}`, `/api/usuarios?busca=${q}` |
| /videomakers/[id] | 741 | `/api/videomakers/${id}`, `/api/videomakers/${id}/aprovar`, `/api/videomakers/${id}/avaliar` |
| /videomakers | 418 | `/api/videomakers`, `/api/videomakers/${id}`, `/api/videomakers/${id}/aprovar` |

# Matriz do primeiro lote de autorização

Gerada dos handlers modificados, 26/09/2026. Isto não certifica outras rotas nem substitui a revisão dos IDs e campos. GET de parâmetros é operacional; escrita é administrativa. Dados fiscais próprios usam obrigação de custo em empresa ativa.

| Rota | Método | Fronteira |
| --- | --- | --- |
| `/api/config/empresa` | GET | gerenciarConfig |
| `/api/config/empresa` | POST | gerenciarConfig |
| `/api/configuracoes/email` | GET | gerenciarConfig |
| `/api/configuracoes/email` | POST | gerenciarConfig |
| `/api/configuracoes/parametros/[id]` | PATCH | gerenciarConfig |
| `/api/configuracoes/parametros/[id]` | DELETE | gerenciarConfig |
| `/api/configuracoes/parametros` | GET | Vínculo ativo; escopo próprio |
| `/api/configuracoes/parametros` | POST | gerenciarConfig |
| `/api/configuracoes/trello/import` | POST | gerenciarConfig |
| `/api/configuracoes/trello/import` | GET | gerenciarConfig |
| `/api/configuracoes/trello/import-json` | POST | gerenciarConfig |
| `/api/configuracoes/trello/lists` | GET | gerenciarConfig |
| `/api/configuracoes/trello` | GET | gerenciarConfig |
| `/api/configuracoes/trello` | POST | gerenciarConfig |
| `/api/configuracoes/trello/sync` | POST | gerenciarConfig |
| `/api/configuracoes/whatsapp/desconectar` | POST | gerenciarConfig |
| `/api/configuracoes/whatsapp/qr` | GET | gerenciarConfig |
| `/api/configuracoes/whatsapp` | GET | gerenciarConfig |
| `/api/configuracoes/whatsapp` | POST | gerenciarConfig |
| `/api/configuracoes/whatsapp/teste` | POST | gerenciarConfig |
| `/api/configuracoes/whatsapp/webhook` | POST | gerenciarConfig |
| `/api/custos-videomaker/[id]/aprovar` | POST | verCustos + papel gestor/admin |
| `/api/custos-videomaker/[id]` | PATCH | verCustos + papel gestor/admin |
| `/api/custos-videomaker/[id]` | DELETE | verCustos + papel gestor/admin |
| `/api/custos-videomaker` | GET | verCustos |
| `/api/custos-videomaker` | POST | verCustos + papel gestor/admin |
| `/api/ia/agentes/gerar-alertas` | POST | verIA |
| `/api/ia/agentes/monitor` | POST | verIA |
| `/api/ia/agentes/prazos` | POST | verIA |
| `/api/ia/agentes/triagem` | POST | verIA |
| `/api/ia/agentes/vistoria` | POST | verIA |
| `/api/ia/analisar-demanda` | POST | verIA |
| `/api/ia/chat` | POST | verIA |
| `/api/me/empresa-faturamento` | GET | Vínculo ativo; escopo próprio |
| `/api/permissoes` | GET | Vínculo ativo; escopo próprio |
| `/api/permissoes` | PUT | gerenciarUsuarios |
| `/api/permissoes` | POST | gerenciarUsuarios |
| `/api/producao` | GET | verCustos |
| `/api/producao-manual` | GET | verRelatorios |
| `/api/producao-manual` | POST | verRelatorios + papel gestor/admin |
| `/api/producao-manual` | DELETE | verRelatorios + papel gestor/admin |
| `/api/relatorios/finalizadas-sem-video` | GET | verRelatorios + papel gestor/admin |
| `/api/relatorios/gerar` | POST | verRelatorios + verCustos (conteúdo misto) |
| `/api/relatorios/metricas` | GET | verRelatorios + verCustos (conteúdo misto) |
| `/api/relatorios` | GET | verRelatorios + verCustos (conteúdo misto) |
| `/api/usuarios/[id]/mesclar` | POST | gerenciarUsuarios |
| `/api/usuarios/[id]/promover` | POST | gerenciarUsuarios |
| `/api/usuarios/[id]` | PATCH | Vínculo ativo; escopo próprio |
| `/api/usuarios/[id]` | DELETE | gerenciarUsuarios |
| `/api/usuarios/[id]/senha` | POST | gerenciarUsuarios |
| `/api/usuarios/[id]/vinculos` | GET | gerenciarUsuarios |
| `/api/usuarios` | GET | gerenciarUsuarios |
| `/api/usuarios` | POST | gerenciarUsuarios |

As provas integradas chamam handlers com sessão simulada e banco real, sem middleware. A matriz de negação percorre métodos críticos e confere ausência de execução de agentes. Login real por navegador, todos os fluxos positivos, concorrência de revogação e integrações permanecem pendentes.

## Ampliação de 28/09

A integração passou a conferir GET de configuração empresarial, Trello e custos sob todos os 12 papéis persistidos no vínculo: admin/gestor permitidos por preset; operação, solicitante, editor, videomaker, social, gestor de eventos, designer, analista CRM, gestor de tráfego e auxiliar administrativo negados. O tipo global da identidade não altera o resultado. Exceção explícita de verCustos continua coberta no teste anterior.

Trello: gravação/leitura permitidas, preservação de mapeamento, negação de reutilização de credenciais entre empresas, payload forjado, revogação durante chamada, falha externa e configuração desativada. Usuários: histórico e comentários de outra empresa não influenciam última atividade. Não há homologação real de Trello nem alegação de cobertura positiva de todas as rotas.

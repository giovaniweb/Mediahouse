# S08 — Auditoria de ações sensíveis

Implementação local sobre efc8495. Sem publicação, credenciais reais, chamadas pagas ou envios externos. A interface completa continua no cartão U06.

## Contrato

Evento pertence a uma organização e contém ator humano ou técnico, ação, recurso/ID, resultado, data, correlationId e detalhes permitidos. O serviço central aceita somente ações conhecidas e remove campos não autorizados. Não registra tokens, mensagens, telefones, e-mails, documentos fiscais, valores de custos ou conteúdo livre. Para configurações, registra os nomes dos campos alterados, sem seus valores.

Escrita de negócio e evento de sucesso usam a mesma transação. Falha na auditoria desfaz a escrita. Chave única impede duplicação do mesmo evento/correlação; isso não torna chamadas distintas nem envios externos idempotentes. Alterações repetidas sem mudança são ignoradas nas rotas cobertas. Negação de capacidade identificável usa registro independente e best-effort: falhar o log nunca libera acesso.

OAuth, Trello e envios das ferramentas IA registram intenção e resultado correlacionados. Sucesso de envio significa aceitação pelo provedor, não entrega. Uma intenção sem resultado exige investigação; não é prova de falha nem autorização para reenviar. Inbox/outbox e recibos são O01–O03.

## Cobertura entregue

| Fluxo | Registro |
| --- | --- |
| Permissões e pessoas | Alterações efetivas de permissões, perfil/vínculo e remoção de acesso |
| Configuração | Empresa, preferências de e-mail, configuração WhatsApp e parâmetros |
| Integrações | Conexão Trello e retorno OAuth Drive; rotação técnica de credenciais Drive |
| Biblioteca | Publicação/revogação explícita, sem reutilizar histórico de status |
| Manutenção | Custos/arquivos retroativos com bloqueio concorrente e evento por criação; retenção de detalhes |
| Ferramentas IA | Criação de alerta, evento, demanda, arquivo e ideia; solicitações de envio |
| Acesso | Negação de capacidade pelo helper após identificação e vínculo válidos |

Não há preenchimento fictício do passado. Histórico de demandas continua disponível em fonte separada. Não são cobertos universalmente todos os 403, testes de envio de e-mail, desconexão/webhook WhatsApp ou rotinas antigas de transcode/sync. Instrumentar essas fronteiras ao concluir S02/S03 e O/M/U07. O checkpoint não encerra esses cartões nem certifica o SaaS inteiro.

## Leitura e proteção

GET /api/auditoria?fonte=seguranca exige vínculo atual, verRelatorios e papel admin/gestor da própria empresa. Paginação de 50 itens, ordenação por data/ID, filtro de ator/período e busca por ação, recurso ou correlação. Resposta privada sem cache. A tela permite alternar ações administrativas e histórico de demandas.

RLS limita SELECT/INSERT por organização. app_user não pode UPDATE/DELETE eventos nem apagar organização para provocar cascata; app_auth não recebe acesso. Administrador técnico continua privilegiado: não é uma trilha inviolável contra administrador ou credencial comprometida. Exclusão administrativa de organização apaga a trilha por cascata, conforme contrato atual; retenção legal/backup do envelope depende da política operacional antes da venda.

## Migrações e operação

Aplicar na ordem do repositório, depois das migrações S07:

1. 20260929020000_eventos_auditoria
2. 20260929030000_auditoria_preservar_empresa

Aplicadas apenas no PostgreSQL descartável local (29 migrações). Em homologação, conferir grants/roles com o diagnóstico S07 antes de liberar tráfego. Código novo depende dessas migrações.

Detalhes antes/depois expiram em 90 dias e ficam ocultos na API após esse prazo. A remoção física requer rotina administrativa: scripts/retencao-auditoria.mjs. Exige ADMIN_DATABASE_URL e ORGANIZACAO_AUDITORIA explícitos; não carrega .env. Sem argumentos apenas simula. Para aplicar, usar --aplicar e CONFIRMAR_RETENCAO_AUDITORIA=sim em ambiente operacional autorizado. Remove até 1.000 payloads vencidos por execução, mantém envelope e registra a própria manutenção na mesma transação. Repetir por empresa até não haver vencidos; agendamento, monitoramento e retenção de backups ainda precisam ser configurados em L02. Não expor a conexão administrativa ao runtime comum.

## Evidências locais

Testes cobrem allowlist, sucesso atômico, rollback, repetição, negação identificável, isolamento A/B, expiração na leitura, limpeza física via CLI, concorrência no backfill, OAuth com provedor simulado, ferramentas IA sem conteúdo sensível e roles reais sem privilégios administrativos. Resultados finais no CONTROLE.md. Nenhuma prova local substitui validação do pool/RLS, integrações ou navegador autenticado em homologação.

# S05 — autorização das ferramentas da secretária

Implementação local de 28/09/2026 sobre 095c97d. Nenhuma chamada real de IA, mensagem externa ou publicação executada. Testes usam PostgreSQL descartável e adaptadores externos simulados.

## Contrato

O executor recebe um contexto emitido pelo adaptador autenticado, nunca uma empresa solta nem capacidades dos argumentos do modelo. Objetos JSON forjados não são contextos válidos. Cada execução consulta novamente empresa ativa, vínculo, estado da pessoa e permissões. Contextos são efêmeros, não serializáveis para filas: futuros workers devem reconstruí-los a partir de uma identidade técnica autenticada.

Chat e quatro agentes manuais recebem o ator autenticado. Os três chamadores do cron usam um principal operacional restrito. WhatsApp identifica a pessoa pelo número completo dentro da empresa resolvida pela instância; nome de contato não concede acesso. Ambiguidade de número ou pessoa inativa retira a identidade interna. A rede global de videomakers não serve como autorização sem vínculo ativo com a empresa.

## Política por ferramenta

| Ferramenta | Contrato de acesso |
| --- | --- |
| buscar_demandas, buscar_demanda_por_codigo, buscar_historico_demanda | verDemandas e filtroMinhasDemandas, salvo verTodasDemandas; profissional WhatsApp sem conta só acessa atribuições próprias |
| buscar_videomakers | verVideomakers + verTodasDemandas; diária/custo somente com verCustos |
| buscar_custos | verCustos; nunca no principal técnico de cron |
| buscar_metricas | verRelatorios + verTodasDemandas; bloco financeiro somente com verCustos; cron recebe apenas operação |
| buscar_alertas | verAlertas; escopo da demanda para acesso restrito |
| criar_alerta | verAlertas + verTodasDemandas; vínculo da demanda validado antes de gravar |
| buscar_agenda_videomaker, criar_evento_agenda | verAgenda e dono próprio; gestor/admin pode operar responsável ativo da empresa; IDs explícitos, datas limitadas, sem forçar conflito pela IA |
| enviar_whatsapp | WhatsApp responde somente ao próprio número, sem associar ID fornecido pelo modelo; aplicativo exige gerenciarUsuarios; aplicativo/cron só enviam a gestor ou participante da demanda validada |
| listar_gestores | gerenciarUsuarios; papel vem do vínculo da empresa; cron operacional pode obter destinatários gestores |
| criar_demanda_rascunho, estruturar_demanda | criarDemanda no aplicativo; WhatsApp admite pedido externo restrito; telefone real substitui argumento do modelo e pedido nasce aguardando aprovação interna |
| solicitar_dados_demanda | aplicativo, editarDemanda + gerenciarUsuarios; destinatário derivado do solicitante da demanda acessível |
| vincular_arquivo_demanda | editarDemanda/atribuição profissional, demanda acessível e URL exata recebida no contexto WhatsApp; não aceita anexo arbitrário pelo chat |
| salvar_ideia_video, buscar_ideias | verIdeias; origem derivada do ator, mídia exige procedência e contagem usa empresa |

Todos os argumentos passam por schemas estritos, com limites de texto, quantidade, intervalo e enumerações das escritas. Telefone, pessoa, organização, status e capacidades não podem ser injetados para ampliar acesso. Erros internos não são devolvidos ao modelo. Consultar demanda por código deixou de retornar a linha inteira, incluindo tokens públicos.

## WhatsApp fora da IA

O webhook passou a exigir segredo configurado e válido. Instância ambígua, organização inativa ou origem não autenticada não executam ações. Isso fecha uma exceção legada que aceitava qualquer origem quando não havia segredo.

Remetente direto exige JID de telefone completo. LID só é aceito com associação explícita `key.remoteJidAlt` no mesmo evento autenticado. Não se consulta cache legado de procedência incerta, mensagens com sufixo semelhante, pushName ou tentativa de converter o LID em telefone. Se o provedor não envia essa associação, o evento é descartado com diagnóstico; não inventar correspondência para manter o fluxo verde.

A referência técnica conferida foi o [código de identificação de autor do Baileys](https://github.com/WhiskeySockets/Baileys/blob/master/src/Utils/generics.ts), que utiliza a chave alternativa. Isso não comprova que a versão Evolution implantada encaminha o mesmo campo: validar seu payload real em L02. O02 deverá persistir mapeamentos com origem verificável e tratar mensagens não resolvidas numa inbox durável.

SIM/NÃO exige exatamente um convite no estado videomaker_notificado e atribuído ao profissional identificado. Duas respostas simultâneas competem por atualização condicional; só a vencedora grava histórico. Mais de um convite exige tratamento explícito posterior, sem escolher o último card arbitrariamente. Reenvios gerais e outbox continuam O01–O03.

## Validação e limites de publicação

Cobertos contexto ausente/forjado, argumentos inválidos, admin global com vínculo restrito, revogação, consultas próprias, finanças de gestor, cron sem financeiro, anexo de outra empresa, mídia forjada, agenda alheia, contato desconhecido, rascunho sem telefone forjado, destinatário sem vínculo, mesmo sufixo com outro DDD, identidade ambígua, webhook sem segredo/segredo errado/LID sem par e concorrência/ambiguidade de convites.

Antes de publicar: conferir segredo configurado na Evolution, exemplo de evento direto e LID da versão instalada, contatos com número completo e vínculo ativo, destinatários sintéticos autorizados e RLS real do runtime. Sem esses dados, não chamar este lote de WhatsApp homologado. A normalização mantém números brasileiros locais legados e números internacionais explícitos; telefone internacional deve ter DDI, preferencialmente com + no cadastro.

Busca textual de agenda e forçar conflito foram recusados deliberadamente; usar ID do responsável e o fluxo do aplicativo. Anexo arbitrário no chat também foi recusado. A estrutura de contato externo continua criando apenas pedido pendente, não job aprovado. Ler telefones formatados legados exige varrer perfis da empresa em memória; O02/I01 devem substituir por coluna canônica indexada sem enfraquecer a verificação.

Os prompts continuam orientando linguagem, mas não decidem acesso. Limites financeiros de IA, filas, recibos, revisão de publicação de mídia, auditoria de eventos e interface simplificada pertencem aos próximos cartões. Autorizações são revalidadas por chamada; este lote não promete transação única abrangendo todas as ações de uma conversa ou os efeitos externos.

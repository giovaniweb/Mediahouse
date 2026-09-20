# Migração visual NuFlow — avaliação de prontidão

20/09/2026 · branch `ui/kanban-preview` · somente preview opt-in (`?visual=novo`).

## Entregue nesta etapa

Jobs recebeu hierarquia visual, colunas e cards mais legíveis, filtros recolhíveis no mobile, rótulos acessíveis e estado explícito de falha com repetição. Mantém o filtro de coberturas aprovadas (`ehJob`), ordenação por atraso/urgência/prazo, responsável e próxima ação derivados do estado. Os cards continuam abrindo `/jobs/[id]`. Não há drag-and-drop: as transições continuam sendo ações de negócio no detalhe.

A casca compartilhada, navegação e formulários de demandas já tinham modernização opt-in. Isso não significa que todas as páginas internas estejam redesenhadas. O visual clássico continua disponível.

## Ordem de migração e condições

| Grupo | O que pode ser feito com os dados atuais | Dependência / validação antes de liberar |
|---|---|---|
| Demandas audiovisual e Growth | Preview já implementado: filtros, cards, colunas, formulário e detalhe | Staging: permissões por perfil, anexos, aprovações, drag em quadros longos e touch; gravação de posições ainda é individual |
| Jobs | Quadro modernizado nesta etapa | Validar abertura e ações do detalhe com dados de teste, inclusive cancelado, bloqueado e externo; preservar `job-fase` e `job-transicoes` |
| Dashboard | Preview interno implementado com indicadores, gráfico das etapas atuais, carga, B2C/B2B e ideias; API não retorna histórico semanal | Há painéis próprios para videomaker/designer; mobile redireciona a `/campo`. Testar cada perfil e ausência de módulo. Tratamento de erro do repositório original incorporado sem alterar aquele checkout |
| Agenda | Redesenhar calendário e detalhe preservando `/api/agenda` | Datas/fuso, privado, edição/exclusão e lembretes. Reusar padrão visual de diálogo, não campos específicos de demanda |
| Aprovações audiovisual/Growth | Hierarquia de pendências, filtros e cards | Preservar distinção entre entrada, urgência e entrega criativa; testar aprovar/recusar e falhas sem duplicar ações |
| Galerias de vídeo e artes | Grid, filtros e visualização responsiva | Publicação, acesso, arquivos privados, downloads e mídia pesada; aprovação não equivale automaticamente a publicação pública |
| Equipes, videomakers e custos | Melhorar tabelas, detalhes e leitura de carga/custos | Visibilidade financeira e papéis interno/externo; não transformar volume em nota de qualidade |
| Produtos e linhas/projetos | Agrupamento na navegação já pronto; próximos: listagem/formulários | Vínculos existentes, desativação e exclusão; manter escopo da organização |
| Pessoas & Acessos | Preservar abas Pessoas, Equipes e Perfis; modernizar tabela e painel lateral | Página tem edição, promoção, mesclagem, exclusão e vínculos. Testar exceções individuais, reset de senha e isolamento por organização antes de mexer em fluxo |
| Configurações | Separar visualmente perfil, empresa, integrações e manutenção | Há WhatsApp/QR, e-mail, Drive, parâmetros e backfills. Não executar envio-teste, desconexão ou manutenção na avaliação visual. Não mover ações sensíveis para CTAs genéricos |
| Histórico | Melhorar busca e filtros atuais | Histórico global de todos os quadros é mudança funcional; precisa confirmar consulta, retenção e permissões antes de renomear como global |
| Organizações / SaaS | Melhorar lista, módulos e membros com dados existentes | Página usa `requireSuperAdmin` no servidor antes do HTML. Manter esse limite. Saúde, uso, suporte e releases exigem fontes/telemetria próprias; não apresentar métricas fictícias |
| Relatórios, auditoria e alertas | Padronizar tabelas e estados de vazio/erro | Escopo, paginação, exportação e acesso; não alterar critérios de alertas durante migração visual |
| Ideias, caixa de entrada, mensagens e notas | Padronizar superfícies e navegação | Respeitar módulos habilitados, privacidade e efeitos reais de envio |
| Eventos, coberturas, parceiros, fornecedores e produtos de serviço | Inventário existente; migrar só os módulos efetivamente habilitados | Conferir disponibilidade por organização e dependências de Jobs; não reativar módulos pela navegação |
| Campo/mobile | Precisa avaliação própria; não é só reduzir desktop | Rotas fora do layout dashboard, captura/upload, conectividade e tarefas do profissional |
| LP, login e portais externos | Trabalho separado do workspace autenticado | Branding por empresa, galeria pública e solicitação externa precisam preservar autenticação e resolução da organização |

## Sequência proposta de execução

1. Homologar os quadros já implementados com usuários de teste por papel e duas organizações.
2. Dashboard e páginas predominantemente de leitura, conciliando primeiro as alterações locais existentes.
3. Agenda, aprovações, galerias e detalhes operacionais, com testes de ação e erro.
4. Pessoas & Acessos e configurações, preservando a estrutura aprovada e cobrindo operações sensíveis.
5. SaaS administrativo e portais: separar mudança visual de novos serviços/indicadores.

Cada lote deve manter o opt-in e permitir retorno ao clássico. Publicação geral somente depois da revisão do preview e homologação. Não alterar schema ou contratos de API para atender um efeito visual.

## Evidências e limites

Jobs: TypeScript e ESLint sem erros; build de produção local concluído; 137 testes de fase/transições passaram. QA de navegador usa APIs simuladas e não prova integrações reais. O inventário completo de páginas e referências diretas a endpoints está em `inventario-layouts.md`.

O repositório original possui uma alteração ainda não commitada no dashboard (tratamento de erro e retry). Ela foi identificada e deixada intacta; esta etapa não substituiu esse arquivo. O dashboard interno agora tem preview próprio; painéis especializados, configurações e usuários ainda precisam da modernização específica.

QA local de navegador concluído: Jobs desktop/mobile sem overflow, exclusão de solicitação pendente, erro HTTP e retry, além da regressão de Demandas/Growth. Capturas: `evidencias-kanban/jobs-desktop.png` e `jobs-mobile.png`. Nenhum banco ou serviço externo foi acionado.

## Lote seguinte: dashboard interno

Implementado no opt-in, com evidências e limites em `dashboard-preview.md`. O estado mensal é rotulado como vídeos entregues. Corrigido o escopo da carga do editor para a organização atual. O histórico semanal continua dependente de dados não retornados pela API.

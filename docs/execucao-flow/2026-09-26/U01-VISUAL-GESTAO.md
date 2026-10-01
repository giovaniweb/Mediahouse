# Visual integrado de gestão — 01/10/2026

Pedido: aplicar as melhorias já com o visual novo. Base funcional b1b4d31. Não foi feito merge do checkout de protótipo: somente linguagem visual e fontes foram reaproveitadas, mantendo as rotas e regras auditadas.

## Aplicado

- Custos, Relatórios e Configurações passam a usar ManagementSurface permanentemente, sem parâmetro de preview. Fonte Montserrat local com licença OFL, grafite #101115, painéis #191b23, divisórias #303342, acento #bca2fa, títulos leves e abas sublinhadas seguem WorkspaceVisual, AdminPreview e work.module.css do protótipo nuflow-kanban-preview.
- Custos: resumo mensal com valor conhecido em destaque, selo de fechamento parcial, categorias, formulário em duas colunas/uma no móvel, pendências e lançamentos recolhidos. Valores e permissões vêm das APIs existentes.
- Relatórios: hierarquia visual comum, abas acessíveis e análise opcional de IA recolhida. Nenhuma análise é disparada por abrir a seção. Acesso aos custos segue o mesmo padrão.
- Configurações: painel comum, navegação lateral no desktop e faixa horizontal em tela estreita; campos em uma coluna no móvel. Acesso à conferência de custos históricos recebe destaque. Seleção das seções e alternadores de perfil têm estado acessível.
- Foco visível, controles principais de pelo menos 44px e respeito a movimento reduzido. CSS é escopado: outras páginas e a navegação global não receberam migração funcional nem estilização indiscriminada.

## Validação

- TypeScript e build webpack aprovados; 761 testes unitários; lint sem erros (12 avisos preexistentes nas páginas legadas). Nenhum serviço financeiro/backend alterado neste recorte.
- Next local completo, banco PostgreSQL sintético na porta 55449. Login fictício e organização marcada ambienteTeste. A rede externa do processo está bloqueada pelo guard de ensaio.
- Navegador: Custos carrega R$ 3.100 sintéticos (3000 internos +100 ferramentas) e uma despesa desconhecida; formulário abre/fecha; Tab alcança Categoria com contorno visível. Configurações alterna para Parâmetros e apresenta link para custos. Relatórios carrega abas/indicadores e mantém IA recolhida.
- Observadas distribuições ampla/estreita. Na medição estreita, documento e viewport têm mesma largura; rolagem horizontal fica dentro da navegação de seções, não na página. Não equivale a ensaio em dispositivo físico ou cobertura de todos os modais/conteúdos legados.
- Prévia temporária local: http://localhost:60506/custos (sessão exec 42594). Dados estritamente fictícios; IDs `visual-financeiro-outubro` e `visual-financeiro-operador`. Preservados para revisão do usuário, não são dados de produção. Ao encerrar a prévia, parar somente esse servidor e remover somente essa organização/usuário do banco sintético. Não rodar limpeza global.

## Continuidade

As próximas melhorias devem usar esta base visual ou o componente correspondente do protótipo aprovado. U01 continua parcial: sidebar global, Demandas/Kanban e demais módulos não foram declarados migrados por consequência. C01–C03 e seus critérios funcionais mantêm os estados anteriores. Nenhum deploy/push foi feito.

`AGENTS.md` e `CLAUDE.md` foram gerados automaticamente pelo Next dev e preservados conforme instruções do próprio framework.

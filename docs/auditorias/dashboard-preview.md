# Dashboard — preview visual

20/09/2026. Rota local `/dashboard?visual=novo`, branch `ui/kanban-preview`. Não publicado.

## Alterações

- Componente isolado `DashboardPreview`, acionado pelo opt-in existente. Clássico preservado.
- Indicadores de edição, urgência, atraso e vídeos entregues no mês, com navegação para páginas existentes.
- Gráfico de barras das etapas de edição, aprovação e postagem; números em texto e nomes além da cor.
- Carga por editor usa o status ponderado retornado pela API. Quantidade de demandas não é apresentada como peso nem como nota de qualidade.
- Hoje em Foco, Alertas IA, B2C/B2B e Ideias mantêm suas fontes e comportamento; módulo Ideias respeita disponibilidade da empresa.
- Estado de erro/retry do checkout original incorporado. O arquivo original permanece intacto.

## Achados corrigidos ou explicitados

A consulta de demandas relacionadas ao editor não filtrava organização. Adicionado `organizacaoId` a esse relacionamento. Teste com o mesmo editor trabalhando em duas empresas confirma que apenas a empresa atual compõe carga e alerta. Não houve migração de banco.

`concluidasMes` conta arquivos finais (com fallback de link), não quantidade de demandas. Novo rótulo: Vídeos entregues. A galeria de destino não é um filtro mensal.

A API não retorna `tendencia`, embora a tela clássica tenha um bloco que a consumiria. Não foi criado gráfico histórico fictício. Também não se reutilizou `demandasAtivas` como total de abertas: seu cálculo atual soma edição, aprovação, postagem e novas do dia. A correção da definição desse indicador fica para um lote funcional próprio.

## Verificação

- TypeScript e build local otimizado passaram.
- ESLint dos novos componentes/testes e página sem erros. Rota mantém dois avisos anteriores de variáveis não utilizadas.
- Suíte completa: 615 testes em 41 arquivos, todos passaram, incluindo quatro testes novos da API.
- Chrome com rede externa bloqueada e APIs simuladas: carregamento, dados, desktop1440, tablet820 sem overflow, falha/retry, equipe vazia, Ideias desligado, retorno ao clássico e seleção dos painéis designer/videomaker.
- Mobile390 mantém redirecionamento para `/campo`; o destino foi simulado no teste. Esta etapa não redesenha nem homologa o fluxo de campo.
- Capturas com dados fictícios em `evidencias-dashboard/`. Teste reproduzível: `scripts/qa/dashboard-preview.cjs`, usando o mesmo servidor local isolado descrito em `kanban-preview.md`.

## Antes da liberação

Homologar leitura com dados de teste reais em duas organizações e perfis distintos. Os testes de navegador verificam apresentação, não autorização real do backend. Integrações, ações dos alertas e painéis especializados mantidos não foram revalidados de ponta a ponta. Aprovação do preview continua pendente; produção permanece inalterada.

# Validação local consolidada

Execução em 26/09/2026 na cópia `nuflow-kanban-preview`, branch `ui/kanban-preview`.
Nenhum commit, push ou deploy nesta rodada.

## Resultados

| Verificação | Resultado |
| --- | --- |
| Build Next.js de produção (`--webpack`) | Aprovado |
| TypeScript (`tsc --noEmit`) | Aprovado |
| Vitest | 615 testes aprovados em 41 arquivos |
| ESLint dos arquivos de Agenda, Aprovações e administração | Sem erros; nove avisos preexistentes em Configurações |
| Kanban audiovisual / Growth / Jobs | Aprovado |
| Dashboard | Aprovado |
| Agenda e Aprovações | Aprovado |
| Pessoas & Acessos e Configurações | Aprovado |

## Cobertura do navegador

- Desktop, tablet quando previsto no roteiro e mobile; sem overflow horizontal nas páginas verificadas.
- Alternância clássico/novo, persistência entre rotas, menu sanfona e fechamento da gaveta por Escape.
- Kanban: reordenação por teclado, erro 403, abertura do formulário e filtros mobile.
- Jobs: exclusão de solicitações pendentes da lista, falha de consulta e repetição.
- Dashboard: carregamento, erros, retry, equipe vazia, módulos desabilitados, papéis designer/videomaker e redirecionamento mobile.
- Agenda: abertura por teclado, foco do detalhe, payload de criação, falhas ao criar/excluir mantendo o estado.
- Aprovações: ordem de conversão antes de aprovação, recusa, retry e ausência de pagamentos no Growth.
- Pessoas: detalhes por teclado, equipes/perfis, ações de senha/permissão preservadas, abertura e cancelamento da redefinição e espaço para o painel lateral.
- Configurações: navegação de abas, apresentação mobile e acesso restrito ao papel solicitante.

## Ambiente e limites

Servidor local em `http://127.0.0.1:3107`, com segredo fictício de autenticação e endereço fictício de banco local. Os roteiros de navegador criam sessões de teste e interceptam todas as APIs; requisições externas ficam bloqueadas.

Não foi configurado nem populado um PostgreSQL de testes nesta cópia. Assim, o servidor responder não significa que login real, persistência, uploads, OAuth, e-mail e WhatsApp estejam validados. Não houve acesso a banco de produção nem envio real de notificações.

Próxima etapa funcional: provisionar banco isolado com dados sintéticos, dois tenants e contas por papel; então conferir login, gravações, isolamento e integrações de teste. As páginas ainda não modernizadas continuam pendentes do inventário de migração.

## Reprodução

Os quatro roteiros são `scripts/qa/kanban-preview.cjs`, `dashboard-preview.cjs`, `agenda-approvals-preview.cjs` e `admin-preview.cjs`. Precisam do build local iniciado na porta 3107 com o segredo de teste declarado nos scripts e do módulo Playwright disponível por `PLAYWRIGHT_MODULE`.

Logs desta execução em `/tmp/nuflow-validation-*.log`; capturas atualizadas em `/tmp/nuflow-kanban-qa`, `/tmp/nuflow-dashboard-qa`, `/tmp/nuflow-agenda-qa` e `/tmp/nuflow-admin-qa`.

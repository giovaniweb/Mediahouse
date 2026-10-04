# Integração do novo Kanban — entrega local para revisão

Atualização: 20/09/2026. Branch `ui/kanban-preview`, base `c02f3ad`. Checkout separado: `/Users/giovanigomes/MediaHouse/nuflow-kanban-preview`.

## Situação

Integração local do Kanban Audiovisual e Growth, navegação e superfícies de criação/detalhes. **Não publicada nem considerada migração 100% concluída.** O checkout original e suas alterações anteriores foram preservados. Nenhuma migração, credencial de produção, mensagem ou dado real foi utilizado.

## Implementado

- Visual opcional via `/demandas?visual=novo` e `/design?visual=novo`; o padrão permanece clássico.
- Preferência mantida na sessão do navegador e botão de retorno no quadro e no menu. `?visual=classico` também desativa.
- Menu em sanfona, uma seção aberta por vez; seção atual se abre ao navegar. Equipe audiovisual agrupa internos, externos e custos. Produtos reúne catálogo e linhas/projetos. Autorizações e disponibilidade de módulos existentes continuam filtrando os itens.
- Destaque de rota considera o caminho mais específico: Aprovações Growth não destaca simultaneamente Audiovisual.
- Quadro com superfícies, espaçamento e colunas responsivas; estados vazios identificados; título do card acessível por teclado.
- Filtros recolhíveis no celular, indicadores compactos, card visível na primeira tela de teste de 390×844. Ações do card visíveis em dispositivos sem hover; movimento reduzido respeitado.
- Criação e detalhes reutilizam os componentes reais. Formulário ocupa a tela no mobile, mantém rodapé e recebe semântica de diálogo, contenção e restauração de foco.
- Ordenação aguarda todas as respostas, detecta HTTP/rede, impede arrastes simultâneos durante gravação e exige reconciliação por recarregamento quando há erro parcial.
- Rota de posição exige vínculo/permissão efetiva na empresa, mantendo escopo de organização, e valida inteiro não negativo dentro do limite do banco.
- Growth restaura o estado do card em falha de rede ou recusa da API antes de revalidar.
- Correção independente de exports incompatíveis com Next em páginas/rota existentes; rótulos de eventos foram extraídos sem mudar seus valores.

## Evidências executadas

- **611 testes unitários passaram em 40 arquivos**, incluindo testes novos de HTTP 403/500, rede, escrita parcial, sessão ausente, outra empresa, vínculo indeterminado, permissão efetiva e posições inválidas.
- **Build otimizado Next/webpack passou**, incluindo TypeScript e geração das páginas. Resta aviso da dependência existente `face-api` sobre require dinâmico.
- Lint direcionado passou sem erros; aviso existente de `<img>` no logo da lateral permanece.
- Playwright contra o **build otimizado local**, com perfil temporário, token de teste local e **todas as APIs interceptadas**; URLs externas bloqueadas. Conferiu desktop, Growth, alternância de visual, persistência entre rotas, acordeão, reordenação por teclado, recusa 403, abertura/fechamento do formulário e contenção de foco, filtros mobile, card na primeira tela, ausência de overflow horizontal e fechamento da gaveta por Escape. Sem erro JavaScript de página detectado.
- Capturas com dados fictícios: `evidencias-kanban/desktop.png`, `growth.png`, `mobile.png`.

## Limites e pendências para liberação

1. Não houve teste ponta a ponta com banco: login real, isolamento RLS, uploads, notificações e concorrência multiusuário precisam de homologação com banco separado e envios desativados.
2. Persistência da ordem usa a API anterior, um PATCH por item; **não é atômica**. Em erro parcial o usuário é avisado; não prometemos rollback de banco. A prioridade de atrasadas/urgentes ao recarregar continua como antes.
3. A biblioteca de arraste avisou, no build de desenvolvimento, sobre rolagens aninhadas — arquitetura já existente. O teste por teclado passou, mas arraste nas bordas de quadros longos, mouse e toque requerem homologação adicional.
4. O detalhe completo foi preservado; não foram simulados uploads, aprovações externas, exclusão ou edição completa de registros reais.
5. Esta entrega não transforma Histórico em consulta global, nem reimplementa dashboard, agenda, gestão SaaS, perfil ou galerias do mockup. Essas áreas continuam com seus fluxos existentes; compartilhar a navegação nova não equivale a concluir suas migrações.
6. Revisão visual do usuário e aprovação do preview continuam necessárias antes de produção, conforme combinado.

## Reprodução isolada

Requer dependências do projeto e Playwright disponível (ou `PLAYWRIGHT_MODULE` apontando ao pacote instalado), além de Chrome instalado.

Inicie **apenas neste checkout isolado**, sem arquivos `.env` de produção:

```sh
AUTH_SECRET=nuflow-local-preview-only-secret-2026 DATABASE_URL=postgresql://teste:teste@127.0.0.1:5432/teste DIRECT_URL=postgresql://teste:teste@127.0.0.1:5432/teste npx next build --webpack
AUTH_SECRET=nuflow-local-preview-only-secret-2026 DATABASE_URL=postgresql://teste:teste@127.0.0.1:5432/teste DIRECT_URL=postgresql://teste:teste@127.0.0.1:5432/teste npx next start --hostname 127.0.0.1 --port 3107
node scripts/qa/kanban-preview.cjs
```

O segredo acima é público e exclusivo da simulação local; jamais usar em ambiente real. O script só acessa `127.0.0.1:3107` e devolve respostas fictícias para todas as APIs. Abrir a URL manualmente fora dessa sessão de teste não fornece login nem dados fictícios.

## Retorno

Para revisão, alternar pelo botão ou `?visual=classico`. Não há banco para restaurar por causa do visual. Correções de comportamento/permissão não são desligadas pela opção estética; ficam no código e devem ser revisadas separadamente. Não substituir o checkout original por esta pasta: integrar commits seletivamente após revisão das alterações paralelas.

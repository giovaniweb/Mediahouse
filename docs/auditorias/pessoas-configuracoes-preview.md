# Pessoas & Acessos e Configurações — preview

26/09/2026 · branch `ui/kanban-preview` · opt-in `?visual=novo`.

## Alterações

- Pessoas: hierarquia de título, indicadores que continuam filtrando, abas Pessoas/Equipes/Perfis preservadas, tabela com rolagem horizontal contida e botão no nome para abrir a pessoa por teclado.
- Painel lateral: superfície consistente com o workspace, espaço reservado no desktop, largura completa no celular. Permissões, senha, edição e mais ações permanecem nos mesmos fluxos.
- Configurações: navegação lateral no desktop e horizontal no celular, formulário com superfície consistente e campos da empresa em uma coluna no mobile. Callback do Drive e restrição a admin/gestor preservados.
- Estilos em CSS Module, ativos apenas no preview. Visual clássico continua disponível.

## Validação

- Build de produção local e TypeScript sem erros.
- ESLint sem erros; nove avisos existentes no arquivo de Configurações, em trechos fora da alteração.
- Suíte completa: 615 testes, 41 arquivos, aprovados.
- QA local com todas as APIs simuladas, rede externa bloqueada: abertura de pessoa por teclado, abas de equipes/perfis, acesso às ações de permissões/senha, abertura e cancelamento da redefinição, espaço para painel lateral, navegação de configurações e acesso restrito para solicitante.
- Desktop 1440×960 e mobile 390×844: sem overflow horizontal da página. Capturas em `evidencias-admin/`.
- Nenhuma mutação de usuário, senha, empresa ou integração foi executada. Script: `scripts/qa/admin-preview.cjs`.

## Limites e próxima homologação

Este lote moderniza a apresentação; não cria o novo perfil pessoal com produtividade e redes sociais. “Meu Perfil” em Configurações continua sendo a configuração profissional já existente. Não altera o contrato de API nem as regras de autorização.

Os formulários administrativos e integrações precisam de homologação com contas e organização de teste antes de liberar o visual geral. O QA simulado não comprova OAuth, WhatsApp, gravações reais, envio de e-mail ou redefinição efetiva de senha. Não houve publicação em produção.

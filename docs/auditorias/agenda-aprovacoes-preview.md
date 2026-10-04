# Agenda e Aprovações — preview

26/09/2026. Opt-in `?visual=novo`; produção não alterada.

Agenda: calendário responsivo, detalhe amplo no padrão das superfícies de demanda, metadados e link do registro vinculado. Eventos e dias podem ser abertos por teclado. Detalhe/formulário e recusa contêm foco, fecham com Escape e devolvem foco ao acionador. Escape em campos nativos de data/select é preservado.

Criação da agenda valida título e ordem dos horários, bloqueia repetição durante envio e mantém o formulário em caso de falha. Exclusão só fecha o detalhe após sucesso HTTP. Botão Hoje volta ao mês e seleciona o dia atual. Endpoints, lembretes e permissões não foram alterados. As regras antigas de contexto (inclusive o nome Contourline), conflito por dia e API para eventos atravessando períodos continuam pendências funcionais, fora da troca visual.

Aprovações: cards usam a largura disponível, abas responsivas e fila com loading/erro/retry. Não exibe “tudo em dia” enquanto carrega ou falha. Audiovisual e Growth mantêm suas consultas separadas; pagamentos continuam exclusivos do audiovisual. Conversão continua antes da aprovação. Os rótulos/fluxos de aprovação existentes foram preservados.

Verificação: build otimizado, TypeScript, ESLint dos arquivos alterados e 615 testes passaram. Script `scripts/qa/agenda-approvals-preview.cjs` intercepta todas as APIs e bloqueia rede externa. Verifica payload de criação (privado/lembrete), falhas de criação/exclusão, navegação por teclado, contenção de foco, desktop/mobile sem overflow, ordem converter/aprovar, falha de conversão interrompendo aprovação, payload da recusa, Growth sem consulta a pagamentos e retry da fila. Não houve gravação real nem envio de WhatsApp. A homologação com dados e papéis reais segue pendente.

# Caderno 6 — Experiência simples e operação SaaS

Simplificar a navegação sem reescrever os fluxos nem ocultar erros. Reutilizar as mudanças já existentes no preview após comparação de F00. Caminhos relativos à raiz de execução.

## U01 — Navegação consolidada e retirada de Tabela/importação

**Arquivos:** components/layout/Sidebar.tsx e navegação móvel, lib/modulos.ts, lib/permissoes.ts, páginas Demandas/Jobs, componentes/demandas/BarraVisao, modal e API importar.

1. Reaproveitar do preview a retirada de Tabela/importação após conferir diff. Remover caminhos de execução/importações mortos; preferência antiga tabela volta para Kanban. Não deixar endpoint de importação acessível com botão apenas escondido.
2. Criar agrupamento de navegação: Hoje, Trabalho, Agenda, Biblioteca, Equipe, Gestão e Administração conforme permissão. Aproveitar URLs atuais; redirecionamentos preservam filtros e deep links.
3. Trabalho reúne acesso a Jobs/Demandas/Aprovações; Gestão reúne resultados/custos/alertas e falhas de mensagem; Biblioteca reúne acervo/histórico/filtros de qualidade. Equipe oferece recortes interno/externo/Growth/parceiros.
4. Central de IA deixa de ser vitrine principal; capacidades verificadas aparecem no contexto. Banco de ideias/produtos/linhas permanecem acessíveis no lugar pertinente, sem novos itens de primeiro nível.
5. Manter capacidades de backend separadas da organização visual. Não usar menu como mecanismo de autorização nem conceder permissões por pertencer ao grupo Equipe.

**Aceite:** Kanban/Lista funcionam; tabela persistida não quebra abertura; importação desativada no servidor; links existentes chegam ao destino correto; menu responsivo reflete papel/empresa. Verificação visual desktop/celular, sem testes frágeis de cópia de JSX.

## U02 — Próxima ação, fluxo de Jobs e até quatro sugestões

**Arquivos:** dashboard/Hoje, jobs, demandas, detalhe de job, lib/job-fase.ts, job-transicoes.ts e serviço de escopo.

1. Reusar máquina de estados existente. Um detalhe acessível da lista, quadro e agenda exibe status, responsável, prazo, bloqueio e uma próxima ação principal.
2. Criar função determinística de sugestão usando trabalhos atribuídos e permitidos. Excluir concluídos/cancelados e separar bloqueados; ordenar por vencimento, prioridade existente, antiguidade da atribuição e ID estável. Campo desconhecido não recebe prioridade inventada.
3. Retornar até quatro, com motivo curto e esforço apenas quando informado. Usuário pode adiar/trocar sugestão; isso não muda prazo contratual, responsável ou status automaticamente.
4. Um fluxo simples para abrir → atribuir/aceitar → executar → anexar → aprovar/pedir ajuste → concluir, com UI específica do papel. Usar C01 e transições reais, não um fluxo paralelo.
5. Rascunho, feedback de salvamento/erro, prevenção de duplo clique e tratamento de conflito entre dois editores. Estado carregando não mostra zero nem acesso negado antes da resolução.

**Testes:** somente jobs permitidos, menos de quatro, todos bloqueados, empate, atrasado, sem prazo, troca de empresa, repetição de ação e atualização concorrente.

**Aceite visual:** pedido simples usa uma sequência curta com resumo; encontrar trabalho e entregar não exige navegar por vários módulos. Três roteiros sintéticos registrados com cliques/erros; teclado, foco, rótulo e layout móvel conferidos.

## U03 — Secretária com quatro fluxos delimitados

**Arquivos:** webhook/consumidor inbox, executor autorizado, serviço de conversa, formulários de demanda e U02/C01.

1. Estado conversacional durável por organização/instância/remetente, com versão, fluxo, rascunho, expiração e última entrada processada. Uma mensagem duplicada não avança duas etapas; mensagens concorrentes são serializadas por conversa.
2. Abrir pedido: título → tipo → prazo → dado obrigatório faltante, uma pergunta por vez. Reutilizar validação do formulário. Mostrar resumo e pedir confirmação da criação; contato externo só pode criar pedido no escopo permitido.
3. Aceitar job: convite identificado e válido em C01. Se houver vários convites, oferecer seleção; nunca escolher silenciosamente.
4. Planejar dia: usar exatamente o serviço de U02. Resumo diário exige preferência/horário do usuário e deduplicação por data local. Pausar/retomar avisos é respeitado.
5. Atualizar/entregar: vínculo e transição revalidados a cada ação; arquivo passa por M01 e aprovação existente. Documento/anexo é conteúdo, não instrução privilegiada para ferramentas.
6. LLM opcional extrai intenção/campos em schema restrito, com limite O06. Se indisponível, opções determinísticas continuam utilizáveis. Não inventar capacidades para perguntas fora do escopo.

**Roteiros de teste:** abandono/retomada de pedido; prazo inválido; cancelar; mensagem repetida; dois convites; usuário pede job alheio; prompt pede segredos/telefone arbitrário; anexo inválido; IA indisponível; pessoa sem opt-in não recebe resumo.

**Aceite:** quatro fluxos completos em adaptador sintético e banco isolado; efeitos passam pelos serviços comuns e são auditáveis. Conversa real de piloto é L02/L03, sem disparar para toda a equipe.

## U04 — Equipe, externos e parcerias com escopo explícito

**Arquivos:** páginas equipe/videomakers/Growth/parcerias; lib/parceria.ts, escopo-demanda.ts, campo-escopo.ts; api/parcerias/** e demandas/[id]/compartilhar.

1. Manter perfil global distinto de vínculo da empresa: diária, avaliação interna, fiscal e observações ficam privados conforme o escopo existente.
2. Perfil do externo consolida disponibilidade, convites, jobs, entrega e NF sem mostrar dados de outras empresas. Não tornar obrigatórios campos não necessários para executar um job.
3. Testar parceria ponta a ponta em A/B: convite, aceite bilateral, compartilhar demanda com escopo definido, atualizar permitido e revogar. A demanda continua uma identidade, não cópia que diverge.
4. Payload compartilhado usa allowlist; não serializar relações completas origem/destino/demanda. Custos/credenciais/fiscais e comentários internos não atravessam por acidente.
5. Revogação retira futuras leituras/escritas e assinaturas de mídia. Efeito de URL já emitida respeita TTL documentado em S06.

**Aceite:** roteiros A/B autorizados passam e acessos extras falham; desativar parceria não apaga evidência de serviço ou obrigações financeiras. Nenhuma mudança estética fecha o cartão sem prova de acesso.

## U05 — Administração de clientes e pessoas

**Arquivos:** api/admin/organizacoes/**, páginas admin/organizacoes e usuários, api/me/organizacoes, módulos e helpers de superadmin.

1. Resumo por empresa: estado, responsáveis, módulos, número de membros, uso/limites e saúde das integrações. Separar admin da empresa de superadmin da plataforma.
2. Ciclo de pessoa: convite, aceite, alteração de papel/permissão, inativação e revogação; verificar reset/recuperação de acesso existentes e impedir autoelevação. Convite identifica empresa/papel e não aceita substituição pelo destinatário.
3. Ciclo de empresa: preparar onboarding assistido, suspensão sem exclusão e exportação autorizada. Desligar rotina/IA da empresa suspensa; manter acesso administrativo necessário à resolução com justificativa e escopo.
4. Definir quotas técnicas de O06 e mídia por empresa; não fabricar assinatura paga. Uso acima do limite gera orientação, não perda de dados.
5. Acesso de suporte à empresa exige contexto explícito e registro S08; não fornecer interface irrestrita a qualquer admin. Exportação usa os mesmos filtros, logs e controle de arquivos.

**Testes:** admin A não administra B; usuário não promove a si mesmo; convite alterado/expirado; suspensão interrompe jobs elegíveis; restabelecimento não dispara todos os avisos antigos; exportação A não inclui B.

**Aceite:** onboarding de empresa sintética com papéis corretos e uso visível. Cobrança automática, impostos e contrato comercial não são inventados nem condição para concluir a interface administrativa.

## U06 — Registro de auditoria legível

**Arquivos:** app/(dashboard)/auditoria/page.tsx, api/auditoria/route.ts e eventos S08.

1. Preservar histórico de demandas e acrescentar visão de ações sensíveis, com rótulos claros e filtros por pessoa, empresa autorizada, data, ação e resultado.
2. Resumo “quem alterou o quê” e detalhe sob demanda; correlação liga ação, job e tentativa sem revelar mensagem/segredo.
3. Paginação estável, exportação autorizada e indicação de quando a coleta passou a existir. Não prometer log retroativo completo.

**Testes:** filtros/intervalos, A/B, tentativa negada, eventos técnicos sem usuário humano, ausência de dados, campos sanitizados e exportação.

**Aceite:** gestor encontra a origem de uma mudança/erro com uma consulta e um detalhe; API não entrega dados extra que a tela apenas esconde.

## U07 — Configurações úteis e manutenção separada

**Arquivos:** configurações, ConfigParametro, configuração de e-mail/WhatsApp/Drive, admin/backfills/transcode e lib/modulos.ts.

1. Agrupar Empresa, Pessoas/acessos, Integrações e Preferências operacionais. Manutenção fica restrita e fora de parâmetros cotidianos.
2. Parâmetros de departamento/tipo/habilidade/linha mantêm IDs estáveis; inativação preserva histórico. Detectar registros sem uso antes de sugerir limpeza; não apagar “lixo” só pela aparência.
3. Backfill, reconciliação e reprocessamento mostram simulação, quantidade, origem, risco, lote e resultado. Não usar botão genérico “corrigir tudo”.
4. E-mail de saída: conferir autorização e resultado estruturado, ID do provedor, erro e correlação; integrar outbox quando necessário. Teste real de destinatário é separado de verificação de configuração.
5. Inventariar módulos legados (inbox Microsoft/Trello/eventos) e variáveis Evolution no projeto Next; retirar referências mortas comprovadas e impedir execução de módulo desabilitado. Não desinstalar serviço/provedor ou apagar credencial por suposição.

**Aceite:** configuração parcial não apaga campos; estado configurado não é chamado de teste bem-sucedido; parâmetros preservam relatórios históricos; operações de manutenção têm simulação obrigatória e autorização server-side.

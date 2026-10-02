# Caderno 1 — Fundação e segurança

Ler PLANO-MESTRE.md e o checkpoint antes deste caderno. Caminhos abaixo são relativos à raiz Git escolhida em F00. As dependências formais estão em CONTROLE.md. Os achados S01–S07 referem-se à auditoria.

## F00 — Escolher a base e preservar trabalho existente

**Problema:** a versão publicada, a cópia principal e o preview contêm estados diferentes. Começar na cópia errada pode apagar mudanças ou ressuscitar defeitos.

**Passos**

1. Ler AGENTS.md aplicáveis, git status, branch, HEAD, worktrees e diff dos arquivos envolvidos. Não ler nem copiar valores de .env para o relatório.
2. Registrar a versão publicada e a referência atual de main, sem assumir que continuam nas versões de 26/09. Usar consultas de versão somente leitura.
3. Escolher um checkout isolado baseado na main atual para as correções. Se já houver checkout desta execução, reutilizá-lo. Registrar caminho/base no controle e copiar apenas este pacote de documentação. Não copiar .env.local.
4. Inventariar mudanças úteis do preview, especialmente Tabela/importação, layout e Jobs. Transportar mais tarde somente trechos pertinentes, com revisão; não fazer merge cego da árvore suja.
5. Rodar baseline unitário com URLs fictícias e auditores estáticos. Capturar falhas preexistentes de lint/tipos/build separadamente; não atribuí-las a esta execução.

**Aceite:** checkout e base identificados; alterações prévias preservadas; baseline com comandos/exit code; nenhuma divergência de negócio absorvida silenciosamente.

**Checkpoint:** caminho absoluto do checkout de execução, hash base, estado inicial e lista das mudanças que serão reaproveitadas em U01/U02.

## F01 — Ambiente de integração sintético e verificável

**Arquivos:** package.json, vitest.config.mts, prisma.config.ts, scripts/guarda-banco.mjs, scripts/verificar-rls.mjs, tests/unit. Configuração e testes de integração novos se ainda não existirem.

1. Conferir os scripts reais: o comentário de Vitest menciona test:integration, mas esse script não existia no pacote auditado.
2. Preparar Postgres descartável local, ou ambiente de teste explicitamente identificado. Criar duas organizações A/B, pessoas de cada papel, usuário multiempresa, vínculo revogado, organização inativa, demandas e mídia fictícias.
3. Introduzir comando de integração que exija destino de teste explícito, confira host E nome do banco e recuse fallback para .env.local. Destino remoto exige ser um ambiente de testes previamente confirmado. ROLLBACK não torna um script de escrita “somente leitura”.
4. Isolar adaptadores de WhatsApp, e-mail, Drive, Storage e IA. Suíte de integração não usa credenciais reais nem faz chamadas externas. Testar código real contra banco real para transações, constraints, fila e RLS.
5. Preparar fixtures para status/transições, datas limítrofes, arquivo privado e custos conhecidos. Instalação do banco/migrations deve passar pelas guardas existentes. Se Postgres estiver indisponível, manter esse impedimento explícito e continuar somente tarefas que não exigem essa prova.

**Aceite:** uma consulta/transação real em A/B funciona no banco isolado; tentativa de rodar contra configuração padrão/remota não identificada falha antes de escrever; adaptadores registram efeitos sintéticos.

**Comandos unitários de referência:** npm test, npm run auditar:tenancy, npm run auditar:perfil-global e git diff --check. Usar DATABASE_URL/DIRECT_URL fictícias explícitas nos unitários. Criar e documentar o comando de integração, não inventar que ele já existe.

## S01 — Contexto de acesso revalidado

**Achados:** S05 e parte de S02. **Arquivos:** src/lib/org.ts, permissoes-server.ts, permissoes.ts, papel.ts, prisma-auth.ts, escopo-demanda.ts e respectivas rotas consumidoras.

1. Corrigir getOrgId: cada candidato cookie/JWT/fallback precisa de vínculo atual, usuário ativo e organização ativa. Sem identidade ou vínculo válido, negar; não confiar no papel global.
2. Tornar seleção inválida explícita: cookie de empresa removida não deve provocar escrita silenciosa em outra empresa. Responder necessidade de seleção/acesso negado nas mutações; para sessão legada sem seleção, resolver somente vínculo validado.
3. Criar ou consolidar helper de fronteira que devolva contexto verificado (ator, organização, papel do vínculo, permissões). Reutilizar permissoesEfetivas e acrescentar a verificação de empresa ativa, ausente na consulta revisada.
4. Evitar recursão com RLS: resolução inicial usa prismaAuth com acesso mínimo; consultas de negócio usam o contexto já resolvido. Distinguir identidade humana e identidade técnica de cron/webhook.
5. Inventariar consumidores de getOrgId e ehGestor(session); corrigir os que concedem autoridade pelo JWT/tipo global. Não basta alterar um helper e supor que todas as APIs estão protegidas.

**Testes:** JWT de vínculo removido negado; pessoa inativa negada; empresa inativa negada; admin global com papel executor em B não vira gestor; cookie forjado não muda destino; multiempresa troca legitimamente; falha de consulta nega acesso.

**Aceite:** teste de revogação cobre handler protegido real. 401 sem sessão, 403 sem capacidade, 404 para recurso fora do escopo conforme padrão da API. Nenhuma mutação é executada após negação.

## S02 — Configuração sem segredos e sem perda por atualização parcial

**Achado:** S01. **Arquivos:** src/app/api/config/empresa/route.ts, consumidores dessa rota, schema ConfigEmpresa, src/lib/secret-crypto.ts.

1. Mapear consumidores privados e os que precisam somente de identidade visual/dados de faturamento permitidos. Separar respostas pública, operacional e administrativa por allowlist explícita. Não devolver uma linha Prisma inteira.
2. Configuração privada obtém organização do contexto S01. Público usa slug validado e somente branding; dados de NF ficam vinculados a contrato/convite autorizado quando necessários, não públicos por conveniência.
3. GET/POST nunca retornam refresh token, API key ou segredo de webhook. A tela recebe apenas presença e estado da integração.
4. Validar payload com schema, rejeitar campos desconhecidos sensíveis e implementar semântica parcial: campo ausente conserva valor; null apaga somente quando permitido. Hoje um POST só de pasta Drive pode zerar campos fiscais.
5. Preparar armazenamento cifrado versionado para Drive, compartilhando infraestrutura de segredo sem mudar silenciosamente a chave de e-mail. Manter leitura de legado apenas no servidor até migração validada.

**Testes:** A não consulta configuração de B; solicitante não vê configuração administrativa; GET/POST não contêm token nem campos extras; alterar pasta não limpa CNPJ; falha de cifra não grava texto puro; payload tentando alterar organização/segredo é rejeitado.

**Aceite:** substituir a reprodução diagnóstica por teste de proteção na suíte normal. Preparar reconexão/rotação como operação posterior, não executar no cartão.

## S03 — Permissão em todas as APIs críticas

**Achado:** S02. **Arquivos:** api/custos-videomaker/**, api/producao*, api/relatorios/**, api/ia/**, api/configuracoes/** e APIs de pessoas/permissões.

1. Fazer matriz rota/método → capacidade → escopo → campos retornados. Usar as chaves existentes quando suficientes.
2. Leitura financeira exige verCustos; relatório exige verRelatorios; IA exige verIA e limites posteriores O06; configuração administrativa exige gerenciarConfig; alteração de pessoas exige gerenciarUsuarios.
3. VerCustos não concede automaticamente editar/aprovar/pagar. Até existir permissão de ação granular, essas mutações ficam para gestor/admin DO VÍNCULO. Preservar o acesso separado do externo à própria NF/contrato mediante escopo específico.
4. Verificar ownership de todos os IDs recebidos, inclusive videomaker, demanda, arquivo e custo. Um ID válido em outra empresa é inválido neste contexto.
5. Relatórios agregados não incluem CPF/CNPJ/PIX. Retornar campos fiscais apenas nos fluxos autorizados que os utilizam.

**Testes:** matriz de papéis chamando handlers diretamente; GET autorizado/POST proibido; pedido de IA negado não chama provedor; custo de B não é lido/editado por A; externo só altera sua obrigação e campos permitidos.

**Aceite:** matriz anexada às evidências, nenhuma autorização baseada apenas em menu/middleware. Não criar permissões novas sem necessidade; se houver, atualizar schema, presets, UI e testes juntos.

## S04 — OAuth com vínculo de sessão e chave estável

**Achado:** S04. **Arquivos:** api/auth/setup-drive/route.ts, callback/route.ts, test/route.ts, helper Google existente, secret-crypto.ts.

1. Início exige gerenciarConfig e empresa verificada. Gerar nonce criptograficamente aleatório, com TTL curto; persistir hash, ator, empresa e estado de uso no servidor. Não usar Map em memória numa função serverless.
2. Callback exige sessão, mesmo ator/empresa e autorização atual. Validar estado expirado, consumido ou divergente antes de trocar code. Consumir nonce atomicamente; tentativa falha requer reiniciar conexão.
3. Não permitir retorno para URL arbitrária. Não aceitar fallback setup-drive:<org>. Tratar troca de empresa durante OAuth como erro recuperável.
4. Criptografar refresh token com formato/key version explícitos; preservar token existente quando provedor não enviar novo. Nunca trocar chave de sessão e pressupor que segredos cifrados continuarão legíveis.
5. Preparar migração com leitura de legado e regravação idempotente, inventário de cobertura e reconexão para ilegíveis. Não executar contra produção aqui.

**Testes:** nonce repetido, expirado, sem sessão, de outra empresa/pessoa e concorrência de dois callbacks; nenhum deles altera configuração. Round trip e rotação de chave com token sintético. Fluxo permitido salva token sem expor ao cliente.

**Aceite:** testes de atomicidade em F01 e checklist de conexão real reservado para L02. Não reduzir escopo OAuth sem conferir o conjunto de operações Drive efetivamente necessário.

## S05 — Autorizar ferramentas da secretária no código

**Achado:** S03. **Arquivos:** src/lib/ia-tools-executor.ts, claude.ts, api/ia/** e api/whatsapp/webhook/route.ts.

1. Trocar executor (nome, argumentos, org) por contexto obrigatório e verificado: ator/tipo, empresa, capacidades, escopo e destinatário autorizado.
2. Criar uma política por ferramenta: consultas de demanda usam escopo-demanda; métricas exigem permissão; alteração exige transição válida; envio não aceita telefone arbitrário sugerido pelo modelo.
3. Separar ferramentas de sistema e de conversa. Cron recebe principal técnico restrito; ele não vira admin humano nem executor genérico sem organização.
4. Identificação WhatsApp deve partir da instância/empresa e número normalizado completo ou LID mapeado com origem verificável. Eliminar match global apenas por sufixo. Contato desconhecido pode fornecer dados para pedido restrito, mas não buscar informações internas.
5. Verificar também chamadas internas e JSON malformado. Prompt pode orientar linguagem; não decide a autorização.

**Testes:** prompt pede métricas com executor → negado; org/ator/telefone forjados nos argumentos → ignorados/rejeitados; demanda de B → negada; contexto ausente → erro; cron restrito não obtém ferramentas financeiras; contato desconhecido não enumera jobs/pessoas.

**Aceite:** todos os chamadores do executor migrados e buscas por assinatura antiga vazias. Sem envio real.

## S06 — Publicação explícita e acesso à mídia

**Achado:** S07. **Arquivos:** api/publico/galeria/route.ts, api/growth/galeria/route.ts, api/midia/[...caminho]/route.ts, src/lib/midia.ts, schema Arquivo/Demanda e páginas galeria.

1. Separar biblioteca autenticada de portfólio público. Reutilizar metadados existentes; se faltar, criar publicação por entregável com publicadoEm, publicadoPor e revogação. Padrão novo: privado.
2. Público só lista/assina itens explicitamente publicados. Finalizado/para_postar não são consentimento de divulgação.
3. Leitura privada exige escopo da demanda/arquivo, não apenas empresa no caminho. Compartilhamento com parceiro passa pela aresta válida e seus campos permitidos.
4. URL assinada curta só depois da autorização; resposta sensível sem cache público compartilhado. Impedir traversal e validar caminho/objeto pertencente ao registro.
5. Preparar inventário de links existentes e impacto da mudança para release. Não converter todos os históricos para publicados para conservar o contador.

**Testes:** final privado não aparece anonimamente; publicação habilita somente o item; revogar impede novas assinaturas (URL já emitida vence no TTL); A/B e parceria revogada negam; NF/briefing não entram na galeria.

**Aceite:** preserva biblioteca interna e apresenta explicitamente o impacto sobre links públicos na revisão de release.

## S07 — RLS comprovado com role do runtime

**Achado:** S06. **Arquivos:** prisma.ts, prisma-auth.ts, prisma-admin.ts se existente, org-contexto.ts, migrations de RLS, scripts/verificar-rls.mjs.

1. Ensaiar roles existentes no Postgres isolado: app sem ownership/BYPASSRLS, autenticação com grants mínimos e administração limitada aos caminhos técnicos.
2. Testar app.org_id dentro da mesma transação/conexão, inclusive $transaction em lote e callback. Requisições concorrentes A/B e reutilização de pool não podem misturar contexto.
3. Ausência de organização deve negar tabelas privadas. Testar selects, writes, joins, nested writes e SQL cru dos caminhos existentes; não depender apenas da consulta feliz em demandas.
4. Cobrir novas tabelas de OAuth/auditoria. Tabelas criadas depois também precisam de RLS no próprio cartão.
5. Preparar ordem de configuração de DATABASE_URL, AUTH_DATABASE_URL, ADMIN_DATABASE_URL e RLS_ATIVO, com prova somente leitura do role em homologação. Falta de credencial real deixa prova de runtime publicado pendente, sem exportar segredos.

**Aceite:** integração real A/B sob role sem bypass, login e callbacks funcionam no ensaio. Não ligar somente a flag em produção nem aceitar verificador executado como administrador como prova do runtime.

## S08 — Auditoria de ações sensíveis

**Arquivos:** api/auditoria/route.ts, schema, serviços corrigidos em S01–S06; aproveitar HistoricoStatus sem sobrecarregá-lo com outro significado.

1. Criar serviço/evento mínimo: organização, ator humano/técnico, ação, recurso/id, resultado, timestamp, correlationId e antes/depois com allowlist.
2. Registrar mudanças em permissões, configuração, OAuth, publicação e manutenção; retrointegrar S02–S06. Não prometer recuperar auditoria histórica que nunca foi gravada.
3. Escrita de negócio sensível e evento devem ser atômicos quando no mesmo banco. Efeito externo usa intenção/resultado e correlação, sem fingir transação distribuída.
4. Proteger leitura e impedir edição/exclusão pelo app comum. Sanitizar valores e limitar retenção de payload; não usar IA para explicar cada evento.

**Testes:** alteração bem-sucedida gera um evento; rollback não deixa sucesso; retry não duplica evento de negócio; A não lê B; nenhuma chave/token/fiscal sensível no JSON; tentativa negada usa evento seguro quando identificável.

**Aceite:** serviço testado e eventos críticos presentes; interface completa fica em U06.

## Saída do caderno

Preparar um diff/candidato de segurança separado, com matriz de acessos, SQL aditivo, prova sintética e impacto de configuração/publicação. Não misturar o fechamento da exposição de segredos com um redesign amplo. As validações reais de chave, OAuth e runtime são gates de L02.

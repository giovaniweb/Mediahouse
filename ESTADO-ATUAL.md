# Mapa de Estado — NuFlow

Documento de retomada de contexto. Última atualização: **18/08/2026**.
Escrito para ser lido no início de uma sessão nova, antes de tocar em código.

- Repo: `giovaniweb/Mediahouse` · projeto em `videoops/` · produção: **nuflow.space**
- Stack: Next.js 16 (App Router, Turbopack) · Prisma 7 (adapter PrismaPg) · Supabase Postgres · NextAuth (JWT, **Credentials**) · Tailwind v4 · Vercel (região `gru1`)
- Branch de trabalho: `correcoes/estabilidade-e-auditoria`. `main` deploya para produção sozinho.
- Comando entregue ao Giovani **precisa** começar com `cd /Users/giovanigomes/MediaHouse/videoops &&` — o terminal dele abre na pasta-mãe.

---

## 1. Módulos concluídos e em uso

**Audiovisual (o núcleo).** Demanda do pedido à entrega: criação com anexo PDF/DOC, aprovação interna, triagem, atribuição de videomaker/editor, captação, edição, aprovação de vídeo com player (timecode, versão anterior, decisão fixa), postagem, entrega. Três visões — Kanban, Lista, Tabela — com abas rápidas incluindo "Criadas por mim". Histórico de edição e atribuição, comentários com menção `@`, importação de planilha (colar do Excel) virando cards.

**Growth / conteúdos.** Área própria (`area: "design"`), kanban próprio, aprovação de arte separada da de vídeo, galeria de criativos. `isGrowthDemand` é decidido **só por área**, nunca por departamento.

**Multiempresa.** Duas organizações reais: `contourline` e `empresa-teste`. Escopo por `organizacaoId` em toda parte, com auditor estático como gate. `UsuarioOrganizacao` guarda papel, categoria, função, áreas e `liderAudiovisual`.

**WhatsApp.** Evolution API no Railway. Envio com registro de falha e motivo, contador e tela de reenvio (`/mensagens-falhadas`). Webhook autenticado por segredo cifrado. Taxa de falha em ~1,5% (era 82%).

**Notificações e agentes.** 7 agentes em cron: `alertas`, `prazos`, `vistoria`, `limpeza`, `cobranca`, `lembretes`, `briefing`. Notificações rodam em `after()` via `emSegundoPlano()`.

**Páginas públicas por token** (abertas por gente sem conta): `/aprovar/[token]`, `/d/[token]`, `/fornecedor`, `/nf-upload`, `/relatorio-executivo`, `/galeria`, `/campo`, `/convite`.

**Congelados por flag** em `src/lib/modulos.ts`: `EVENTOS_ATIVO = false`, `MENSAGENS_ATIVO = false`. `GROWTH_ATIVO` e `IDEIAS_ATIVO` ligados. O código e os dados continuam lá — bloqueio é de rota.

---

## 2. Estrutura de arquivos

```
src/app/
  (dashboard)/     ~27 páginas internas: demandas, aprovacoes, dashboard, agenda,
                   produtos, custos, ia, alertas, relatorios, usuarios,
                   configuracoes, ideias, galeria-artes, design, growth,
                   coberturas, videomakers, equipe, mensagens-falhadas, ...
  (auth)/          login, redefinir-senha
  (public)/        institucional
  api/             rotas REST espelhando os módulos
  aprovar/ d/ fornecedor/ nf-upload/ relatorio-executivo/ galeria/ campo/ convite/
                   ↑ páginas de token público, FORA do (dashboard)

src/lib/           ~60 módulos. Os que importam mais:
  prisma.ts        singleton
  org.ts           getOrgId, pertenceAOrg, requireDemandaOrg — base do isolamento
  permissoes.ts    PermissaoKey, PRESETS por papel, PERMISSAO_HREF_MAP
  status.ts        STATUS_PARA_COLUNA, TRANSICOES_VALIDAS (client-safe)
  alertas.ts       resolução automática de alerta (NOVO nesta sessão)
  parados.ts       bloco de cobrança do briefing (NOVO nesta sessão)
  fetcher.ts       fetcher único do SWR — checa res.ok, redireciona sessão caída
  notificar.ts     emSegundoPlano() = after() do next/server
  whatsapp.ts      envio + templates
  modulos.ts       flags de módulo congelado
  ia-tools-executor.ts   ferramentas dos agentes de IA
  departamentos.ts, tipos-demanda.ts, planilha.ts, historico.ts, pessoas-ui.ts

src/components/    aprovacao/ aprovacoes/ configuracoes/ dashboard/ demandas/
                   foco/ kanban/ layout/ pessoas/ publico/ ui/ videomakers/
  demandas/        DemandaDetalhe (compartilhado entre page e modal), tipos-visao,
                   DemandasLista, DemandasTabela, BarraVisao, Comentarios,
                   ImportarPlanilhaModal, BriefingResumido
  foco/            PainelExecutor (painel minimizável do executor)

scripts/
  auditar-tenancy.mjs      gate de isolamento; 2 regras (ver seção 5)
  tenancy-allowlist.json   dívida conhecida: 33 arquivos, SÓ PODE ENCOLHER
  guarda-banco.mjs         barra escrita em produção sem PERMITIR_BANCO_PRODUCAO=sim

prisma/
  schema.prisma            ~60 modelos, ~36 enums
  migrations/              11 migrations + 0_init (baseline)
  faxina-alertas.ts        npm run faxina:alertas [-- --aplicar]

tests/unit/                15 arquivos, 182 testes (vitest)
.github/workflows/ci.yml   tsc + lint + testes + auditor + migrations + build
SEGURANCA.md               as 6 CVEs transitivas e por que não são alcançáveis
```

---

## 3. Banco de dados — resumo lógico

**Conexão.** `.env.local` = **PRODUÇÃO** (Supabase). `.env` = dev local. O
`prisma.config.ts` carrega `.env.local` primeiro, então **todo comando de Prisma
aponta para produção por padrão**. `DIRECT_URL` (porta 5432) para DDL,
`DATABASE_URL` (6543, pooler) para consulta. Escrita passa por
`scripts/guarda-banco.mjs`.

**Eixo central: `Organizacao`.** Quase todo modelo tem `organizacaoId`. `Usuario`
é global e se liga por `UsuarioOrganizacao` (papel, categoria, funcaoProfissional,
areas[], liderAudiovisual) — é aí que mora a permissão por empresa, não no
usuário.

**`Demanda`** é o modelo central. Campos que importam entender:
- `area` (`audiovisual` | `design`) — **decide a interface**, não o departamento
- `departamento` — texto livre validado contra `ConfigParametro` (grupo `departamentos`); era enum, virou tabela para caber CRM/Sistema
- `statusInterno` (~27 valores) × `statusVisivel` (6 colunas do kanban), ligados por `STATUS_PARA_COLUNA`
- responsáveis: `responsavelId` (1) **e** `DemandaResponsavel` (N) — 48 demandas têm mais de um; nunca sobrescrever cegamente
- `publicToken` + `publicTokenAtivo` + `publicTokenExpiraEm` para a página pública

**Videomaker em 3 camadas** (decisão de LGPD, respeitar):
- `Videomaker` — perfil global, compartilhado entre empresas (nome, cidade, avaliação, habilidades, telefone)
- `VideomakerOrganizacao` — comercial por empresa (`valorDiaria`, `status`, `tipoContrato`, `emListaNegra`)
- `VideomakerDadosFiscais` — cifrado

Vocabulário obrigatório: **"videomaker interno"** e **"videomaker externo"**. Nunca inventar sinônimo.

**`AlertaIA`** serve duas telas ao mesmo tempo: Central de Alertas (`status`) e o
sino (`lida`). `tipoAlerta` é string livre — a ferramenta `criar_alerta` da IA
grava o que o modelo escolher, então existem tipos na base que não aparecem em
lugar nenhum do código.

**Outros grupos:** WhatsApp (`ConfigWhatsapp`, `MensagemWhatsapp`,
`ContatoWhatsApp`, `MapaLidWhatsApp`), custos (`CustoVideomaker` com
`StatusPagamento`), eventos (`EventoGestao*`, `EventoCobertura*` — módulo
congelado), e-mail de entrada (`ConfigEmailEntrada`, `EmailEntrada`).

---

## 4. O que esta sessão fez

Rodadas 4 e 5, tudo mergeado em `main` (PRs #13, #14, #15) e em produção.

**Rodada 4 — nivelar as duas frentes**
- **Vazamento entre empresas fechado.** `buscarVideomakers` recebia `organizacaoId` e ignorava: a IA de uma empresa via demandas e custos somados de outra, e lia a diária do perfil global em vez do vínculo. A rede compartilhada continua; o que é de uma empresa passou a ser escopado.
- **Regra nova no auditor.** Ele decidia por arquivo (se o arquivo citasse organização, passava) — foi por essa fresta que o bug acima escapou. Agora função que **recebe** `organizacaoId` e não usa é erro. Verificado contra o código anterior: falha lá, passa aqui.
- **Demanda urgente voltou a poder ser aprovada.** A tela mandava para `/api/urgencias/[id]/acao`, rota que nunca existiu; a rota de aprovar recusava o status com 400. Urgente não podia ser aprovada nem recusada por caminho nenhum. Agora a rota atende as duas filas e urgência aprovada vai para `urgencia_aprovada`/produção.
- **Consolidação.** As 9 cópias locais do fetcher do SWR passaram a usar `lib/fetcher.ts` (a de `usePermissoes` degradava a interface calada com sessão expirada). `iniciais` tinha 3 versões divergentes, ficou 1 (`pessoas-ui.ts`). Removidas `/designers` e `/urgencias` (órfãs). `SEGURANCA.md` criado.

**Rodada 5 — o alerta volta a significar alguma coisa**
- **Diagnóstico:** 706 alertas "ativos" de 751, só 18 resolvidos em toda a história, o mais velho ativo há 151 dias, e 172 dos 173 `aprovacao_pendente` falavam de demandas já aprovadas. A tela existia, funcionava e era inútil — o aviso verdadeiro estava enterrado entre os falsos.
- **`src/lib/alertas.ts`:** cada tipo de pendência sabe dizer se ainda vale; fato e **tipo desconhecido** expiram por idade (7 dias). Roda em `emSegundoPlano()` em 4 pontos de mutação + varredura completa no cron `alertas`.
- **Faxina aplicada em produção:** contourline **706 → 38**, empresa-teste **75 → 20**. As 4 pendências legítimas sobreviveram, zero falsa restou.
- **Briefing diário passou a cobrar o que está parado.** O agente `briefing` já existia (11h, WhatsApp aos gestores) e dizia 3 números, nenhum sobre parados. Agora diz: quantas cruzaram 7 dias hoje, quantas param no total e a idade da pior, e os 3 códigos mais antigos. Entrou o líder audiovisual entre quem recebe; saiu a "dica do dia".
- Motivo de o canal ser o briefing e não um alerta novo: **o briefing recalcula da tabela toda manhã, não tem como envelhecer** — que é exatamente a doença do alerta.

**Dois furos meus, achados olhando a base antes da faxina** (valem como aviso de método): `demanda_parada` (274 alertas) só fechava com a demanda encerrada, e o resolvedor só varria tipos declarados no código — deixando de fora ~80 alertas de 12 tipos que a IA inventou. Sem isso a faxina teria fechado ~420 e deixado ~350 de pé.

**Processo combinado no fim:** eu volto a fazer o merge em `main` e o push, depois de rodar a bateria. Giovani só entra no que eu não consigo executar (trava de produção, `vercel env`).

---

## 5. Pendências e fios soltos

**Foco natural do próximo chat**

1. **As 63 demandas paradas continuam paradas.** 75 em `aguardando_triagem`, a mais antiga há 57 dias, 31 com prazo vencido antes de alguém pegar. As mais velhas são da **Julie** (53–54 dias) e da **Isabela** (38–42 dias) — as mesmas pessoas da reclamação. O briefing agora bota o número na frente de quem decide todo dia, mas **agir é decisão de operação, não de código**. Vale medir em ~1 semana se o número cai; se não cair, o problema não era visibilidade.
2. **Confirmar que a Central de Alertas não voltou a encher.** Se daqui a alguns dias estiver na casa das dezenas, o mecanismo funciona. Se voltou às centenas, algum tipo escapa do resolvedor.
3. **Comentários: 1 em toda a história do sistema.** A funcionalidade da R3 (comentário com menção) não pegou. Antes de reconstruir, **perguntar à Julie e à Isabela se sabem que existe**.
4. **Recebimento de WhatsApp:** 8 mensagens no dia 16/08, zero nos dias 17 e 18. Histórico: ficou mudo de 23/03 a 15/08. Pode ser só fim de semana sem mensagem, ou o celular desparear de novo — conferir `ConfigWhatsapp.telefoneConectado` (o `lastStatus: "open"` mente sem aparelho pareado).

**Dívida conhecida, deliberadamente adiada**

- **`tenancy-allowlist.json` com 33 arquivos.** Meta é zero. A tarefa **F3.3 — wrapper api-guard + leitura agregada** (única pendente da fase antiga) derrubaria um bloco.
- **Subir `next-auth` de versão** (está em `5.0.0-beta.30`). Mexe na autenticação inteira; merece janela própria com login testado em todos os papéis. É o que destrava 3 das 6 CVEs do `SEGURANCA.md`.
- **151 avisos de lint** (0 erros). A CI só falha em erro. A maioria é ruído.
- **Apagar as colunas antigas de `Videomaker`** (`valorDiaria` e afins no perfil global). Depois da R4.1 não são mais lidas, mas o DROP é irreversível — janela própria, com backup conferido.
- **`/api/urgencias` ainda consta como rota congelada** em `modulos.ts` sem existir. Inofensivo, mas é sujeira.
- **Página de detalhe da demanda:** auditada, já é o mockup na estrutura. Reescrever seria churn.

**Práticas a manter (custaram caro para aprender)**

- Conferir o destino antes de escrever no banco — Prisma aponta para produção por padrão (incidente de 14/08).
- Teste em produção usa `empresa-teste`, nunca Contourline. Apagar os artefatos e **rotacionar a senha do `teste-admin@nuflow.local` para valor aleatório não registrado** ao terminar.
- Turbopack serve CSS velho: quando o estilo não chega no navegador, `rm -rf .next`.
- Pedido só de Growth = não tocar audiovisual nem arquivo compartilhado que o sirva.
- O critério de produto é **simples e leve**. ClickUp é o contra-exemplo; recurso a mais é defeito. A R5 é o exemplo do padrão certo: consertar o que existe em vez de somar mecanismo novo.

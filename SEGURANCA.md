# Segurança

## Vulnerabilidades conhecidas e por que seguem em aberto

`npm audit` aponta 6 alertas de severidade alta. Todos são **transitivos** —
nenhum é código nosso, e nenhum vem de dependência que escolhemos diretamente
pelo pacote vulnerável. Conferimos cada um e nenhum é alcançável na forma como o
NuFlow usa a biblioteca. Registrado aqui para que a próxima pessoa que rodar
`npm audit` não precise repetir a investigação — e para que a decisão seja
revisada quando as condições mudarem, não esquecida.

Última revisão: **18/08/2026**.

---

### 1–3. `nodemailer` → `@auth/core` → `next-auth`

**O alerta:** a opção `raw` no nível da mensagem contorna
`disableFileAccess`/`disableUrlAccess`, permitindo leitura arbitrária de arquivos
e SSRF completo na mensagem entregue.

**Por que não é alcançável aqui:** o `nodemailer` só entra no `@auth/core` pelo
provider de e-mail (magic link). O NuFlow autentica **exclusivamente com
Credentials** (`src/lib/auth.ts`) — não há provider de e-mail configurado, e
`nodemailer` não é importado em lugar nenhum do `src/`. O código vulnerável não
é carregado.

O e-mail que o sistema realmente envia (notificação de demanda, reset de senha)
vai por **Resend**, que é outra biblioteca e não está no alerta.

**O que dispararia a revisão:** adicionar login por magic link ou qualquer
provider de e-mail ao NextAuth. Nesse dia, subir a versão vira pré-requisito,
não opção.

**Por que não subimos agora:** o `next-auth` está em `5.0.0-beta`. Subir mexe na
autenticação inteira, e isso pede uma janela só dela, com login testado ponta a
ponta em todos os papéis — não no meio de uma rodada com outras dez mudanças.

---

### 4–6. `deepmerge-ts` → `@prisma/config` → `prisma`

**O alerta:** esgotamento de pilha ao mesclar grafos de objeto recursivos.

**Por que não é alcançável aqui:** `@prisma/config` lê `prisma.config.ts` em
**tempo de build e de CLI**. Não roda em requisição, não processa entrada de
usuário, e o único objeto que ele mescla é o nosso arquivo de configuração, que
é estático e não é recursivo. Para explorar isso alguém precisaria já ter
permissão de escrever no repositório — e nesse ponto o `deepmerge-ts` é o menor
dos problemas.

**O que dispararia a revisão:** passar a montar configuração do Prisma a partir
de dado externo em runtime. Não há plano disso.

**Por que não subimos agora:** o Prisma 7 é recente e a correção ainda não saiu
numa versão estável do `@prisma/config`. Quando sair, é um bump de patch sem
risco — este é o primeiro a subir dos seis.

---

## Como revisar

```bash
npm audit
```

Se aparecer alerta que **não** esteja nesta lista, ele é novo: investigue antes
de assumir que é ruído. Se um alerta daqui mudar de forma (novo vetor, deixa de
ser transitivo, passa a ter correção estável), atualize a seção e a data acima.

---

## Barreiras automáticas já no lugar

Estas rodam sozinhas e não dependem de alguém lembrar:

| O quê | Onde | O que pega |
|---|---|---|
| Auditor de tenancy | `scripts/auditar-tenancy.mjs` | consulta ao banco sem escopo de organização; função que recebe `organizacaoId` e não usa |
| Testes de isolamento e IDOR | `tests/` | acesso a dado de outra empresa por id direto |
| Allowlist de dívida | `scripts/tenancy-allowlist.json` | **só pode encolher** — entrada nova exige justificativa |

O auditor decide por arquivo: se o arquivo cita organização em algum lugar,
confia na revisão humana. Foi por essa fresta que `buscarVideomakers` passou
(recebia `organizacaoId` e ignorava, devolvendo demandas e custos de outra
empresa para a IA). A segunda regra existe por causa desse caso concreto.

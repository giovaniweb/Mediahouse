# NuFlow

Plataforma SaaS de gestão de produção audiovisual.

## Desenvolvimento

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Caixa de Entrada Microsoft 365

A Caixa de Entrada conecta diretamente o NuFlow ao Microsoft 365. Não usa
Power Automate ou Zapier. E-mails são persistidos antes do parsing, deduplicados
pelo ID da Microsoft e retomados na próxima sincronização em caso de
indisponibilidade.

### Configuração no Azure

1. Crie um App Registration no Microsoft Entra ID.
2. Adicione uma plataforma Web com a redirect URI
   `https://SEU_DOMINIO/api/email-inbox/callback`.
3. Adicione permissões delegadas: `User.Read`, `Mail.Read`,
   `Mail.Read.Shared` e `offline_access`.
4. Crie um Client Secret.
5. Configure no ambiente:

```bash
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=common
EMAIL_ENCRYPTION_KEY=
CRON_SECRET=
```

O cron `/api/cron/email-inbox` consulta as caixas ativas a cada cinco minutos.
Cada organização conecta sua própria conta na página **Caixa de Entrada**.

# S04 — operação da conexão Drive

Implementado em 28/09/2026, validado com PostgreSQL descartável e respostas Google simuladas. Este documento prepara L02; não comprova conexão, sincronização ou migração de credenciais em produção.

## Comportamento entregue

Início e retorno OAuth exigem `gerenciarConfig` atual. O estado aleatório expira em dez minutos e seu hash é persistido com ator e empresa; cookie HttpOnly vincula o retorno ao navegador. Consumo atômico impede duas trocas de token para o mesmo estado. Troca de empresa, perda de acesso, expiração ou falha do provedor exigem iniciar novamente.

Novos refresh tokens usam AES-256-GCM, versão e identificador de chave, com autenticação vinculada à empresa. Dados fiscais são preservados. Sem novo refresh token, o anterior só pode ser mantido para a mesma conta Google. Duplicidade preexistente de configuração impede salvar e precisa de conciliação. O callback serializa autorizações concorrentes da mesma empresa, mas não cria uma restrição única global em ConfigEmpresa: outros escritores ainda precisam da revisão S02/S03.

O botão de teste passou de GET para POST e continua criando um arquivo. Não executar como simples verificação de leitura. Nenhum arquivo real foi criado neste lote.

## Preparação da publicação

1. Conferir o candidato completo e aplicar a migração aditiva `20260928000000_oauth_drive_estado` no destino autorizado. Ela cria tabela, índices, chaves estrangeiras e política RLS; não modifica credenciais existentes.
2. Configurar `INTEGRATION_ENCRYPTION_KEYS` como JSON de identificador para chave base64 canônica de 32 bytes e `INTEGRATION_ENCRYPTION_KEY_ID` com o identificador ativo. Gerar material aleatório em ambiente seguro e armazená-lo no gerenciador de segredos; não colar valores em documentação, chat ou logs. Manter o mesmo conjunto em todas as instâncias.
3. Conferir `NEXTAUTH_URL` como origem HTTPS, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e o redirect cadastrado `/api/auth/setup-drive/callback`. Não reutilizar nem rotacionar a chave de sessão ou a cifra de e-mail para cumprir este passo.
4. Publicar o código compatível com o novo formato. Credenciais legadas continuam legíveis no servidor durante a transição; novas gravações já são cifradas. Autorizações antigas em andamento precisam ser reiniciadas.
5. Validar runtime RLS com role sem bypass, login e autorização em conta/pasta de teste definida para L02. As provas locais não certificam o usuário de banco usado pela hospedagem.

## Migração e rotação

O comando exige DATABASE_URL e DIRECT_URL explícitos e iguais, empresa explícita e aprovação do guard existente. Não procura arquivo de ambiente como fallback. Executar primeiro simulação:

```sh
npm run db:cifrar-drive -- --org ID_DA_EMPRESA
```

Após revisar destino e inventário, a operação autorizada usa `--aplicar`. Cada chamada processa até cem registros; repetir com `--depois-de CURSOR` enquanto `proximoCursor` não for nulo. A saída contém apenas identificadores e estados, nunca tokens.

`a_cifrar` indica pendência; `cifrado` indica alteração; `ja_protegido` confirma leitura com chave atual. `alterado_concorrentemente` requer nova simulação, pois a rotina preservou uma gravação mais recente. `ilegivel_reconectar` exige conferir chaves disponíveis antes de reconectar: não apagar a credencial automaticamente. Registrar cobertura de todas as empresas e conciliar configurações duplicadas separadamente.

Na rotação, adicionar a nova chave, torná-la ativa e manter as anteriores durante a migração. Reexecutar o mesmo comando para recifrar. Só remover chaves antigas após comprovar cobertura e definir restauração dos backups que ainda dependem delas. O ensaio local comprovou idempotência, duas migrações concorrentes e leitura após remover a chave antiga de tokens já migrados.

Não voltar para uma versão que interpreta todo token como texto puro após gravar o primeiro token cifrado. Uma reversão precisa preservar o leitor versionado e as verificações de autorização, ou desativar a conexão até corrigir. Preservar tabela e chaves necessárias para recuperação.

## Checklist reservado para L02

- Conta/pasta de teste definida; conexão permitida salva sem expor token no cliente, URL ou logs.
- Repetição do callback e troca de empresa recusadas; reconexão recupera fluxo expirado.
- Conta retornada corresponde à escolhida e configuração fiscal permanece intacta.
- Leitura e operação de teste explicitamente autorizada funcionam; verificar e remover apenas os artefatos sintéticos criados.
- Simulação/migração com cobertura registrada e plano de recuperação disponível.

S04 protege a autorização, não entrega a sincronização M03. Escopo Drive amplo existente foi mantido até inventariar operações. Publicação de mídia, fallback de service account, filas, custos e limpeza periódica de estados expirados permanecem nos respectivos cartões. Expiração já impede uso do estado; a tabela ainda não tem rotina de expurgo.

## Referências verificadas

O vínculo de estado ao navegador segue o mecanismo descrito na documentação [OAuth para aplicações web](https://developers.google.com/identity/protocols/oauth2/web-server). A identificação usa [Drive about.get](https://developers.google.com/workspace/drive/api/reference/rest/v3/about/get) com `fields=user(emailAddress)`, compatível com o escopo existente. Como [User.emailAddress](https://developers.google.com/workspace/drive/api/reference/rest/v3/User) pode estar ausente em alguns contextos, ausência gera falha sem substituir a conexão anterior.

# Caderno 7 — Infraestrutura, validação e publicação

I01 e L01 pertencem à execução técnica. L02/L03 dependem da autorização operacional, dos ambientes e dos destinatários definidos. Preparar tudo que é revisável antes de solicitar a liberação concreta.

## I01 — Consumo atribuível e orçamento técnico

**Arquivos:** adaptadores de IA, mídia, Drive, WhatsApp/e-mail, painel da plataforma, configurações de worker e jobs.

1. Inventariar serviço → finalidade → ambiente → variável pelo nome → responsável → unidade de consumo. Não exportar segredos. Confirmar a que serviço/fatura o usuário chama “Huawei”; se não houver evidência, manter não identificado.
2. Instrumentar chamadas/tentativas por empresa; tokens por categoria; minutos de transcode; bytes originais/prévias; bytes de cópia/transferência conhecidos; duração/falha de worker e volume de jobs.
3. Separar medidas do app e fatura do provedor. Identificar consumo sem organização, despesas compartilhadas e rateio explícito. Soma parcial não é cobrança real.
4. Criar visão de capacidade/custo com preços datados e origem. Na ausência de fatura/preço, mostrar consumo e “custo não conciliado”; não bloquear instrumentação nem preencher preços arbitrários.
5. Dimensionar worker com os ensaios M02; limitar concorrência/memória/tempo; manter WhatsApp separado de conversão pesada. Configurar limite/alerta antes de contratar recurso novo.
6. Propor remoção de chamadas redundantes, payload menor, paginação e índices com medição. Não duplicar vídeo completo via Vercel sem necessidade. Não trocar Supabase/Vercel/Railway por palpite.

**Aceite:** consumo novo tem empresa/operação ou categoria explícita “compartilhado”; concorrência respeita teto; painel não promete economia de 92% da fatura a partir de 92% de tokens dos agentes. Entregar itens medidos, não medidos e custo esperado somente quando sustentado.

## L01 — Ensaio integrado e pacote revisável

Esta é a linha de chegada da execução técnica. Não significa produto publicado ou validado no uso real.

**Ambiente:** banco, Storage, provedores e chaves de teste separados. Preview da Vercel não é automaticamente isolado: conferir destinos antes de abrir fluxos que escrevem. Mocks servem para falhas de provedor; não substituem banco real nos testes de concorrência/RLS.

**Roteiros obrigatórios**

| Roteiro | Prova exigida |
| --- | --- |
| Isolamento | A/B: leitura, escrita, joins, mídia, relatório, financeiro, exportação, parceria revogada e usuário inativo |
| Segurança de configuração | Respostas sem segredos; OAuth nonce/sessão/empresa; atualização parcial preserva dados |
| Fluxo interno | Pedido → atribuição → execução → entrega → ajuste/aprovação → conclusão → relatório |
| Fluxo externo | Convite identificado → aceite único → entrega → NF → aprovação → pagamento confirmado |
| WhatsApp | Entrada persistida, duplicata, erro, retry, timeout ambíguo e recibo fora de ordem |
| Agenda | Horários diferentes, mudança/cancelamento, destinatários internos/externos e cron atrasado |
| Mídia | MOV/HEVC e MP4 → prévia privada, reinício, callback duplicado, cópia Drive sem duplicação |
| Custos | Competência, cobertura parcial, histórico de tarifa, múltiplas diárias e filtro completo |
| Interface | Desktop/celular, teclado, três tarefas de U02, estados vazio/carregando/erro e links antigos |
| Recuperação | Restaurar banco de teste e comprovar registros; validar referências e estratégia separada de backup dos objetos |

1. Rodar testes direcionados e suíte completa; auditores de tenancy/perfil; lint, tipos e build. Corrigir regressões. Falhas preexistentes devem ter prova e impacto, sem suppressions globais para pintar tudo de verde.
2. Rodar migrations novas do estado anterior para o novo no banco isolado. Conferir constraints/dados nulos/duplicados, custo de lock e ordem de aplicação. Não usar db push como substituto de migration versionada.
3. Ensaiar rollback de código compatível com schema expandido. Remoção de coluna, rotação de chave e exclusão de mídia têm tratamento próprio; não prometer desfazer com um git revert.
4. Fazer segunda leitura dos diffs S01–S07/O01/C02: autorização, concorrência, escopo e efeitos. Usar contraexemplos dos testes; não concluir só porque CI passou.
5. Preparar release por candidato, com hashes, SQL, alterações de configuração por nome, impacto, testes, passos de ativação, smoke e reversão. Incluir riscos ainda abertos e dono de cada verificação externa.
6. Produzir ENTREGA-TECNICA.md na pasta de execução: mudanças por cartão, testes/comandos/exit code, imagens de QA sem dados reais, migrations e limitações. Não incluir credenciais nem artefatos que exponham clientes em PR público.

**Aceite:** critérios locais e integrações sintéticas obrigatórias comprovados; migrations e plano de publicação revisáveis; pendências reais especificadas. Se teste de RLS/transação/worker necessário não rodou, não fechar L01 como sucesso.

**Pacote sugerido**

- Candidato A: segurança, configuração/OAuth, revogação, publicação explícita, relatório/filtro/galeria.
- Candidato B: fila, WhatsApp/regras, mídia/Drive e finanças.
- Candidato C: navegação, secretária, gestão e instrumentação.

Se um candidato depender de schema/helper de outro, registrar a dependência e manter compatibilidade; não separar artificialmente código que só compila junto. Preparar A assim que houver prova suficiente, sem esperar o redesign para tornar a correção de segredo revisável.

## L02 — Publicação e validação externa controlada

**Pré-condição:** autorização para o candidato concreto, destino correto, backup/recuperação definidos, conta/telefone/e-mail/pasta de teste identificados e configuração conferida por metadados. Se já houver autorização suficiente na conversa, não pedir novamente.

1. Apresentar candidato/diff/SQL/testes/configuração/impacto e reversão antes da liberação. Não publicar toda a árvore local com alterações alheias.
2. Manter migrations fora de build/preview. O workflow .github/workflows/release-migrations.yml usa disparo manual confirmado; respeitar essa fronteira. Expansão primeiro; código depois; contração em release futura.
3. Configurar roles/chaves/worker conforme o plano ensaiado, sem despejar valores em logs. Provar role do runtime e acesso mínimo; não inferir pela presença de variável.
4. Validar com contas de teste: OAuth/Drive e cópia privada; envio/entrada/recibo WhatsApp; e-mail; transcrição se habilitada; Railway/transcode. Uma operação real por fluxo antes de aumentar volume.
5. Migrar/cifrar credenciais e reconectar somente as contas autorizadas. Conferir cobertura antes de aposentar leitura legada. Exposição prévia de token exige decisão de rotação e avaliação de logs, não acusação de incidente sem prova.
6. Ativar automações por empresa piloto, com limites/opt-ins e horários. Nunca reenfileirar o histórico de 3.524 falhas indiscriminadamente.
7. Smoke de login, criar/editar/entregar, acesso privado, relatório e fila; observar erros/latência antes de ampliar. Registrar versão realmente publicada, não apenas “deploy iniciou”.

**Reversão:** interromper consumidores/ativação afetada, preservar jobs e evidências, voltar somente a código compatível e seguro. Não reabrir endpoint que vaza segredo nem tornar bucket público como rollback. Preferir correção adiante se a versão anterior era vulnerável.

**Aceite:** versão publicada confirmada; fluxos reais autorizados e recibos/arquivos comprovados; rollback operacional conhecido. Integração sem prova continua EXTERNA_PENDENTE e não aparece saudável.

## L03 — Piloto e decisão de venda

**Pré-condição:** L02 concluído para o escopo piloto. Plano inicial: um ciclo operacional incluindo pelo menos um relatório semanal, preferencialmente sete dias de uso. Não confundir alguns minutos de smoke com piloto.

1. Equipe piloto executa abrir pedido, aceitar job, entregar/aprovar e consultar custo. Medir tempo, cliques problemáticos, pedidos de ajuda e erros; corrigir fricção concreta.
2. Conciliar amostra de custos reais com responsável financeiro; revisar os zeros/desconhecidos. Cobertura insuficiente é declarada, não ocultada.
3. Conferir recebimento/entrega, eventos atrasados, duplicação, consumo de IA e jobs falhos. Pelo menos um exercício controlado de recuperação, sem prejudicar cliente.
4. Validar relatórios com registros de origem e fuso. Conferir retenção/publicação e que usuário revogado perde acesso efetivamente.
5. Registrar faturas/consumo fornecidos e capacidade medida. Definir limites do serviço e rotina de suporte compatíveis com custo observado.
6. Produzir parecer de liberação: funcionalidades aprovadas, limitações comunicadas, riscos em aberto e próximos ajustes. Não declarar certificação de segurança.

**Critérios para venda:** nenhuma falha crítica de acesso conhecida aberta; isolamento e revogação comprovados; dados/indicadores reconciliados; falhas observáveis/recuperáveis; mídia privada e backup testados; fluxo de negócio por papel concluído; oferta comercial descreve somente o que foi validado.

**Não automatizar a passagem do tempo:** se o piloto precisar acompanhamento posterior, configurar continuidade/monitoramento apenas quando solicitado, com escopo e notificações definidos. Não ficar em loop consumindo modelo enquanto nada mudou.

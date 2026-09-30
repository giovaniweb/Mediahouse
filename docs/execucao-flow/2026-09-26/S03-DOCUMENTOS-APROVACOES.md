# S03 — documentos e aprovações de eventos

29/09/2026; base 16a85b0. Complementa S03-EVENTOS-FINANCEIRO.md, sem encerrar segurança de todo o módulo.

## Regras

- requireAcesso revalida vínculo e verEventos em POST/PATCH/DELETE de documentos e POST/PATCH de aprovações. Empresa vem da sessão, sem confiar no tipo global do usuário.
- Categoria contratos exige verFinanceiroEvento para criar, consultar, editar ou excluir. Orçamento/contrato em aprovação exigem a mesma permissão. Registros financeiros não autorizados retornam 404 em operações por ID; criação proibida retorna 403.
- Detalhe, contagens de lista/dashboard e resumo factual filtram contratos. URLs legadas inválidas não são retornadas como links navegáveis. Interface remove opções restritas.
- Decidir aprovações exige papel atual admin, gestor ou gestor_eventos. verEventos sozinho permite solicitar aprovações operacionais, não decidi-las. Em documentos, marcar aprovado/reprovado/finalizado exige esses papéis; um leitor não pode reabrir, substituir ou excluir documento já decidido.
- Aprovação só muda de pendente para aprovado/reprovado. Lock do evento serializa decisões concorrentes: primeira vence, divergência retorna 409. Retry da mesma decisão pelo mesmo ator, sem observação divergente, não duplica auditoria. Não existe reversão silenciosa de aprovação concluída.

## Validação e auditoria

- Schemas estritos validam tipo, status, tamanho, datas civis e links HTTP/HTTPS sem credenciais. Campos como aprovadoPor, eventoId e categoria na edição não são aceitos pelo cliente.
- Links não são buscados pelo servidor. Nenhuma varredura ou classificação por IA foi adicionada.
- Escrita e registro de auditoria na mesma transação; falha de registro reverte criação, alteração, exclusão ou decisão. Ações evento.documento / evento.aprovacao têm rótulos legíveis na consulta de auditoria.
- Registro contém ator, recurso, operação e estados; edição de documento inclui nomes dos campos alterados. Não copia nome do documento, URL, observações ou conteúdo. Retenção/consulta seguem a auditoria existente, sem promessa de imutabilidade ou retenção perpétua.
- Interfaces verificam erros HTTP antes de limpar formulário; decisões atualizam a lista mesmo após conflito. Controles de decisão/exclusão refletem o papel recebido do servidor.

## Evidências

687 unitários, 281 integrações e build webpack/tipos aprovados. Doze novas provas de isolamento/permissão, papel global divergente, visibilidade e contagens, URL insegura, datas inválidas, concorrência/idempotência, rollback e ausência de texto sensível na auditoria. Recorte final de documentos/auditoria repetido após adicionar rótulos e nomes de campos.

Lint sem erros/avisos nos arquivos alterados e auditores aprovados; aviso preexistente de face-api no build. Logs /private/tmp/nuflow-documentos-*.log. Sem schema/migration, tráfego externo, IA paga, mensagens ou deploy. Ensaio visual autenticado/runtime restrito deste recorte pendentes.

## Limites que permanecem

A categoria contratos é o marcador existente. Conteúdo financeiro cadastrado como briefing/outros, observações livres, logs antigos e arquivos externos não é identificado automaticamente. Não dizer que todo conteúdo financeiro está classificado/protegido. A autorização da URL no Drive/storage é independente: ocultar link não revoga compartilhamentos nem URLs já conhecidas.

Não foi adicionada segregação obrigatória entre solicitante e aprovador; um gestor autorizado pode decidir sua solicitação. Documentos não têm edição otimista: alterações autorizadas são serializadas e auditadas, mas a última edição pode substituir a anterior. Pedidos de criação repetidos ainda podem gerar registros distintos. Auditoria e fluxo não versionam o conteúdo de arquivos externos.

Próximo: tornar criação do evento/checklist/demandas atômica e auditada, evitando eventos parcialmente criados. Permanecem revisão de relações (fornecedores/produtos/responsáveis), exclusão/checklist legados e consistência do percentual persistido.

# Convites, aceite e proteção do custo automático — 01/10/2026

Base: 7dc4f33, branch melhorias/execucao-auditoria. Migração 20261001020000_condicao_convite aplicada somente ao PostgreSQL sintético na porta 55449. Nenhuma publicação ou comunicação externa.

## Entrega deste bloco

Importação de planilha definitivamente retirada: parser e testes exclusivos removidos após conferir ausência de consumidores. Kanban e Lista permanecem; o endpoint antigo responde 410 autenticado. Upload de documentos continua aceitando planilha como anexo, o que não cria demandas nem reintroduz importação.

`src/lib/convites.ts` concentra emissão e resposta dos convites formais. O link público, as respostas SIM/NÃO no inbox e a ação do job usam o mesmo aceite. A linha da demanda é bloqueada durante a transação: respostas concorrentes de profissionais diferentes não atribuem duas pessoas; repetir uma resposta persistida não repete atribuição, histórico, auditoria nem intenção de aviso. Recusar convite de outro profissional não limpa o responsável atual. Vigência, versão, vínculo ativo, destinatário quando autenticado e empresa são revalidados. Mensagem WhatsApp anterior à criação/alteração não aceita oferta nova. Dois convites pendentes exigem seleção pelo link.

Emissão/listagem administrativa exige papel atual admin/gestor e capacidade editarDemanda. A atribuição no PUT da demanda usa a mesma exigência antes de resolver/criar perfis. Atribuição, substituição dos convites pendentes, emissão, auditoria e aviso ao profissional são persistidos juntos. O envio efetivo depende do consumidor O03 e dos seus gates de ativação. Contato ausente/ambíguo não autoriza envio; não se promete entrega pela gravação da intenção. O link/token continua sendo a credencial pública: não equivale a autenticação documental da pessoa.

Diária e condição oferecidas ficam congeladas no convite, com versão. Trigger impede reescrever identidade, validade ou condição do registro. Mudanças cadastrais posteriores não alteram a oferta passada. A diária é referência, não total contratado: faltam quantidade e confirmação do valor total. Tarifa cadastral zero e convites legados ficam desconhecidos, sem inferência retroativa. A tela apresenta a referência e a pendência e não garante entrega de WhatsApp.

Conclusão do job deixa de multiplicar implicitamente uma diária atual por um serviço inteiro. `src/lib/custo-servico.ts` registra uma única pendência por fato de conclusão, com origem e auditoria, sem substituir lançamento existente. Zero com confirmação ausente continua desconhecido no painel. Competência usa a conclusão registrada. O custo inicialmente criado pelo envio de NF também não infere total pela diária atual. Não houve correção automática dos valores antigos.

## Evidência

- 763 unitários aprovados. Foram removidos 14 testes do parser descontinuado e adicionados 8 de fronteira HTTP.
- Suíte integrada completa: 371 aprovados; depois, o arquivo de convites foi ampliado de 7 para 8 casos e seus 8 passaram. Total de casos integrados distintos: 372.
- Casos novos com login PostgreSQL restrito/NOBYPASSRLS: emissão concorrente, aceites concorrentes, retry, tarifa alterada, imutabilidade, recusa antiga, outra empresa, destinatário errado, vínculo inativo, expiração, mensagem antiga, rollback da auditoria e zero desconhecido. Inbox formal testado com duas ofertas e seleção explícita.
- 26 testes runtime/RLS e verificador de grants aprovados. Typescript, build webpack, auditores de tenancy/perfil global e schema diff aprovados. Lint dos arquivos alterados sem erros, quatro avisos legados.
- Nenhum teste enviou mensagem real ou chamou IA paga. Sem ensaio visual adicional: mudança na página pública restrita às condições e mensagens.

## Pendências explícitas para continuação

C01 permanece EM_EXECUCAO, não IMPLEMENTADO. Legados sem registro formal ainda conservam transição operacional compatível; não ganharam contrato retroativo. Revisar esses caminhos e os fluxos de NF antes do aceite integral. As rotas de pagamento por demanda e NF pública ainda precisam de revisão conjunta de autorização por profissional, concorrência, estado pago e documentos; a remoção da inferência monetária não conclui essa revisão.

C02/C03 continuam EM_EXECUCAO: confirmação estruturada de quantidade/total do contrato, alocação de pessoal por competência, rateio por unidade elegível, simulação/aplicação de lote histórico revisado e conciliação dos zeros reais. A criação de pendência de custo após uma transição ainda não está no mesmo commit da conclusão do job; se falhar, a fila de conciliação de serviços concluídos sem custo continua exibindo a ausência. Migrar esse efeito para intenção durável/mesmo commit no fechamento financeiro.

Próximo bloco: consolidar NF/pagamento e total contratado, incluindo teste de profissional/empresa errados e regressão de estados pagos; depois alocação/rateio e conciliação. Eventos permanecem em standby. Simplificação funcional precede expansão do visual. Gates externos de WhatsApp/e-mail, homologação, publicação e piloto continuam pendentes.

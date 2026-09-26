# Caderno 5 — Externos, competência e custo do setor

Objetivo: informar custo conhecido e cobertura dos dados, preservando contratos e períodos. Não é uma implantação de contabilidade ou cálculo fiscal. Caminhos relativos à raiz de F00.

## C01 — Convite e aceite vinculados ao job

**Arquivos:** schema de convites/demandas/vínculo externo, api/jobs/**, APIs de convite/aceite, webhook WhatsApp, lib/job-fase.ts e job-transicoes.ts.

1. Mapear as transições existentes e manter um serviço de negócio único para UI e WhatsApp. Convite referencia organização, job, profissional, validade, versão e condição combinada; não selecionar “o último pendente” após um SIM genérico.
2. Capturar snapshot da tarifa/condição no convite aceito. Alterar cadastro de diária depois não muda contrato passado. Se a tarifa não existe, aceitar a operação permitida com pendência explícita ou exigir preenchimento conforme fluxo já aprovado; não inventar valor.
3. Aceite verifica destinatário, estado e vigência; compare-and-set/constraint/transação impedem aceite duplo ou dois externos na mesma vaga quando ela for exclusiva.
4. Transição gera intenção de aviso em O01/O03 e evento S08, sem rede dentro da transação. A confirmação do usuário só ocorre após persistência.
5. Manter entrega → aprovação → NF → aprovação financeira → pagamento com estados válidos. Externo vê somente seus jobs, condições e documentos permitidos.

**Testes:** dois convites pendentes para mesma pessoa; SIM ambíguo pede seleção; convite expirado; usuário errado; duas aceitações concorrentes; alteração de tarifa; retry após commit; NF de outra empresa.

**Aceite:** UI e WhatsApp usam a mesma regra. Não duplica atribuição, custo automático ou notificação por repetir a resposta.

## C02 — Modelo de custo por competência e qualidade do dado

**Achados C01/C03. Arquivos:** schema CustoVideomaker/EditorOrganizacao, APIs de custos, backfill-custos, produção e serviços financeiros.

1. Preservar CustoVideomaker como subregistro externo. Criar estrutura mínima complementar para competência de pessoal interno e despesas do setor, reutilizando algo equivalente se já existir.
2. Campos do lançamento: empresa, categoria, competência YYYY-MM, valor em Decimal/centavos, moeda, fonte, estado de confirmação, vínculo opcional com pessoa/job, origem idempotente e auditoria. Não sobrecarregar videomakerId obrigatório para representar Vercel ou salário interno.
3. Internos: registrar valor mensal conhecido por período e fator de alocação explicitamente informado; salário atual não preenche meses anteriores. Encargos/benefícios/equipamentos só entram se informados com regra; mostrar o que está ausente.
4. Externos: snapshot C01 ou lançamento confirmado. Legados de valor zero ficam “a revisar” até diferenciar gratuidade real e ausência de dado; preservar valor/origem históricos. Não somar CustoVideomaker e espelho de lançamento duas vezes.
5. Constraint de idempotência pela origem do fato automático, não somente (job, pessoa, tipo), pois um job pode ter várias diárias/parcelas legítimas.
6. Resolver divergência entre pago e statusPagamento com estado canônico e compatibilidade de leitura; migração apresenta conflitos para revisão. Não marcar pago por envio de e-mail.
7. Backfill torna-se simulação com valores/origens/confiança e chave de lote. Aplicação real depende de lista revisada; nenhuma inferência pela diária atual.

**Testes em banco:** dois geradores concorrentes para mesmo fato → um lançamento; duas diárias legítimas → dois; salário muda no mês seguinte sem alterar anterior; zero confirmado versus desconhecido; Decimal/arredondamento; pagamento inconsistente; tenant errado.

**Aceite:** soma rastreável por competência, dados desconhecidos explícitos e migração aditiva ensaiada. Não é necessário inventar o passado para permitir cadastro correto daqui em diante.

## C03 — Painel de custos úteis e conciliação

**Arquivos:** app/(dashboard)/custos/page.tsx, api/producao, relatórios e APIs/serviços de C02.

1. Visão mensal: pessoal interno conhecido + serviços externos conhecidos + infraestrutura/ferramentas + demais despesas registradas. Mostrar cobertura por categoria e pendências, além do total conhecido.
2. Comparar pessoas pelo mesmo período e unidade: audiovisual, arte, copy e demais entregáveis não são intercambiáveis. Não criar ranking agregado por quantidade bruta.
3. Custo por entrega = custo alocado conhecido / entregas elegíveis daquele recorte. Se cobertura insuficiente, rotular parcial; denominador zero gera “sem base”, não infinito/zero. Expor regra de rateio.
4. Remover “se pagou” e R$ 200 como afirmação de receita/rentabilidade. Se conservar referência comercial configurável, separá-la claramente de custo real.
5. Criar fila de conciliação: valor ausente, contrato sem custo, salário sem competência, divergência de pagamento; cada item leva à origem e exige autorização financeira.

**Fixture de aceite:** interno 3.000 + externo 500 + ferramenta 100 = 3.600 conhecidos, uma despesa ainda não informada; painel deve dizer 3.600 parcial. Dez entregas elegíveis com rateio integral conhecido = 360 por entrega com ressalva de cobertura. Reabrir trabalho muda indicador operacional conforme R02, sem apagar gasto realizado.

**Aceite:** soma bate com lançamentos e não duplica fontes; usuário sem verCustos não recebe números ou campos fiscais na API. Conciliação real dos 50 zeros fica como operação assistida, não “corrigida” por preencher números.

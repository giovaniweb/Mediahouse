import { EMPRESA_NUFLOW as E } from "@/lib/juridico/empresa"

export const resumo = [
  "Quase tudo o que existe no NuFlow é da empresa que contratou o sistema. Nesses casos ela decide o que fazer com os dados, e o NuFlow só executa o serviço. Para a sua conta, a cobrança e a rede de profissionais, quem decide é o NuFlow.",
  "Usamos fornecedores para hospedar, guardar arquivos, mandar e-mail e WhatsApp e rodar a inteligência artificial. Alguns ficam fora do Brasil. Não vendemos dados a ninguém.",
  `Você pode pedir acesso, correção, cópia ou exclusão dos seus dados pelo e-mail ${E.emailEncarregado}.`,
]

export const texto = `
## 1. Sobre esta política

Esta Política explica como o NuFlow, de ${E.razaoSocial}, CNPJ ${E.cnpj}, com sede em ${E.endereco}, trata dados pessoais, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, "LGPD") e o Marco Civil da Internet (Lei nº 12.965/2014).

Ela vale para quem usa o NuFlow com conta (equipe das empresas clientes e profissionais), para quem usa um link de uma empresa sem conta (para pedir, aprovar ou avaliar) e para quem visita o site.

## 2. Quem decide sobre os seus dados

A LGPD separa quem decide sobre os dados (o **controlador**) de quem os trata em nome de outro (o **operador**). No NuFlow, os dois papéis existem:

- **A empresa cliente é a controladora** do que coloca no sistema: demandas, briefings, arquivos, comentários, aprovações, cadastro da própria equipe, pedidos que os clientes dela enviam pelos formulários e os dados fiscais e bancários dos profissionais que trabalham para ela. **O NuFlow é o operador** desses dados e só os trata conforme as instruções da empresa, nos termos do [Acordo de Tratamento de Dados](/dpa).
- **O NuFlow é o controlador** dos dados da conta e da cobrança da empresa cliente, dos contatos de quem pede informações no site, dos registros de segurança e de acesso, e do **perfil público dos profissionais na Rede**, com o score e as avaliações.

Se você pediu um vídeo, aprovou uma entrega ou trabalha na equipe de uma empresa que usa o NuFlow, a empresa é a principal responsável pelos seus dados. Para exercer seus direitos, procure primeiro a empresa. Se escrever ao NuFlow, encaminharemos o pedido a ela e ajudaremos na resposta.

## 3. Quais dados tratamos

**Equipe das empresas (Usuários):** nome, e-mail, telefone, cargo e permissões, foto (se enviada), registros de uso e de acesso.

**Profissionais (videomakers e designers):**

- no perfil da Rede: nome, cidade e estado, áreas de atuação, portfólio e redes sociais informados, nota, score e avaliações;
- com a empresa a quem se candidatam ou para quem trabalham: e-mail e WhatsApp, CPF ou CNPJ, razão social, nome fantasia, representante, endereço, dados bancários e chave PIX (estes dois guardados cifrados), valor de diária, observações e notas fiscais.

**Clientes das empresas que usam formulários públicos:** nome, WhatsApp, e-mail e o conteúdo do pedido, da ideia ou da aprovação.

**Conteúdo de trabalho:** vídeos, imagens, artes, briefings, comentários e mensagens trocadas na Plataforma e pelos avisos de WhatsApp e e-mail. Esses arquivos podem mostrar o rosto e a voz de pessoas.

**Contatos comerciais:** nome, e-mail, telefone e empresa de quem pede contato no site.

**Dados técnicos:** endereço IP, data e hora de acesso, navegador e registros de auditoria (quem fez o quê e quando). Nos formulários públicos e no aceite dos termos, o IP é guardado só como código irreversível, gerado com uma chave secreta, que serve para limitar abusos e provar o aceite sem identificar a pessoa diretamente.

O NuFlow não pede dados sensíveis (saúde, biometria, religião, origem racial, opinião política, vida sexual). Se a empresa cliente os colocar em um briefing ou arquivo, ela responde pela base legal.

## 4. Para que usamos e com qual base legal

- **Prestar o serviço contratado** (organizar demandas, enviar avisos, guardar arquivos): quando o NuFlow age como operador, as instruções da empresa controladora, que responde pela base legal.
- **Contas dos Usuários e do Administrador** (login, permissões, suporte): legítimo interesse do NuFlow e da empresa cliente em prestar o serviço contratado (art. 7º, IX). Quem contrata é a empresa, e não a pessoa, por isso a base não é a execução de contrato.
- **Cobrança e nota fiscal da assinatura:** execução de contrato e cumprimento de obrigação legal (art. 7º, II e V).
- **Pagamento e nota fiscal dos profissionais pelas empresas:** execução de contrato e procedimentos preliminares a ele, e obrigação legal da empresa (art. 7º, II e V). O NuFlow é operador.
- **Rede de Profissionais, score e avaliações:** execução do contrato com o profissional (os [Termos do Profissional](/profissionais/termos)) e legítimo interesse das empresas em conhecer o trabalho de quem vão contratar (art. 7º, V e IX). O NuFlow registrou o teste desse interesse contra os direitos do profissional, adotou as garantias da seção 6 e apresenta o registro à ANPD quando ela pedir.
- **Segurança, prevenção de fraude e registros de acesso:** cumprimento de obrigação legal (Marco Civil, art. 15) e legítimo interesse (art. 7º, II e IX).
- **Análise de briefing e transcrição por inteligência artificial,** quando a empresa liga o recurso: execução de contrato, como operador da empresa.
- **Responder a contatos comerciais do site:** procedimentos preliminares a um contrato, a pedido do próprio titular (art. 7º, V).
- **Defesa em processos:** exercício regular de direitos (art. 7º, VI).

O NuFlow não vende dados pessoais, não os usa para publicidade e não toma decisões exclusivamente automatizadas que afetem você, salvo o cálculo do score descrito na seção 6, que você pode pedir para revisar.

## 5. Com quem compartilhamos

Compartilhamos dados só com quem é necessário para o serviço funcionar. Com os fornecedores de infraestrutura, isso acontece sob os termos de contrato e de proteção de dados de cada um:

- **Vercel** (hospedagem da aplicação) — processamento em São Paulo, Brasil, com rede de entrega de conteúdo em outros países;
- **Supabase** (banco de dados e armazenamento de arquivos) — São Paulo, Brasil;
- **Railway** (servidor de WhatsApp, com as mensagens e contatos dos avisos, e conversor de vídeo) — Singapura;
- **Resend** (envio de e-mails) — Estados Unidos;
- **Anthropic** e **OpenAI** (inteligência artificial para análise de briefing e transcrição de áudio) — Estados Unidos. Pelos termos comerciais vigentes desses fornecedores, o que é enviado pela API não é usado para treinar modelos, mas eles podem guardar os dados por prazo limitado, para segurança e prevenção de abuso;
- **WhatsApp (Meta):** as mensagens de aviso passam pelo WhatsApp, serviço de terceiro que segue os próprios termos, sem contrato com o NuFlow, pelo número que a própria empresa cliente conecta.

Dentro do NuFlow, os dados de uma empresa não são visíveis a outra. A exceção é o perfil da Rede e as avaliações dos profissionais, que todas as empresas clientes veem, como explicado na seção 6, e os cards que uma empresa decide compartilhar com uma empresa parceira.

Também podemos entregar dados por ordem judicial ou requisição de autoridade competente, nos limites da lei.

## 6. Rede de Profissionais e score

Ao se cadastrar, o profissional entra na Rede do NuFlow. As empresas clientes veem o perfil antes de contratar: nome, cidade, áreas, portfólio, redes informadas, score e avaliações com comentários.

- Os dados de contato, fiscais e bancários **não** aparecem na Rede. Uma empresa nova chega ao profissional por convite enviado pelo NuFlow, e ele decide se aceita.
- A Rede é visível só para empresas clientes logadas. Não é aberta na internet nem indexada por buscadores.
- O score é a média das notas dos últimos 24 meses e só aparece a partir de 3 avaliações. O critério completo está na [Política de Avaliações](/profissionais/avaliacoes).
- O profissional pode responder a qualquer avaliação, contestar a que violar as regras e pedir revisão do score (art. 20 da LGPD).
- O profissional pode sair da Rede a qualquer momento: o perfil deixa de aparecer para empresas novas. Se voltar, as avaliações anteriores voltam junto.

## 7. Transferência internacional

Alguns fornecedores da seção 5 tratam dados fora do Brasil, nos Estados Unidos e em Singapura. O NuFlow adota, para cada um, um dos mecanismos do art. 33 da LGPD e da Resolução CD/ANPD nº 19/2024, e informa qual é, a pedido do titular ou da empresa cliente.

## 8. Por quanto tempo guardamos

- **Conteúdo das empresas clientes:** enquanto durar o contrato. Depois do encerramento, 30 dias para exportação e exclusão em até 60 dias, com as cópias de segurança renovadas em até 90 dias.
- **Dados fiscais de profissionais:** enquanto a empresa que os recebeu mantiver a relação e pelo prazo que a lei fiscal exigir dela, em regra 5 anos.
- **Perfil da Rede e avaliações:** enquanto o profissional mantiver o cadastro. Depois da exclusão, o CPF ou CNPJ e as notas ficam guardados por até 3 anos, com acesso restrito, só para impedir que alguém apague o histórico e se cadastre de novo.
- **Avaliações removidas e histórico de moderação:** 3 anos, ou até o fim de processo em curso, com acesso restrito.
- **Conta e cobrança da assinatura:** durante o contrato e 5 anos depois, pelo prazo de prescrição e da lei fiscal.
- **Registros de acesso:** 6 meses, como exige o art. 15 do Marco Civil da Internet.
- **Registro de auditoria:** o fato (quem, o quê, quando) enquanto a conta existir; os detalhes, 90 dias.
- **Registro de aceite dos termos:** enquanto a conta existir e depois, pelo prazo de prescrição aplicável.
- **Contatos comerciais:** até 2 anos sem retorno, ou até o pedido de exclusão.
- **Cópias de segurança:** apagadas no ciclo de renovação, em até 90 dias.

Dados anonimizados, que não identificam ninguém, podem ser guardados para estatística.

## 9. Segurança

Usamos conexão cifrada (HTTPS), senhas guardadas com código irreversível, dados bancários e PIX cifrados, separação dos dados por empresa conferida por testes automáticos a cada mudança, controle de permissões por pessoa, registro de auditoria, limite de tentativas nos formulários públicos e cópias de segurança com restauração testada.

Nenhuma medida é infalível. Se houver incidente que possa causar risco ou dano relevante, o NuFlow comunicará a Autoridade Nacional de Proteção de Dados (ANPD) e os titulares quando for o controlador. Quando for operador, avisará a empresa controladora em até 48 horas e a ajudará a comunicar, conforme a Resolução CD/ANPD nº 15/2024.

## 10. Seus direitos

A LGPD (art. 18) garante a você:

- confirmar se tratamos seus dados e ter acesso a eles;
- corrigir dados incompletos, inexatos ou desatualizados;
- pedir anonimização, bloqueio ou exclusão de dados desnecessários ou tratados em desacordo com a lei;
- receber seus dados em formato que permita levá-los a outro fornecedor;
- pedir a exclusão de dados tratados com seu consentimento e revogar o consentimento;
- saber com quem compartilhamos seus dados;
- se opor a tratamento feito com base em legítimo interesse, quando houver descumprimento da lei;
- pedir revisão de decisão tomada só por meio automatizado, como o score (art. 20).

**Como pedir:** escreva para ${E.emailEncarregado}, informando o nome e o e-mail usados no NuFlow e a empresa a que você está ligado. Podemos pedir confirmação de identidade antes de entregar dados. Respondemos em até 15 dias. Quando a empresa cliente for a controladora, encaminhamos o pedido a ela em até 2 dias úteis e avisamos você.

Você também pode reclamar à ANPD (www.gov.br/anpd).

## 11. Encarregado

O encarregado pelo tratamento de dados pessoais do NuFlow é ${E.encarregado}, pelo e-mail ${E.emailEncarregado}.

## 12. Cookies e armazenamento no navegador

O NuFlow usa só cookies necessários para funcionar: o que mantém você logado, o que guarda a empresa ativa quando você participa de mais de uma e o de proteção contra falsificação de formulário. O navegador também guarda preferências de tela (como filtros e rascunhos) no armazenamento local.

**Não usamos cookies de publicidade, de rastreamento nem de análise de terceiros.** Por isso não há banner de consentimento. Se isso mudar, esta seção será atualizada antes, e pediremos o consentimento quando a lei exigir.

Você pode apagar os cookies pelo navegador, mas aí precisará entrar de novo.

## 13. Crianças e adolescentes

O NuFlow é um serviço para empresas e profissionais. Não é dirigido a menores de 18 anos, e as contas exigem maioridade. Se uma empresa tratar imagem de criança ou adolescente em vídeos e artes, ela deve ter o consentimento dos pais ou responsáveis e seguir o art. 14 da LGPD e o Estatuto da Criança e do Adolescente.

## 14. Mudanças nesta política

Quando esta Política mudar de forma relevante, avisaremos por e-mail ou na própria Plataforma, e a nova versão será pedida no próximo acesso. A versão e a data ficam no topo da página.
`

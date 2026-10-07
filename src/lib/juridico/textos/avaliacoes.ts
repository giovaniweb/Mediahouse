import { EMPRESA_NUFLOW as E } from "@/lib/juridico/empresa"

export const resumo = [
  "Avalie o trabalho, não a pessoa. Nada de ofensa, de dado de cliente ou de acusação de crime.",
  "Todo comentário passa por moderação antes de aparecer. O profissional é avisado, pode responder e pode contestar.",
  "O NuFlow decide as contestações em até 5 dias úteis e explica o motivo.",
]

export const texto = `
## 1. Para que serve

A Rede de Profissionais do NuFlow permite que uma empresa conheça o trabalho de um videomaker ou designer antes de contratá-lo. As avaliações só têm valor se forem honestas e justas, para quem contrata e para quem é avaliado. Esta Política diz quem pode avaliar, o que pode ser escrito, como funciona a moderação e como contestar.

Ela vale para as empresas clientes e seus Usuários, para os clientes delas que avaliam por convite e para os profissionais, e faz parte dos [Termos de Uso](/termos) e dos [Termos do Profissional](/profissionais/termos).

## 2. Quem pode avaliar e quando

- A **empresa que contratou** o profissional para um trabalho registrado no NuFlow, por um Usuário com permissão para isso.
- O **cliente da empresa**, por link de convite enviado pela empresa e ligado àquele trabalho. O link vale para uma avaliação só.
- A avaliação é feita depois que o trabalho é concluído, uma vez por trabalho, em até 60 dias da conclusão.
- Não pode avaliar quem tem conflito de interesse: o próprio profissional, parentes, sócios, concorrentes diretos ou quem recebeu algo em troca da avaliação.

## 3. O que a avaliação tem

- Nota de 1 a 5.
- "Recomendo" ou "não recomendo".
- Comentário opcional, de até 1.000 caracteres.

A avaliação aparece com o nome da empresa que contratou e a data, sem o nome da pessoa que avaliou.

## 4. Regras para quem avalia

O comentário deve tratar **só do trabalho**: qualidade da entrega, cumprimento do prazo, comunicação, organização e profissionalismo. Descreva fatos que você viveu naquele trabalho.

Não é permitido:

- ofensa, xingamento, ironia humilhante, ameaça ou linguagem obscena;
- comentário sobre aparência, origem, raça, gênero, orientação sexual, religião, idade, deficiência, saúde ou vida pessoal do profissional;
- **acusação de crime** (furto, fraude, assédio, por exemplo). Fatos assim devem ser levados às autoridades e, se envolverem a Plataforma, ao NuFlow pelo e-mail ${E.emailEncarregado}. Comentário com acusação de crime não é publicado;
- **dados pessoais** do profissional ou de terceiros: telefone, endereço, documento, valores pagos, e nomes ou imagens de clientes, pacientes ou consumidores;
- informação confidencial da empresa ou do cliente;
- avaliação de trabalho que não aconteceu, avaliação paga, trocada ou combinada, ou várias avaliações para o mesmo trabalho;
- retaliação por cobrança, por recusa de trabalho ou por contestação anterior;
- links, propaganda ou conteúdo sem relação com o trabalho.

## 5. Moderação

- **Notas sem comentário** entram no score assim que enviadas.
- **Comentários** passam por moderação antes de aparecer, em até 2 dias úteis. A moderação é feita por pessoas da equipe do NuFlow, que podem usar filtros automáticos para apontar trechos suspeitos. A decisão final é sempre de uma pessoa.
- O moderador pode publicar o comentário, pedir à empresa que o corrija ou recusá-lo. O NuFlow não reescreve comentários.
- Comentário recusado não é publicado. A nota permanece, exceto se a avaliação inteira violar as regras (trabalho inexistente, conflito de interesse, retaliação).
- O NuFlow não remove avaliação só porque é negativa. Crítica honesta ao trabalho, feita dentro destas regras, é permitida e útil para a Rede.

## 6. Resposta do profissional

O profissional é avisado de cada avaliação publicada e pode publicar uma resposta, que aparece logo abaixo dela. A resposta segue as regras da seção 4, aplicadas a quem responde.

## 7. Contestação

O profissional, a empresa avaliadora ou qualquer pessoa citada pode contestar uma avaliação ou resposta pelo botão "contestar" ou pelo e-mail ${E.emailEncarregado}, dizendo qual regra foi violada.

1. O NuFlow confirma o recebimento.
2. Se a contestação for plausível, o comentário fica oculto durante a análise.
3. O NuFlow ouve a outra parte, quando necessário, por até 3 dias úteis.
4. A decisão sai em até **5 dias úteis** e é comunicada às duas partes, com o motivo: manter, pedir correção, ocultar o comentário ou remover a avaliação inteira.
5. Quem discordar pode pedir uma segunda análise, uma vez, feita por outra pessoa da equipe, em até 5 dias úteis.

Ordem judicial é cumprida no prazo determinado, sem prejuízo deste procedimento.

## 8. Score

- O score é a média simples das notas dos últimos 24 meses.
- Aparece a partir de 3 avaliações. Antes disso, o perfil mostra "novo na Rede".
- Notas removidas por violação saem do cálculo.
- Junto do score aparecem a quantidade de avaliações e a porcentagem de recomendações.
- O profissional pode pedir revisão do cálculo pelo e-mail ${E.emailEncarregado}, como garante o art. 20 da LGPD.

## 9. Consequências para quem descumpre

- Comentário que viola as regras é recusado ou removido.
- Quem repete a violação pode perder a possibilidade de avaliar, por empresa ou por Usuário.
- Manipulação de avaliações (perfil falso, avaliação paga, combinada ou autoavaliação) leva à remoção das avaliações envolvidas e pode levar à suspensão da conta, pelos [Termos de Uso](/termos) ou pelos [Termos do Profissional](/profissionais/termos).

## 10. Registro

O NuFlow guarda por 6 meses o conteúdo de avaliações removidas e o histórico de moderação e contestação, com acesso restrito, para responder a pedidos de autoridades e a processos. Depois disso, apaga.

## 11. Responsabilidade

Quem escreve a avaliação ou a resposta responde pelo que escreveu. O NuFlow modera de acordo com esta Política e atende ordens judiciais e notificações, nos termos do Marco Civil da Internet.
`

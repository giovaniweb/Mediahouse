import { EMPRESA_NUFLOW as E } from "@/lib/juridico/empresa"

export const resumo = [
  "Na Rede, outras empresas veem só a média das notas de 1 a 5 e quantas avaliações o profissional recebeu. Nenhum comentário aparece na Rede.",
  "Quem avalia dá nota ao trabalho, não à pessoa. Nota de vingança, de trabalho que não existiu ou de quem tem conflito de interesse é removida.",
  "O profissional pode contestar uma nota. O NuFlow decide, em regra, em até 5 dias úteis e explica o motivo.",
]

export const texto = `
## 1. Para que serve

A Rede de Profissionais do NuFlow permite que uma empresa conheça o histórico de um videomaker ou designer antes de contratá-lo. As avaliações só têm valor se forem honestas e justas, para quem contrata e para quem é avaliado. Esta Política diz quem pode avaliar, o que aparece na Rede e como contestar.

Ela vale para as empresas clientes e seus Usuários, para os clientes delas que avaliam por convite e para os profissionais, e faz parte dos [Termos de Uso](/termos) e dos [Termos do Profissional](/profissionais/termos).

## 2. Quem pode avaliar e quando

- A **empresa que contratou** o profissional para um trabalho registrado no NuFlow, por um Usuário com permissão para isso.
- O **cliente da empresa**, por link de convite enviado pela empresa e ligado àquele trabalho. O link vale para uma avaliação só. Antes de enviar, quem avalia por link aceita esta Política. A empresa que enviou o convite responde pelas avaliações de quem ela convidou.
- A avaliação é feita depois que o trabalho é concluído, uma vez por trabalho, em até 60 dias da conclusão.
- Não pode avaliar quem tem conflito de interesse: o próprio profissional, parentes, sócios, concorrentes diretos ou quem recebeu algo em troca da avaliação.

## 3. O que a avaliação tem e quem vê

- **Nota de 1 a 5.** Entra na média que aparece na Rede.
- **Comentário opcional**, de até 1.000 caracteres. **Não aparece na Rede.** Fica visível só para a empresa que contratou e para o profissional avaliado, como registro do trabalho.

Na Rede, outras empresas veem apenas a **média das notas** e a **quantidade de avaliações**. Não aparecem as notas uma a uma, o nome de quem avaliou nem o nome da empresa que contratou.

Se um dia os comentários passarem a aparecer na Rede, esta Política será atualizada antes, com aviso e novo aceite.

## 4. Regras para quem avalia

A nota e o comentário devem tratar **só do trabalho**: qualidade da entrega, cumprimento do prazo, comunicação, organização e profissionalismo.

Não é permitido:

- dar nota a trabalho que não aconteceu, dar nota paga, trocada ou combinada, ou avaliar mais de uma vez o mesmo trabalho;
- dar nota por retaliação, por cobrança, por recusa de trabalho ou por contestação anterior;
- no comentário: ofensa, ameaça, linguagem obscena, comentário sobre aparência, origem, raça, gênero, orientação sexual, religião, idade, deficiência, saúde ou vida pessoal do profissional;
- no comentário: **acusação de crime**. Fatos assim devem ser levados às autoridades;
- no comentário: dados pessoais de terceiros, como nomes ou imagens de clientes, pacientes ou consumidores, e informação confidencial.

## 5. Contestação

O profissional pode contestar uma nota pelo botão "contestar" ou pelo e-mail ${E.emailEncarregado}, dizendo por quê: trabalho que não aconteceu, conflito de interesse, retaliação, nota combinada ou outra violação destas regras. A empresa avaliadora e qualquer pessoa citada também podem contestar um comentário.

1. O NuFlow confirma o recebimento.
2. Se a contestação for plausível, a nota sai da média durante a análise.
3. O NuFlow ouve a outra parte, quando necessário, por até 3 dias úteis.
4. A decisão sai, em regra, em até **5 dias úteis** e é comunicada às duas partes, com o motivo: manter, ou remover a nota ou o comentário.
5. Quem discordar pode pedir uma segunda análise, uma vez, em até 5 dias úteis. Sempre que possível, ela é feita por pessoa diferente da que decidiu.

O NuFlow não remove nota só porque é baixa. Uma nota honesta sobre o trabalho, dada dentro destas regras, é permitida e útil para a Rede.

O NuFlow não é autor das avaliações, não verifica a veracidade do que foi escrito e não as endossa. Quem avalia responde pelo que avaliou. Ordem judicial é cumprida no prazo determinado, sem prejuízo deste procedimento.

## 6. Média na Rede

- A média é simples, das notas dos últimos 24 meses.
- Aparece a partir de 3 avaliações. Antes disso, o perfil mostra "novo na Rede".
- Notas removidas por violação saem do cálculo.
- O profissional pode pedir revisão do cálculo pelo e-mail ${E.emailEncarregado}, como garante o art. 20 da LGPD.

## 7. Consequências para quem descumpre

- Nota ou comentário que viola as regras é removido.
- Quem repete a violação pode perder a possibilidade de avaliar, por empresa ou por Usuário.
- Manipulação de avaliações (perfil falso, nota paga, combinada ou autoavaliação) leva à remoção das avaliações envolvidas e pode levar à suspensão da conta, pelos [Termos de Uso](/termos) ou pelos [Termos do Profissional](/profissionais/termos).

## 8. Registro

O NuFlow guarda, com acesso restrito, as notas e comentários removidos, a identificação de quem os escreveu e o histórico de contestação por 3 anos, ou até o fim de processo em curso, para se defender e atender a ordens judiciais. Depois disso, apaga.
`

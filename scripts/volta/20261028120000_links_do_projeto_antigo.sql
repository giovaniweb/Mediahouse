-- VOLTA da migration 20261028120000_links_do_projeto_antigo.
--
-- Devolve às 83 demandas e ao depoimento a URL absoluta do bucket público do
-- projeto antigo (`sddsqdzcfueajsvgocaa`). Só serve enquanto aquele projeto
-- existir: depois de apagado, a volta aponta para arquivo que não existe mais.
--
-- A lista de ids é a de produção em 28/10/2026, antes da migration. Até ela,
-- nenhuma demanda tinha `linkFinal` no acervo `legado`; a lista garante que
-- a volta não alcança uma que venha a ter por outro caminho.
--
-- Escrita em produção: roda só com o sim do Giovani, numa transação única
-- (`psql -1`). Não mexe em _prisma_migrations.

UPDATE demandas
SET "linkFinal" = 'https://sddsqdzcfueajsvgocaa.supabase.co/storage/v1/object/public/uploads/' ||
  substring("linkFinal" from '^/api/midia/org/[a-zA-Z0-9_-]+/legado/(videos/[a-zA-Z0-9_-]+/final/[a-zA-Z0-9_.-]+)$')
WHERE "linkFinal" ~ '^/api/midia/org/[a-zA-Z0-9_-]+/legado/videos/[a-zA-Z0-9_-]+/final/[a-zA-Z0-9_.-]+$'
  AND id IN (
  'cmosr8fr0000004k0vsvjemof',
  'cmp1a7vxt000004lhtiy0nncc',
  'cmp1j4ziz000004lbcqhw6jje',
  'cmp1mdxoi000004k1cyjlfczo',
  'cmp2l8v83000404kysmi05uqd',
  'cmp2m9lgy000104l7baiylw7c',
  'cmp41hav4000204jyq7iubdox',
  'cmp4cksf1000004jsr7gdfoqt',
  'cmp4cumbv000004l5i6kxhsio',
  'cmp4cwwrq000504l4dkogxikb',
  'cmp4cyst5000904l47xicl6vd',
  'cmp4d6mbh000804l5caiqv5a4',
  'cmp4d8pc6000d04l4y702r26c',
  'cmp4dc9j3000004l708l9q59h',
  'cmp4de3dl000d04l5ax7yqw1m',
  'cmp4di24i000504l7gn3s2c9t',
  'cmp4dk3hf000304l52usxs0g2',
  'cmp4dmbjn000304jrwdwgm019',
  'cmp4edqrq000c04ie2ou0jxg6',
  'cmp5hma6n000004l1qi4j35ff',
  'cmp5u88jq000004jixuf83csq',
  'cmp6xxghm000004kzaroao4s4',
  'cmpcsll4r000004lby9wrl8mi',
  'cmpfiqrel000004job2qwshms',
  'cmpfp6t5e000104l4thckkf1d',
  'cmphbdh37000304l0lavacjlj',
  'cmpiqgn6l000004lg7tg6g3xu',
  'cmpir2be9000i04l74yn1g7n0',
  'cmpir5c3k000604l4g9qlamhg',
  'cmpli80d1000004l13i5gvcqt',
  'cmplt0r9y000004kz9m4mpiuy',
  'cmplt70r2000104lbb1xohsx1',
  'cmpo2gm35000304lecxk1jw5t',
  'cmpo3c7e8000704le4hefohew',
  'cmpr4d0i0000004l7ofcutvi6',
  'cmpr725f9000004kvy8nax5um',
  'cmq9t7ndy000004jsqbuny4qp',
  'cmq9wnzc7000404joav1zuvx3',
  'cmqb0tn7i000004lc4g7uewa4',
  'cmqgoxn66000004jr6jixxsof',
  'cmqgp1evx000104lex3f8h8cj',
  'cmqihx4sn000004jo5wrp5es1',
  'cmqp8rl7w000004lbkiuj64ww',
  'cmqpgomx7000004jvpnpkbn5t',
  'cmqpjiivk000004l460uo64p7',
  'cmqr1f3yh000004l297c5keqk',
  'cmqscmd6y000004laj0wnxf08',
  'cmqtmjg60000004le824h8v7p',
  'cmqv1jo22000104jsj045c8u3',
  'cmqv1p1qt000104l5uhgsz6rb',
  'cmr2djoqx000004jmj6413tpc',
  'cmr3jmfpq000004js4mx6mttv',
  'cmr4ximvx000204jxzzncukfr',
  'cmr9agz8o000904i508nibjod',
  'cmr9oouwr000004jse92rpcfb',
  'cmr9p3x9p000904jo3qmbqj05',
  'cmrarmi8e000004l5n2drwx2s',
  'cmrarofzn000004l76iawl68z',
  'cmrdlowri000004jxiy6htjqv',
  'cmrdtg58i000004ju20n31gyr',
  'cmrjoms79000004lb042pt65m',
  'cmrl3od1h000004k3cv7r64sm',
  'cmrtldw3v000004lcrdqgetg4',
  'cmrtm75hl000004jo5b6f6ho0',
  'cmrweehf5000004jsiir6jjd6',
  'cmsgj82al000004l9dm6p8t5o',
  'cmsgk1pyl000804jve0od5528',
  'cmsnjiljb000004l4yk1qypae',
  'cmsor8eev000204jn6blcyda4',
  'cmsqk8gd2000904ld31ej5a1m',
  'cmsru74ju000004l1zem7qsho',
  'cmst2es6j000004ifogbrgxr0',
  'cmsyym624000004jlfeb3mtc8',
  'cmt06yczw000b04jlczd5q79q',
  'cmt07il17000004kzyuznxu87',
  'cmt07msx8000704lbgdl67xzb',
  'cmt1p346u000004jo1reowehy',
  'cmt1vzdjr000004jyt7h2duif',
  'cmt7h3lzm000g04l7hj09rpao',
  'cmt7hdy9j000104jvg7qslvda',
  'cmt7iszmz000004l8xovgut9m',
  'cmt7kbbsc000004lb73g60djz',
  'cmt7lodrc000004i7pk6shsye'
  );

UPDATE depoimentos
SET "videoUrl" = 'https://sddsqdzcfueajsvgocaa.supabase.co/storage/v1/object/public/uploads/depoimentos/' ||
  substring("videoUrl" from '^/api/midia/org/[a-zA-Z0-9_-]+/depoimentos/[a-zA-Z0-9_-]+/([a-zA-Z0-9_.-]+)$')
WHERE "videoUrl" ~ '^/api/midia/org/[a-zA-Z0-9_-]+/depoimentos/[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+$'
  AND id = 'cmp7caqr1000004l4i3smsjbp';

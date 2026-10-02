CREATE TABLE politicas_ia (
 "organizacaoId" TEXT PRIMARY KEY REFERENCES organizacoes(id) ON DELETE CASCADE ON UPDATE CASCADE,
 habilitada BOOLEAN NOT NULL DEFAULT true,
 "tokensDia" INTEGER NOT NULL DEFAULT 100000 CHECK ("tokensDia" BETWEEN 0 AND 10000000),
 simultaneas INTEGER NOT NULL DEFAULT 2 CHECK (simultaneas BETWEEN 1 AND 4),
 "entradaBytes" INTEGER NOT NULL DEFAULT 32768 CHECK ("entradaBytes" BETWEEN 1 AND 65536),
 "saidaTokens" INTEGER NOT NULL DEFAULT 4096 CHECK ("saidaTokens" BETWEEN 1 AND 8192),
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE consumos_ia (
 id TEXT PRIMARY KEY,
 "organizacaoId" TEXT NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "usuarioId" TEXT NOT NULL,
 finalidade VARCHAR(80) NOT NULL, modelo VARCHAR(80) NOT NULL,
 tentativa INTEGER NOT NULL DEFAULT 1 CHECK (tentativa=1),
 estado VARCHAR(20) NOT NULL DEFAULT 'reservado' CHECK (estado IN ('reservado','enviando','concluido','desconhecido','liberado')),
 token TEXT NOT NULL,
 periodo DATE NOT NULL,
 "reservaTokens" INTEGER NOT NULL CHECK ("reservaTokens">0),
 "entradaBytes" INTEGER NOT NULL CHECK ("entradaBytes" BETWEEN 1 AND 65536),
 "limiteSaida" INTEGER NOT NULL CHECK ("limiteSaida" BETWEEN 1 AND 8192),
 "debitoTokens" INTEGER NOT NULL CHECK ("debitoTokens">=0),
 "entradaTokens" INTEGER CHECK ("entradaTokens">=0),
 "saidaTokens" INTEGER CHECK ("saidaTokens">=0),
 "cacheLeituraTokens" INTEGER CHECK ("cacheLeituraTokens">=0),
 "cacheEscritaTokens" INTEGER CHECK ("cacheEscritaTokens">=0),
 "duracaoMs" INTEGER CHECK ("duracaoMs">=0), "provedorId" VARCHAR(128),
 "expiraEm" TIMESTAMP(3) NOT NULL, "iniciadoEm" TIMESTAMP(3), "concluidoEm" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((estado='concluido') = ("entradaTokens" IS NOT NULL AND "saidaTokens" IS NOT NULL)),
 CHECK (estado<>'liberado' OR ("iniciadoEm" IS NULL AND "debitoTokens"=0)),
 CHECK (estado NOT IN ('enviando','desconhecido','concluido') OR "iniciadoEm" IS NOT NULL)
);
CREATE INDEX "consumos_ia_organizacaoId_periodo_idx" ON consumos_ia("organizacaoId",periodo);
CREATE INDEX "consumos_ia_organizacaoId_estado_expiraEm_idx" ON consumos_ia("organizacaoId",estado,"expiraEm");
ALTER TABLE politicas_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE consumos_ia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON politicas_ia, consumos_ia FROM PUBLIC, app_auth, app_user;
GRANT SELECT, INSERT, UPDATE ON politicas_ia, consumos_ia TO app_user;
CREATE POLICY politica_ia_org ON politicas_ia TO app_user
 USING ("organizacaoId"=NULLIF(current_setting('app.org_id',true),''))
 WITH CHECK ("organizacaoId"=NULLIF(current_setting('app.org_id',true),''));
CREATE POLICY consumo_ia_org ON consumos_ia TO app_user
 USING ("organizacaoId"=NULLIF(current_setting('app.org_id',true),''))
 WITH CHECK ("organizacaoId"=NULLIF(current_setting('app.org_id',true),''));

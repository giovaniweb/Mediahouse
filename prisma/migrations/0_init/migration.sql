-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TipoUsuario" AS ENUM ('admin', 'gestor', 'operacao', 'solicitante', 'editor', 'videomaker', 'social', 'gestor_eventos', 'designer', 'analista_crm', 'gestor_trafego', 'auxiliar_admin');

-- CreateEnum
CREATE TYPE "StatusUsuario" AS ENUM ('ativo', 'inativo');

-- CreateEnum
CREATE TYPE "CategoriaPessoa" AS ENUM ('interna', 'solicitante', 'externo', 'sistema');

-- CreateEnum
CREATE TYPE "AreaAtuacao" AS ENUM ('audiovisual', 'growth', 'eventos');

-- CreateEnum
CREATE TYPE "StatusVideomaker" AS ENUM ('ativo', 'inativo', 'preferencial', 'pendente');

-- CreateEnum
CREATE TYPE "Prioridade" AS ENUM ('normal', 'alta', 'urgente');

-- CreateEnum
CREATE TYPE "AreaDemanda" AS ENUM ('audiovisual', 'design');

-- CreateEnum
CREATE TYPE "Departamento" AS ENUM ('growth', 'eventos', 'institucional', 'rh', 'audiovisual', 'outros');

-- CreateEnum
CREATE TYPE "StatusVisivel" AS ENUM ('entrada', 'producao', 'edicao', 'aprovacao', 'para_postar', 'finalizado');

-- CreateEnum
CREATE TYPE "StatusInterno" AS ENUM ('pedido_criado', 'aguardando_aprovacao_interna', 'aguardando_triagem', 'urgencia_pendente_aprovacao', 'urgencia_aprovada', 'planejamento', 'videomaker_notificado', 'videomaker_aceitou', 'videomaker_recusou', 'captacao_agendada', 'captacao_realizada', 'brutos_enviados', 'editor_atribuido', 'fila_edicao', 'editando', 'edicao_finalizada', 'revisao_pendente', 'aprovado', 'ajuste_solicitado', 'impedimento', 'postagem_pendente', 'postado', 'entregue_cliente', 'contagem_15_dias_iniciada', 'lembrete_15_dias_enviado', 'expirado', 'encerrado');

-- CreateEnum
CREATE TYPE "OrigemHistorico" AS ENUM ('manual', 'automacao', 'ia', 'whatsapp', 'kanban');

-- CreateEnum
CREATE TYPE "TipoArquivo" AS ENUM ('bruto', 'final', 'nota_fiscal', 'referencia', 'postagem', 'cliente', 'documento');

-- CreateEnum
CREATE TYPE "DirecaoWhatsapp" AS ENUM ('entrada', 'saida');

-- CreateEnum
CREATE TYPE "StatusAlerta" AS ENUM ('ativo', 'resolvido', 'ignorado');

-- CreateEnum
CREATE TYPE "SeveridadeAlerta" AS ENUM ('info', 'aviso', 'critico');

-- CreateEnum
CREATE TYPE "StatusIdeia" AS ENUM ('nova', 'em_analise', 'aprovada', 'em_producao', 'realizada', 'descartada');

-- CreateEnum
CREATE TYPE "OrigemIdeia" AS ENUM ('whatsapp', 'manual', 'instagram', 'tiktok', 'youtube', 'outro');

-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('captacao', 'edicao', 'reuniao', 'freelance', 'pessoal', 'empresa', 'prazo', 'outro');

-- CreateEnum
CREATE TYPE "ContextoEvento" AS ENUM ('contourline', 'freelance', 'pessoal', 'sistema');

-- CreateEnum
CREATE TYPE "StatusEvento" AS ENUM ('agendado', 'confirmado', 'em_andamento', 'concluido', 'cancelado');

-- CreateEnum
CREATE TYPE "TipoCusto" AS ENUM ('diaria', 'mensalidade', 'projeto', 'bonus', 'despesa', 'equipamento');

-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('pendente_nf', 'nf_enviada', 'aguardando_pagamento', 'pago', 'contestado');

-- CreateEnum
CREATE TYPE "TipoRelatorio" AS ENUM ('produtividade_time', 'analise_custos', 'otimizacao_contratacao', 'performance_videomaker', 'semanal', 'mensal', 'realtime', 'banco_ideias');

-- CreateEnum
CREATE TYPE "TipoCobertura" AS ENUM ('congresso', 'feira', 'evento_corporativo', 'show', 'lancamento', 'outro');

-- CreateEnum
CREATE TYPE "StatusCobertura" AS ENUM ('planejamento', 'em_andamento', 'concluido', 'cancelado');

-- CreateEnum
CREATE TYPE "FuncaoEquipe" AS ENUM ('captacao', 'edicao', 'fotografia', 'drone', 'suporte', 'social_media');

-- CreateEnum
CREATE TYPE "CategoriaChecklist" AS ENUM ('equipamento', 'logistica', 'conteudo', 'entrega');

-- CreateEnum
CREATE TYPE "TipoMomento" AS ENUM ('abertura', 'palestra', 'workshop', 'coquetel', 'exposicao', 'bastidores', 'encerramento', 'outro');

-- CreateEnum
CREATE TYPE "TipoEventoGestao" AS ENUM ('cafe', 'jantar', 'webinar', 'congresso', 'feira', 'ativacao', 'unyque_experience', 'treinamento', 'lancamento', 'evento_interno', 'evento_medicos', 'evento_fornecedores', 'outro');

-- CreateEnum
CREATE TYPE "StatusEventoGestao" AS ENUM ('ideia', 'planejamento', 'orcamento', 'aprovacao', 'producao', 'execucao', 'finalizado', 'cancelado');

-- CreateEnum
CREATE TYPE "StatusTarefa" AS ENUM ('pendente', 'em_andamento', 'aguardando_aprovacao', 'concluido', 'atrasado', 'cancelado');

-- CreateEnum
CREATE TYPE "PrioridadeTarefa" AS ENUM ('baixa', 'media', 'alta', 'critica');

-- CreateEnum
CREATE TYPE "CategoriaDocumento" AS ENUM ('manual_expositor', 'programacao', 'briefing', 'contratos', 'planta', 'projeto_stand', 'layout_identidade', 'material_impresso', 'artes_digitais', 'audiovisual', 'outros');

-- CreateEnum
CREATE TYPE "StatusDocumento" AS ENUM ('pendente', 'enviado', 'em_analise', 'aprovado', 'reprovado', 'finalizado');

-- CreateEnum
CREATE TYPE "CategoriaFornecedor" AS ENUM ('montadora', 'grafica', 'audiovisual', 'som', 'iluminacao', 'buffet', 'restaurante', 'hotel', 'transporte', 'brindes', 'decoracao', 'agencia', 'designer', 'fotografo', 'videomaker', 'seguranca', 'limpeza', 'internet', 'energia', 'palestrante', 'medico', 'influenciador', 'espaco', 'painel_led', 'outros');

-- CreateEnum
CREATE TYPE "UnidadeMedida" AS ENUM ('unidade', 'metro_quadrado', 'diaria', 'hora', 'pacote', 'pessoa', 'evento_fechado', 'lote', 'impressao', 'servico');

-- CreateEnum
CREATE TYPE "CategoriaCusto" AS ENUM ('stand', 'montagem', 'comunicacao_visual', 'audiovisual', 'buffet', 'jantar', 'brindes', 'impressos', 'trafego', 'hospedagem', 'transporte', 'palestrantes', 'medicos', 'equipe', 'taxas', 'extras');

-- CreateEnum
CREATE TYPE "TipoAprovacao" AS ENUM ('orcamento', 'layout', 'material', 'contrato', 'entrega');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "tipo" "TipoUsuario" NOT NULL DEFAULT 'solicitante',
    "status" "StatusUsuario" NOT NULL DEFAULT 'ativo',
    "senhaHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "superAdmin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videomakers" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cidade" TEXT,
    "estado" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "cpfCnpj" TEXT,
    "razaoSocial" TEXT,
    "nomeFantasia" TEXT,
    "representante" TEXT,
    "endereco" TEXT,
    "chavePix" TEXT,
    "redesSociais" TEXT[],
    "valorDiaria" DOUBLE PRECISION,
    "dadosBancarios" TEXT,
    "status" "StatusVideomaker" NOT NULL DEFAULT 'ativo',
    "avaliacao" DOUBLE PRECISION DEFAULT 5.0,
    "observacoes" TEXT,
    "areasAtuacao" TEXT[],
    "habilidades" TEXT[],
    "equipamentos" TEXT[],
    "portfolio" TEXT,
    "emListaNegra" BOOLEAN NOT NULL DEFAULT false,
    "listaNegraMotivo" TEXT,
    "podeEditar" BOOLEAN NOT NULL DEFAULT false,
    "tipoContrato" TEXT NOT NULL DEFAULT 'externo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usuarioId" TEXT,

    CONSTRAINT "videomakers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "editores" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "avatarUrl" TEXT,
    "especialidade" TEXT[],
    "habilidades" TEXT[],
    "cargaLimite" INTEGER NOT NULL DEFAULT 5,
    "status" "StatusUsuario" NOT NULL DEFAULT 'ativo',
    "avaliacao" DOUBLE PRECISION DEFAULT 5.0,
    "cidade" TEXT,
    "estado" TEXT,
    "cpfCnpj" TEXT,
    "razaoSocial" TEXT,
    "nomeFantasia" TEXT,
    "representante" TEXT,
    "endereco" TEXT,
    "chavePix" TEXT,
    "redesSociais" TEXT[],
    "salario" DOUBLE PRECISION,
    "dadosBancarios" TEXT,
    "observacoes" TEXT,
    "areasAtuacao" TEXT[],
    "equipamentos" TEXT[],
    "portfolio" TEXT,
    "emListaNegra" BOOLEAN NOT NULL DEFAULT false,
    "listaNegraMotivo" TEXT,
    "fazCaptacao" BOOLEAN NOT NULL DEFAULT false,
    "tipoContrato" TEXT NOT NULL DEFAULT 'interno',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usuarioId" TEXT,

    CONSTRAINT "editores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "designers" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cidade" TEXT,
    "estado" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "avatarUrl" TEXT,
    "cpfCnpj" TEXT,
    "razaoSocial" TEXT,
    "nomeFantasia" TEXT,
    "representante" TEXT,
    "endereco" TEXT,
    "chavePix" TEXT,
    "redesSociais" TEXT[],
    "valorDiaria" DOUBLE PRECISION,
    "salario" DOUBLE PRECISION,
    "dadosBancarios" TEXT,
    "status" "StatusUsuario" NOT NULL DEFAULT 'ativo',
    "avaliacao" DOUBLE PRECISION DEFAULT 5.0,
    "observacoes" TEXT,
    "especialidade" TEXT[],
    "habilidades" TEXT[],
    "equipamentos" TEXT[],
    "portfolio" TEXT,
    "emListaNegra" BOOLEAN NOT NULL DEFAULT false,
    "listaNegraMotivo" TEXT,
    "tipoContrato" TEXT NOT NULL DEFAULT 'externo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usuarioId" TEXT,

    CONSTRAINT "designers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demandas" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "departamento" "Departamento" NOT NULL,
    "area" "AreaDemanda" NOT NULL DEFAULT 'audiovisual',
    "tipoVideo" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "prioridade" "Prioridade" NOT NULL DEFAULT 'normal',
    "motivoUrgencia" TEXT,
    "statusVisivel" "StatusVisivel" NOT NULL DEFAULT 'entrada',
    "statusInterno" "StatusInterno" NOT NULL DEFAULT 'pedido_criado',
    "pesoDemanda" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "riscoAtraso" BOOLEAN NOT NULL DEFAULT false,
    "classificacao" TEXT,
    "campanha" TEXT,
    "objetivo" TEXT,
    "plataforma" TEXT,
    "dataEvento" TIMESTAMP(3),
    "localEvento" TEXT,
    "cobertura" BOOLEAN,
    "publico" TEXT,
    "mensagemPrincipal" TEXT,
    "detalhesEntrega" JSONB,
    "linkBrutos" TEXT,
    "linkFinal" TEXT,
    "linkPostagem" TEXT,
    "postagemTipo" TEXT,
    "linkCliente" TEXT,
    "publicToken" TEXT,
    "publicTokenAtivo" BOOLEAN NOT NULL DEFAULT false,
    "publicTokenExpiraEm" TIMESTAMP(3),
    "localGravacao" TEXT,
    "referencia" TEXT,
    "motivoImpedimento" TEXT,
    "telefoneSolicitante" TEXT,
    "nomeSolicitante" TEXT,
    "clienteFinalNome" TEXT,
    "clienteFinalTelefone" TEXT,
    "clienteFinalEmail" TEXT,
    "notaFiscalUrl" TEXT,
    "notaFiscalNome" TEXT,
    "posicaoKanban" INTEGER,
    "trelloCardId" TEXT,
    "linkFolderBrutos" TEXT,
    "linkFolderFinal" TEXT,
    "thumbnailUrl" TEXT,
    "finalizadaEm" TIMESTAMP(3),
    "limpezaNotificadaEm" TIMESTAMP(3),
    "limpezaExecutadaEm" TIMESTAMP(3),
    "solicitanteId" TEXT NOT NULL,
    "gestorId" TEXT,
    "videomakerId" TEXT,
    "editorId" TEXT,
    "socialId" TEXT,
    "designerId" TEXT,
    "responsavelId" TEXT,
    "linhaProjeto" TEXT,
    "linhaProjetoId" TEXT,
    "dataLimite" TIMESTAMP(3),
    "dataCaptacao" TIMESTAMP(3),
    "dataPostagem" TIMESTAMP(3),
    "dataEntregaCliente" TIMESTAMP(3),
    "dataExpiracao" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "coberturaId" TEXT,
    "eventoGestaoId" TEXT,

    CONSTRAINT "demandas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipoVideo" TEXT,
    "papel" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_template_itens" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "checklist_template_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_itens" (
    "id" TEXT NOT NULL,
    "demandaId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "concluidoEm" TIMESTAMP(3),
    "concluidoPor" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "grupo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checklist_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arquivos" (
    "id" TEXT NOT NULL,
    "demandaId" TEXT NOT NULL,
    "tipoArquivo" "TipoArquivo" NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tamanho" INTEGER,
    "origem" TEXT,
    "sequencia" INTEGER,
    "thumbnailUrl" TEXT,
    "transcodeStatus" TEXT,
    "originalUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arquivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_status" (
    "id" TEXT NOT NULL,
    "demandaId" TEXT NOT NULL,
    "statusAnterior" TEXT,
    "statusNovo" TEXT NOT NULL,
    "usuarioId" TEXT,
    "origem" "OrigemHistorico" NOT NULL DEFAULT 'manual',
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comentarios" (
    "id" TEXT NOT NULL,
    "demandaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "comentario" TEXT NOT NULL,
    "origem" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comentarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas_ia" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "demandaId" TEXT,
    "usuarioId" TEXT,
    "tipoAlerta" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "severidade" "SeveridadeAlerta" NOT NULL DEFAULT 'aviso',
    "status" "StatusAlerta" NOT NULL DEFAULT 'ativo',
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "acaoSugerida" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "snoozeAte" TIMESTAMP(3),

    CONSTRAINT "alertas_ia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aprovacoes_video" (
    "id" TEXT NOT NULL,
    "demandaId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "nomeVideo" TEXT,
    "urlVideo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "aprovadoPor" TEXT,
    "comentario" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aprovacoes_video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_whatsapp" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT,
    "instanceUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "instanceName" TEXT,
    "telefoneConectado" TEXT,
    "pushName" TEXT,
    "connectedAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens_whatsapp" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "demandaId" TEXT,
    "telefone" TEXT NOT NULL,
    "tipoMensagem" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "direcao" "DirecaoWhatsapp" NOT NULL DEFAULT 'saida',
    "status" TEXT NOT NULL DEFAULT 'enviado',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contatos_whatsapp" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'externo',
    "referenciaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contatos_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mapa_lid_whatsapp" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "lidJid" TEXT NOT NULL,
    "realJid" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "pushName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mapa_lid_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_automacao" (
    "id" TEXT NOT NULL,
    "demandaId" TEXT,
    "automacao" TEXT NOT NULL,
    "inputJson" JSONB,
    "outputJson" JSONB,
    "status" TEXT NOT NULL DEFAULT 'sucesso',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_automacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "diaTodo" BOOLEAN NOT NULL DEFAULT false,
    "tipo" "TipoEvento" NOT NULL DEFAULT 'outro',
    "contexto" "ContextoEvento" NOT NULL DEFAULT 'sistema',
    "status" "StatusEvento" NOT NULL DEFAULT 'agendado',
    "cor" TEXT,
    "local" TEXT,
    "privado" BOOLEAN NOT NULL DEFAULT false,
    "demandaId" TEXT,
    "usuarioId" TEXT,
    "videomakerId" TEXT,
    "editorId" TEXT,
    "lembreteMinutos" INTEGER NOT NULL DEFAULT 60,
    "lembreteEnviado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custos_videomaker" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "videomakerId" TEXT NOT NULL,
    "demandaId" TEXT,
    "tipo" "TipoCusto" NOT NULL DEFAULT 'diaria',
    "valor" DOUBLE PRECISION NOT NULL,
    "descricao" TEXT,
    "dataReferencia" TIMESTAMP(3) NOT NULL,
    "pago" BOOLEAN NOT NULL DEFAULT false,
    "dataPagamento" TIMESTAMP(3),
    "comprovante" TEXT,
    "notaFiscalUrl" TEXT,
    "statusPagamento" "StatusPagamento" NOT NULL DEFAULT 'pendente_nf',
    "emailFinanceiroAt" TIMESTAMP(3),
    "dataVencimento" TIMESTAMP(3),
    "ultimaCobrancaEm" TIMESTAMP(3),
    "qtdCobranças" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custos_videomaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relatorios_ia" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "tipo" "TipoRelatorio" NOT NULL,
    "periodo" TEXT NOT NULL,
    "conteudo" JSONB NOT NULL,
    "tokens" INTEGER,
    "modelo" TEXT NOT NULL DEFAULT 'claude-haiku-4-5',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relatorios_ia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_email" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL DEFAULT '',
    "senderEmail" TEXT NOT NULL DEFAULT 'onboarding@resend.dev',
    "senderNome" TEXT NOT NULL DEFAULT 'VideoOps',
    "emailsFinanceiro" TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_email_entrada" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "provedor" TEXT NOT NULL DEFAULT 'microsoft365',
    "emailCaixa" TEXT,
    "tenantId" TEXT,
    "refreshTokenCriptografado" TEXT,
    "remetenteFiltro" TEXT,
    "assuntoFiltro" TEXT,
    "criarDemandaAutomaticamente" BOOLEAN NOT NULL DEFAULT false,
    "solicitantePadraoId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "conectadoEm" TIMESTAMP(3),
    "ultimaSincronizacaoEm" TIMESTAMP(3),
    "ultimoErro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_email_entrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emails_entrada" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "mensagemProvedorId" TEXT NOT NULL,
    "internetMessageId" TEXT,
    "conversationId" TEXT,
    "remetenteNome" TEXT,
    "remetenteEmail" TEXT NOT NULL,
    "destinatarios" TEXT[],
    "assunto" TEXT NOT NULL,
    "recebidoEm" TIMESTAMP(3) NOT NULL,
    "corpoTexto" TEXT NOT NULL,
    "corpoHtml" TEXT,
    "possuiAnexos" BOOLEAN NOT NULL DEFAULT false,
    "anexos" JSONB,
    "dadosExtraidos" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "erro" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "demandaId" TEXT,
    "processadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emails_entrada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacoes_videomaker" (
    "id" TEXT NOT NULL,
    "videomakerId" TEXT NOT NULL,
    "nota" INTEGER NOT NULL,
    "comentario" TEXT,
    "avaliadorId" TEXT,
    "demandaId" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'interno',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avaliacoes_videomaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacoes_editor" (
    "id" TEXT NOT NULL,
    "editorId" TEXT NOT NULL,
    "nota" INTEGER NOT NULL,
    "comentario" TEXT,
    "atendeuDemandas" BOOLEAN,
    "foiAtencioso" BOOLEAN,
    "contratariaNovamente" BOOLEAN,
    "avaliadorId" TEXT,
    "demandaId" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'interno',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avaliacoes_editor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_parametros" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_parametros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_ia_mensagens" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "tokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_ia_mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agente_execucoes" (
    "id" TEXT NOT NULL,
    "agente" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'executando',
    "resultado" JSONB,
    "tokens" INTEGER,
    "alertasGerados" INTEGER NOT NULL DEFAULT 0,
    "ferramentas" TEXT[],
    "erro" TEXT,
    "criadoPor" TEXT,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agente_execucoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fabricantes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fabricantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria" TEXT,
    "fabricanteId" TEXT,
    "peso" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "alertaDias" INTEGER NOT NULL DEFAULT 30,
    "ultimoConteudo" TIMESTAMP(3),
    "totalConteudos" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demanda_produto" (
    "id" TEXT NOT NULL,
    "demandaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demanda_produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demanda_responsavel" (
    "id" TEXT NOT NULL,
    "demandaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demanda_responsavel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ideias_video" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "linkReferencia" TEXT,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "origem" "OrigemIdeia" NOT NULL DEFAULT 'manual',
    "plataforma" TEXT,
    "status" "StatusIdeia" NOT NULL DEFAULT 'nova',
    "classificacao" TEXT,
    "scoreIA" DOUBLE PRECISION,
    "analiseIA" TEXT,
    "sugestaoTipo" TEXT,
    "sugestaoPrioridade" TEXT,
    "analisadoEm" TIMESTAMP(3),
    "enviadoPor" TEXT,
    "telefoneOrigem" TEXT,
    "usuarioId" TEXT,
    "produtoId" TEXT,
    "demandaId" TEXT,
    "convertidoEm" TIMESTAMP(3),
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ideias_video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_trello" (
    "id" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "listMapping" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_trello_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissoes_usuario" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "verDashboard" BOOLEAN NOT NULL DEFAULT true,
    "verDemandas" BOOLEAN NOT NULL DEFAULT true,
    "verAprovacoes" BOOLEAN NOT NULL DEFAULT false,
    "verAprovacoesGrowth" BOOLEAN NOT NULL DEFAULT false,
    "verAgenda" BOOLEAN NOT NULL DEFAULT false,
    "verProdutos" BOOLEAN NOT NULL DEFAULT false,
    "verVideomakers" BOOLEAN NOT NULL DEFAULT false,
    "verEquipe" BOOLEAN NOT NULL DEFAULT false,
    "verCustos" BOOLEAN NOT NULL DEFAULT false,
    "verIA" BOOLEAN NOT NULL DEFAULT false,
    "verAlertas" BOOLEAN NOT NULL DEFAULT false,
    "verRelatorios" BOOLEAN NOT NULL DEFAULT false,
    "verUsuarios" BOOLEAN NOT NULL DEFAULT false,
    "verConfiguracoes" BOOLEAN NOT NULL DEFAULT false,
    "verIdeias" BOOLEAN NOT NULL DEFAULT false,
    "verEventos" BOOLEAN NOT NULL DEFAULT false,
    "verCoberturas" BOOLEAN NOT NULL DEFAULT false,
    "verFinanceiroEvento" BOOLEAN NOT NULL DEFAULT false,
    "gerenciarFornecedores" BOOLEAN NOT NULL DEFAULT false,
    "verDesign" BOOLEAN NOT NULL DEFAULT false,
    "gerenciarDesigners" BOOLEAN NOT NULL DEFAULT false,
    "criarDemanda" BOOLEAN NOT NULL DEFAULT false,
    "editarDemanda" BOOLEAN NOT NULL DEFAULT false,
    "excluirDemanda" BOOLEAN NOT NULL DEFAULT false,
    "moverKanban" BOOLEAN NOT NULL DEFAULT false,
    "verTodasDemandas" BOOLEAN NOT NULL DEFAULT false,
    "verKanban" BOOLEAN NOT NULL DEFAULT true,
    "gerenciarUsuarios" BOOLEAN NOT NULL DEFAULT false,
    "gerenciarConfig" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissoes_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "convites_videomaker" (
    "id" TEXT NOT NULL,
    "demandaId" TEXT NOT NULL,
    "videomakerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "respondidoEm" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convites_videomaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_fiscais" (
    "id" TEXT NOT NULL,
    "demandaId" TEXT NOT NULL,
    "videomakerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "url" TEXT,
    "nomeArquivo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notas_fiscais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_empresa" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "cnpj" TEXT,
    "razaoSocial" TEXT,
    "nomeFantasia" TEXT,
    "endereco" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "cep" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "pixKey" TEXT,
    "pixTipo" TEXT,
    "observacoesNF" TEXT,
    "googleRefreshToken" TEXT,
    "googleDriveEmail" TEXT,
    "googleDriveConnectedAt" TIMESTAMP(3),
    "googleDriveFolderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depoimentos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cidade" TEXT,
    "videoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "depoimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coberturas" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "tipo" "TipoCobertura" NOT NULL DEFAULT 'outro',
    "status" "StatusCobertura" NOT NULL DEFAULT 'planejamento',
    "descricao" TEXT,
    "cliente" TEXT,
    "local" TEXT,
    "cidade" TEXT,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "totalDias" INTEGER NOT NULL DEFAULT 1,
    "diasAtivos" INTEGER NOT NULL DEFAULT 0,
    "linkDrive" TEXT,
    "linkDownloadPublico" BOOLEAN NOT NULL DEFAULT false,
    "senhaDownload" TEXT,
    "produtoId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coberturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coberturas_equipe" (
    "id" TEXT NOT NULL,
    "coberturaId" TEXT NOT NULL,
    "videomakerId" TEXT,
    "editorId" TEXT,
    "usuarioId" TEXT,
    "nome" TEXT NOT NULL,
    "funcao" "FuncaoEquipe" NOT NULL DEFAULT 'captacao',
    "diariasTotal" INTEGER NOT NULL DEFAULT 0,
    "diariasEfetuadas" INTEGER NOT NULL DEFAULT 0,
    "valorDiaria" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coberturas_equipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coberturas_checklist" (
    "id" TEXT NOT NULL,
    "coberturaId" TEXT NOT NULL,
    "dia" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "categoria" "CategoriaChecklist" NOT NULL DEFAULT 'equipamento',
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "concluidoEm" TIMESTAMP(3),
    "concluidoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coberturas_checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coberturas_uploads" (
    "id" TEXT NOT NULL,
    "coberturaId" TEXT NOT NULL,
    "membroId" TEXT,
    "dia" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'video',
    "momento" "TipoMomento" NOT NULL DEFAULT 'outro',
    "titulo" TEXT,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "duracao" INTEGER,
    "tamanhoBytes" BIGINT,
    "driveUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coberturas_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_face_descriptors" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "descriptor" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_face_descriptors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coberturas_album" (
    "id" TEXT NOT NULL,
    "coberturaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "momento" "TipoMomento" NOT NULL DEFAULT 'outro',
    "dia" INTEGER,
    "fotos" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coberturas_album_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coberturas_log" (
    "id" TEXT NOT NULL,
    "coberturaId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "acao" TEXT NOT NULL,
    "detalhe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coberturas_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_gestao" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoEventoGestao" NOT NULL DEFAULT 'outro',
    "status" "StatusEventoGestao" NOT NULL DEFAULT 'planejamento',
    "descricao" TEXT,
    "objetivo" TEXT,
    "publicoAlvo" TEXT,
    "observacoes" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "local" TEXT,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "responsavelId" TEXT,
    "orcamentoPrevisto" DOUBLE PRECISION,
    "orcamentoAprovado" DOUBLE PRECISION,
    "percentualConclusao" INTEGER NOT NULL DEFAULT 0,
    "linkDrive" TEXT,
    "coberturaId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eventos_gestao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_gestao_checklist" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria" TEXT,
    "responsavelId" TEXT,
    "prazo" TIMESTAMP(3),
    "status" "StatusTarefa" NOT NULL DEFAULT 'pendente',
    "prioridade" "PrioridadeTarefa" NOT NULL DEFAULT 'media',
    "uploadObrigatorio" BOOLEAN NOT NULL DEFAULT false,
    "custoEventoId" TEXT,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "concluidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_gestao_checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_gestao_documentos" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "categoria" "CategoriaDocumento" NOT NULL DEFAULT 'outros',
    "nome" TEXT NOT NULL,
    "url" TEXT,
    "linkExterno" TEXT,
    "responsavelId" TEXT,
    "prazo" TIMESTAMP(3),
    "status" "StatusDocumento" NOT NULL DEFAULT 'pendente',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eventos_gestao_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fornecedores" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "contato" TEXT,
    "cnpj" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "categoria" "CategoriaFornecedor" NOT NULL DEFAULT 'outros',
    "dadosBancarios" TEXT,
    "pixKey" TEXT,
    "observacoes" TEXT,
    "avaliacao" DOUBLE PRECISION DEFAULT 5.0,
    "status" "StatusUsuario" NOT NULL DEFAULT 'ativo',
    "portalToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos_servico_evento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT,
    "fornecedorId" TEXT,
    "valorUnitario" DOUBLE PRECISION,
    "unidadeMedida" "UnidadeMedida" NOT NULL DEFAULT 'unidade',
    "quantidadeMinima" INTEGER,
    "prazoMedioDias" INTEGER,
    "imagemUrl" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produtos_servico_evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custos_evento" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "produtoServicoId" TEXT,
    "categoria" "CategoriaCusto" NOT NULL DEFAULT 'extras',
    "descricao" TEXT NOT NULL,
    "valorPrevisto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "valorReal" DOUBLE PRECISION,
    "quantidade" DOUBLE PRECISION,
    "pago" BOOLEAN NOT NULL DEFAULT false,
    "dataPagamento" TIMESTAMP(3),
    "notaFiscalUrl" TEXT,
    "statusPagamento" "StatusPagamento" NOT NULL DEFAULT 'pendente_nf',
    "dataVencimento" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custos_evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_gestao_aprovacoes" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "tipo" "TipoAprovacao" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "aprovadoPor" TEXT,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eventos_gestao_aprovacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_gestao_log" (
    "id" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "usuarioId" TEXT,
    "acao" TEXT NOT NULL,
    "detalhe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_gestao_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "producao_manual" (
    "organizacaoId" TEXT,
    "id" TEXT NOT NULL,
    "competencia" INTEGER NOT NULL,
    "area" TEXT NOT NULL DEFAULT 'audiovisual',
    "grupo" TEXT NOT NULL DEFAULT 'producao',
    "categoria" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "producao_manual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizacoes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "relatorioToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linhas_projeto" (
    "id" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "linhas_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_organizacao" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "organizacaoId" TEXT NOT NULL,
    "papel" "TipoUsuario" NOT NULL DEFAULT 'solicitante',
    "categoria" "CategoriaPessoa" NOT NULL DEFAULT 'interna',
    "funcaoProfissional" TEXT,
    "areas" "AreaAtuacao"[],
    "liderAudiovisual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_organizacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "videomakers_usuarioId_key" ON "videomakers"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "editores_usuarioId_key" ON "editores"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "designers_usuarioId_key" ON "designers"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "demandas_codigo_key" ON "demandas"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "demandas_publicToken_key" ON "demandas"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX "demandas_trelloCardId_key" ON "demandas"("trelloCardId");

-- CreateIndex
CREATE UNIQUE INDEX "aprovacoes_video_token_key" ON "aprovacoes_video"("token");

-- CreateIndex
CREATE UNIQUE INDEX "config_whatsapp_organizacaoId_key" ON "config_whatsapp"("organizacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "config_whatsapp_instanceId_key" ON "config_whatsapp"("instanceId");

-- CreateIndex
CREATE UNIQUE INDEX "contatos_whatsapp_organizacaoId_telefone_key" ON "contatos_whatsapp"("organizacaoId", "telefone");

-- CreateIndex
CREATE INDEX "mapa_lid_whatsapp_telefone_idx" ON "mapa_lid_whatsapp"("telefone");

-- CreateIndex
CREATE UNIQUE INDEX "mapa_lid_whatsapp_organizacaoId_lidJid_key" ON "mapa_lid_whatsapp"("organizacaoId", "lidJid");

-- CreateIndex
CREATE UNIQUE INDEX "config_email_entrada_organizacaoId_key" ON "config_email_entrada"("organizacaoId");

-- CreateIndex
CREATE INDEX "emails_entrada_organizacaoId_status_recebidoEm_idx" ON "emails_entrada"("organizacaoId", "status", "recebidoEm");

-- CreateIndex
CREATE INDEX "emails_entrada_demandaId_idx" ON "emails_entrada"("demandaId");

-- CreateIndex
CREATE UNIQUE INDEX "emails_entrada_organizacaoId_mensagemProvedorId_key" ON "emails_entrada"("organizacaoId", "mensagemProvedorId");

-- CreateIndex
CREATE UNIQUE INDEX "config_parametros_grupo_valor_key" ON "config_parametros"("grupo", "valor");

-- CreateIndex
CREATE INDEX "chat_ia_mensagens_sessionId_idx" ON "chat_ia_mensagens"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "fabricantes_nome_key" ON "fabricantes"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "demanda_produto_demandaId_produtoId_key" ON "demanda_produto"("demandaId", "produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "demanda_responsavel_demandaId_usuarioId_key" ON "demanda_responsavel"("demandaId", "usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "ideias_video_demandaId_key" ON "ideias_video"("demandaId");

-- CreateIndex
CREATE UNIQUE INDEX "permissoes_usuario_usuarioId_key" ON "permissoes_usuario"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "convites_videomaker_token_key" ON "convites_videomaker"("token");

-- CreateIndex
CREATE UNIQUE INDEX "notas_fiscais_token_key" ON "notas_fiscais"("token");

-- CreateIndex
CREATE UNIQUE INDEX "coberturas_slug_key" ON "coberturas"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "eventos_gestao_codigo_key" ON "eventos_gestao"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "eventos_gestao_coberturaId_key" ON "eventos_gestao"("coberturaId");

-- CreateIndex
CREATE UNIQUE INDEX "fornecedores_portalToken_key" ON "fornecedores"("portalToken");

-- CreateIndex
CREATE UNIQUE INDEX "producao_manual_competencia_area_grupo_categoria_key" ON "producao_manual"("competencia", "area", "grupo", "categoria");

-- CreateIndex
CREATE UNIQUE INDEX "organizacoes_slug_key" ON "organizacoes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organizacoes_relatorioToken_key" ON "organizacoes"("relatorioToken");

-- CreateIndex
CREATE INDEX "linhas_projeto_organizacaoId_idx" ON "linhas_projeto"("organizacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "linhas_projeto_organizacaoId_nome_key" ON "linhas_projeto"("organizacaoId", "nome");

-- CreateIndex
CREATE INDEX "usuario_organizacao_organizacaoId_idx" ON "usuario_organizacao"("organizacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_organizacao_usuarioId_organizacaoId_key" ON "usuario_organizacao"("usuarioId", "organizacaoId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videomakers" ADD CONSTRAINT "videomakers_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "editores" ADD CONSTRAINT "editores_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "designers" ADD CONSTRAINT "designers_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_gestorId_fkey" FOREIGN KEY ("gestorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_videomakerId_fkey" FOREIGN KEY ("videomakerId") REFERENCES "videomakers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "editores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_designerId_fkey" FOREIGN KEY ("designerId") REFERENCES "designers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_linhaProjetoId_fkey" FOREIGN KEY ("linhaProjetoId") REFERENCES "linhas_projeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_coberturaId_fkey" FOREIGN KEY ("coberturaId") REFERENCES "coberturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_eventoGestaoId_fkey" FOREIGN KEY ("eventoGestaoId") REFERENCES "eventos_gestao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_template_itens" ADD CONSTRAINT "checklist_template_itens_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_itens" ADD CONSTRAINT "checklist_itens_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_status" ADD CONSTRAINT "historico_status_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_status" ADD CONSTRAINT "historico_status_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas_ia" ADD CONSTRAINT "alertas_ia_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aprovacoes_video" ADD CONSTRAINT "aprovacoes_video_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens_whatsapp" ADD CONSTRAINT "mensagens_whatsapp_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "demandas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_automacao" ADD CONSTRAINT "logs_automacao_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "demandas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_videomakerId_fkey" FOREIGN KEY ("videomakerId") REFERENCES "videomakers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "editores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custos_videomaker" ADD CONSTRAINT "custos_videomaker_videomakerId_fkey" FOREIGN KEY ("videomakerId") REFERENCES "videomakers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custos_videomaker" ADD CONSTRAINT "custos_videomaker_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "demandas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_email_entrada" ADD CONSTRAINT "config_email_entrada_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails_entrada" ADD CONSTRAINT "emails_entrada_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails_entrada" ADD CONSTRAINT "emails_entrada_configId_fkey" FOREIGN KEY ("configId") REFERENCES "config_email_entrada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails_entrada" ADD CONSTRAINT "emails_entrada_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "demandas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_videomaker" ADD CONSTRAINT "avaliacoes_videomaker_videomakerId_fkey" FOREIGN KEY ("videomakerId") REFERENCES "videomakers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes_editor" ADD CONSTRAINT "avaliacoes_editor_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "editores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_fabricanteId_fkey" FOREIGN KEY ("fabricanteId") REFERENCES "fabricantes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demanda_produto" ADD CONSTRAINT "demanda_produto_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demanda_produto" ADD CONSTRAINT "demanda_produto_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demanda_responsavel" ADD CONSTRAINT "demanda_responsavel_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demanda_responsavel" ADD CONSTRAINT "demanda_responsavel_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideias_video" ADD CONSTRAINT "ideias_video_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideias_video" ADD CONSTRAINT "ideias_video_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideias_video" ADD CONSTRAINT "ideias_video_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "demandas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissoes_usuario" ADD CONSTRAINT "permissoes_usuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convites_videomaker" ADD CONSTRAINT "convites_videomaker_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convites_videomaker" ADD CONSTRAINT "convites_videomaker_videomakerId_fkey" FOREIGN KEY ("videomakerId") REFERENCES "videomakers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_demandaId_fkey" FOREIGN KEY ("demandaId") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_videomakerId_fkey" FOREIGN KEY ("videomakerId") REFERENCES "videomakers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coberturas" ADD CONSTRAINT "coberturas_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coberturas" ADD CONSTRAINT "coberturas_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coberturas_equipe" ADD CONSTRAINT "coberturas_equipe_coberturaId_fkey" FOREIGN KEY ("coberturaId") REFERENCES "coberturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coberturas_equipe" ADD CONSTRAINT "coberturas_equipe_videomakerId_fkey" FOREIGN KEY ("videomakerId") REFERENCES "videomakers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coberturas_equipe" ADD CONSTRAINT "coberturas_equipe_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "editores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coberturas_equipe" ADD CONSTRAINT "coberturas_equipe_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coberturas_checklist" ADD CONSTRAINT "coberturas_checklist_coberturaId_fkey" FOREIGN KEY ("coberturaId") REFERENCES "coberturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coberturas_uploads" ADD CONSTRAINT "coberturas_uploads_coberturaId_fkey" FOREIGN KEY ("coberturaId") REFERENCES "coberturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coberturas_uploads" ADD CONSTRAINT "coberturas_uploads_membroId_fkey" FOREIGN KEY ("membroId") REFERENCES "coberturas_equipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_face_descriptors" ADD CONSTRAINT "evento_face_descriptors_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "coberturas_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coberturas_album" ADD CONSTRAINT "coberturas_album_coberturaId_fkey" FOREIGN KEY ("coberturaId") REFERENCES "coberturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coberturas_log" ADD CONSTRAINT "coberturas_log_coberturaId_fkey" FOREIGN KEY ("coberturaId") REFERENCES "coberturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_gestao" ADD CONSTRAINT "eventos_gestao_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_gestao" ADD CONSTRAINT "eventos_gestao_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_gestao" ADD CONSTRAINT "eventos_gestao_coberturaId_fkey" FOREIGN KEY ("coberturaId") REFERENCES "coberturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_gestao_checklist" ADD CONSTRAINT "eventos_gestao_checklist_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "eventos_gestao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_gestao_checklist" ADD CONSTRAINT "eventos_gestao_checklist_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_gestao_documentos" ADD CONSTRAINT "eventos_gestao_documentos_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "eventos_gestao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_gestao_documentos" ADD CONSTRAINT "eventos_gestao_documentos_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos_servico_evento" ADD CONSTRAINT "produtos_servico_evento_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custos_evento" ADD CONSTRAINT "custos_evento_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "eventos_gestao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custos_evento" ADD CONSTRAINT "custos_evento_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custos_evento" ADD CONSTRAINT "custos_evento_produtoServicoId_fkey" FOREIGN KEY ("produtoServicoId") REFERENCES "produtos_servico_evento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_gestao_aprovacoes" ADD CONSTRAINT "eventos_gestao_aprovacoes_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "eventos_gestao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_gestao_log" ADD CONSTRAINT "eventos_gestao_log_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "eventos_gestao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_projeto" ADD CONSTRAINT "linhas_projeto_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_organizacao" ADD CONSTRAINT "usuario_organizacao_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_organizacao" ADD CONSTRAINT "usuario_organizacao_organizacaoId_fkey" FOREIGN KEY ("organizacaoId") REFERENCES "organizacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;


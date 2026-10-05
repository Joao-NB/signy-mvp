CREATE TABLE IF NOT EXISTS usuario (id SERIAL PRIMARY KEY, nome VARCHAR(150) NOT NULL, login VARCHAR(150) UNIQUE NOT NULL, senha_hash TEXT NOT NULL);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS aprovado BOOLEAN NOT NULL DEFAULT TRUE;
CREATE TABLE IF NOT EXISTS sessao (token TEXT PRIMARY KEY, id_usuario INTEGER REFERENCES usuario(id), expira TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS aluno (id_aluno SERIAL PRIMARY KEY, nome VARCHAR(150) NOT NULL, cpf CHAR(11) NOT NULL UNIQUE CHECK(cpf ~ '^[0-9]{11}$'), data_nascimento DATE NOT NULL, sexo CHAR(1) CHECK(sexo IN ('M','F')), telefone VARCHAR(15), email VARCHAR(150) UNIQUE, data_cadastro DATE NOT NULL DEFAULT CURRENT_DATE);
CREATE TABLE IF NOT EXISTS professor (id_professor SERIAL PRIMARY KEY, nome VARCHAR(150) NOT NULL, cpf CHAR(11) NOT NULL UNIQUE CHECK(cpf ~ '^[0-9]{11}$'), telefone VARCHAR(15), email VARCHAR(150) UNIQUE, especialidade VARCHAR(100), data_admissao DATE NOT NULL DEFAULT CURRENT_DATE);
CREATE TABLE IF NOT EXISTS plano (id_plano SERIAL PRIMARY KEY, nome VARCHAR(100) NOT NULL, descricao TEXT, valor_mensal NUMERIC(8,2) NOT NULL CHECK(valor_mensal>0), duracao_meses INTEGER NOT NULL CHECK(duracao_meses>0), ativo BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS matricula (id_matricula SERIAL PRIMARY KEY, id_aluno INTEGER NOT NULL REFERENCES aluno(id_aluno), id_plano INTEGER NOT NULL REFERENCES plano(id_plano), data_inicio DATE NOT NULL, data_fim DATE NOT NULL, situacao VARCHAR(10) NOT NULL DEFAULT 'ativa' CHECK(situacao IN ('ativa','vencida','cancelada')), data_cadastro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK(data_fim>data_inicio));
CREATE UNIQUE INDEX IF NOT EXISTS idx_matricula_ativa_unica ON matricula(id_aluno) WHERE situacao='ativa';
CREATE INDEX IF NOT EXISTS idx_matricula_aluno ON matricula(id_aluno);
CREATE INDEX IF NOT EXISTS idx_matricula_situacao ON matricula(situacao);
CREATE TABLE IF NOT EXISTS exercicio (id_exercicio SERIAL PRIMARY KEY, nome VARCHAR(150) NOT NULL, grupo_muscular VARCHAR(50) NOT NULL, descricao TEXT);
CREATE TABLE IF NOT EXISTS ficha_treino (id_ficha SERIAL PRIMARY KEY, id_aluno INTEGER NOT NULL REFERENCES aluno(id_aluno), id_professor INTEGER NOT NULL REFERENCES professor(id_professor), descricao VARCHAR(100) NOT NULL, data_criacao DATE NOT NULL DEFAULT CURRENT_DATE, ativa BOOLEAN NOT NULL DEFAULT TRUE);
CREATE INDEX IF NOT EXISTS idx_ficha_treino_aluno ON ficha_treino(id_aluno);
CREATE TABLE IF NOT EXISTS ficha_exercicio (id_ficha_exercicio SERIAL PRIMARY KEY, id_ficha INTEGER NOT NULL REFERENCES ficha_treino(id_ficha) ON DELETE CASCADE, id_exercicio INTEGER NOT NULL REFERENCES exercicio(id_exercicio), ordem INTEGER NOT NULL CHECK(ordem>0), series INTEGER NOT NULL CHECK(series>0), repeticoes INTEGER NOT NULL CHECK(repeticoes>0), carga_sugerida NUMERIC(6,2) CHECK(carga_sugerida>=0), observacao TEXT, UNIQUE(id_ficha,id_exercicio));
CREATE TABLE IF NOT EXISTS presenca (id_presenca SERIAL PRIMARY KEY, id_aluno INTEGER NOT NULL REFERENCES aluno(id_aluno), data_presenca DATE NOT NULL DEFAULT CURRENT_DATE, hora_entrada TIME NOT NULL DEFAULT LOCALTIME, UNIQUE(id_aluno,data_presenca));
CREATE INDEX IF NOT EXISTS idx_presenca_aluno ON presenca(id_aluno);
CREATE INDEX IF NOT EXISTS idx_presenca_data ON presenca(data_presenca);
CREATE OR REPLACE FUNCTION atualizar_auditoria() RETURNS TRIGGER AS $$ BEGIN NEW.atualizado_em=CURRENT_TIMESTAMP; RETURN NEW; END; $$ LANGUAGE plpgsql;
DO $$ DECLARE t TEXT; BEGIN FOREACH t IN ARRAY ARRAY['aluno','professor','plano','matricula','exercicio','ficha_treino','ficha_exercicio','presenca'] LOOP
EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP',t);
EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP',t);
EXECUTE format('CREATE OR REPLACE TRIGGER auditoria BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION atualizar_auditoria()',t);
END LOOP; END $$;

ALTER TABLE usuario ADD COLUMN IF NOT EXISTS perfil VARCHAR(20) NOT NULL DEFAULT 'administrador' CHECK(perfil IN ('administrador','recepcionista','professor','aluno'));
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS email VARCHAR(150);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS id_aluno INTEGER REFERENCES aluno(id_aluno);
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS id_professor INTEGER REFERENCES professor(id_professor);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuario_aluno ON usuario(id_aluno) WHERE id_aluno IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuario_email ON usuario(lower(email)) WHERE email IS NOT NULL;
ALTER TABLE exercicio ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE presenca ADD COLUMN IF NOT EXISTS saida_em TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS token_acesso (token_hash TEXT PRIMARY KEY, id_usuario INTEGER NOT NULL REFERENCES usuario(id), finalidade TEXT NOT NULL CHECK(finalidade IN ('convite','recuperacao')), expira TIMESTAMPTZ NOT NULL, usado_em TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS idx_sessao_usuario ON sessao(id_usuario);
CREATE INDEX IF NOT EXISTS idx_sessao_expira ON sessao(expira);
CREATE INDEX IF NOT EXISTS idx_matricula_vigencia ON matricula(situacao,data_fim,id_aluno);
CREATE INDEX IF NOT EXISTS idx_ficha_exercicio_ficha ON ficha_exercicio(id_ficha,ordem);
CREATE TABLE IF NOT EXISTS mensalidade (
 id_mensalidade SERIAL PRIMARY KEY, id_matricula INTEGER NOT NULL REFERENCES matricula(id_matricula),
 competencia DATE NOT NULL, vencimento DATE NOT NULL, valor NUMERIC(10,2) NOT NULL CHECK(valor>0),
 situacao TEXT NOT NULL DEFAULT 'pendente' CHECK(situacao IN ('pendente','pago','cancelado')),
 pago_em TIMESTAMPTZ, motivo_cancelamento TEXT, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(id_matricula,competencia)
);
ALTER TABLE matricula ADD COLUMN IF NOT EXISTS valor_contratado NUMERIC(10,2) CHECK(valor_contratado>0);
ALTER TABLE matricula ADD COLUMN IF NOT EXISTS meses_contratados INTEGER CHECK(meses_contratados>0);
ALTER TABLE matricula ADD COLUMN IF NOT EXISTS cancelada_em TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_mensalidade_vencimento ON mensalidade(situacao,vencimento);
CREATE TABLE IF NOT EXISTS pagamento (
 id_pagamento SERIAL PRIMARY KEY, id_mensalidade INTEGER NOT NULL REFERENCES mensalidade(id_mensalidade),
 provedor TEXT NOT NULL, referencia TEXT NOT NULL UNIQUE, valor NUMERIC(10,2) NOT NULL CHECK(valor>0),
 meio TEXT NOT NULL, situacao TEXT NOT NULL CHECK(situacao IN ('pendente','confirmado','rejeitado','estornado','cancelado')),
 comprovante TEXT, registrado_por INTEGER REFERENCES usuario(id), confirmado_em TIMESTAMPTZ, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pagamento_confirmado ON pagamento(id_mensalidade) WHERE situacao='confirmado';
CREATE TABLE IF NOT EXISTS checkout (
 id_mensalidade INTEGER PRIMARY KEY REFERENCES mensalidade(id_mensalidade), chave TEXT NOT NULL UNIQUE,
 url TEXT, expira TIMESTAMPTZ NOT NULL, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS evento_financeiro (
 id_evento SERIAL PRIMARY KEY, id_mensalidade INTEGER NOT NULL REFERENCES mensalidade(id_mensalidade),
 chave TEXT UNIQUE, tipo TEXT NOT NULL, detalhe TEXT NOT NULL, id_usuario INTEGER REFERENCES usuario(id), criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

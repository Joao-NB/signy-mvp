-- Uma academia por banco: o modelo existente não possui tenants/unidades.
CREATE TABLE configuracao_academia (
 id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id=1), nome VARCHAR(150) NOT NULL DEFAULT 'Minha academia',
 latitude DOUBLE PRECISION NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude DOUBLE PRECISION NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 raio_metros INTEGER NOT NULL CHECK(raio_metros BETWEEN 10 AND 1000),
 precisao_maxima INTEGER NOT NULL CHECK(precisao_maxima BETWEEN 5 AND 150),
 abertura TIME NOT NULL, fechamento TIME NOT NULL, CHECK(abertura<fechamento),
 criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER auditoria BEFORE UPDATE ON configuracao_academia FOR EACH ROW EXECUTE FUNCTION atualizar_auditoria();
ALTER TABLE checkout ADD COLUMN preference_id TEXT;
ALTER TABLE pagamento ADD COLUMN atualizado_gateway TIMESTAMPTZ;
CREATE TABLE email_envio (
 id SERIAL PRIMARY KEY, finalidade TEXT NOT NULL, id_usuario INTEGER REFERENCES usuario(id),
 id_mensalidade INTEGER REFERENCES mensalidade(id_mensalidade), chave TEXT NOT NULL UNIQUE,
 situacao TEXT NOT NULL DEFAULT 'fila' CHECK(situacao IN ('fila','processando','aceito','entregue','falha','cancelado')),
 provedor_id TEXT, evento_provedor TEXT, erro TEXT, tentativas INTEGER NOT NULL DEFAULT 0,
 proxima_tentativa TIMESTAMPTZ NOT NULL DEFAULT NOW(), criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_email_fila ON email_envio(situacao,proxima_tentativa);

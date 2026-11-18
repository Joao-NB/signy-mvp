-- Preserve registrations and all linked history when leaving the active catalogue.
ALTER TABLE aluno ADD COLUMN IF NOT EXISTS arquivado_em TIMESTAMPTZ;
ALTER TABLE professor ADD COLUMN IF NOT EXISTS arquivado_em TIMESTAMPTZ;
ALTER TABLE exercicio ADD COLUMN IF NOT EXISTS arquivado_em TIMESTAMPTZ;

import pg from 'pg';

if (!process.env.DATABASE_URL) {
  throw Error('DATABASE_URL não está configurada. Execute Conectar ao Neon.cmd.');
}
const url = new URL(process.env.DATABASE_URL);
if (!url.hostname.endsWith('.neon.tech')) {
  throw Error('DATABASE_URL não aponta para o Neon (*.neon.tech).');
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 20000 });
try {
  await client.connect();
  const { rows } = await client.query("SELECT current_database() AS banco, to_regclass('public.usuario') IS NOT NULL AS usuarios_criados");
  const quantidade = rows[0].usuarios_criados
    ? Number((await client.query('SELECT COUNT(*) AS total FROM public.usuario')).rows[0].total)
    : 0;
  console.log(`Conexão com o Neon confirmada: ${url.hostname}`);
  console.log(`Banco: ${rows[0].banco}; contas cadastradas: ${quantidade}`);
} finally {
  await client.end().catch(() => {});
}

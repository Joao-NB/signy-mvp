import path from 'node:path';

// A mesma API de consulta atende ao banco local e ao PostgreSQL hospedado.
export function postgresAdapter(pool) {
  return {
    query: (sql, params = []) => pool.query(sql, params),
    exec: sql => pool.query(sql),
    close: () => pool.end(),
    async transaction(operation) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await operation({ query: (sql, params = []) => client.query(sql, params) });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export async function connectDatabase(root) {
  if (process.env.DATABASE_URL) {
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 20000,
      options: '-c timezone=America/Fortaleza',
    });
    pool.on('error', () => console.error('Conexão do banco encerrada. Será restabelecida na próxima consulta.'));
    return postgresAdapter(pool);
  }
  if (process.env.NODE_ENV === 'production' && !process.env.DATA_DIR) {
    throw Error('Configure DATABASE_URL (banco externo) ou DATA_DIR em um volume persistente.');
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite(process.env.DATA_DIR || path.join(root, 'data'));
  await db.exec("SET TIME ZONE 'America/Fortaleza'");
  return db;
}

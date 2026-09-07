import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postgresAdapter } from '../database.mjs';

test('PostgreSQL externo usa a mesma conexão durante toda a transação', async () => {
  const calls = [];
  const client = { query: async (sql, params) => { calls.push([sql, params]); return { rows: [{ id: 1 }] }; }, release: () => calls.push(['release']) };
  const db = postgresAdapter({ connect: async () => client });
  const result = await db.transaction(async tx => (await tx.query('SELECT $1', [1])).rows[0]);
  assert.deepEqual(result, { id: 1 });
  assert.deepEqual(calls.map(c => c[0]), ['BEGIN', 'SELECT $1', 'COMMIT', 'release']);
  assert.deepEqual(calls[1][1], [1]);
});

test('PostgreSQL externo desfaz e libera conexão em caso de falha', async () => {
  const calls = [];
  const client = { query: async sql => calls.push(sql), release: () => calls.push('release') };
  const db = postgresAdapter({ connect: async () => client });
  await assert.rejects(db.transaction(async () => { throw Error('Exercício duplicado'); }), /duplicado/);
  assert.deepEqual(calls, ['BEGIN', 'ROLLBACK', 'release']);
});

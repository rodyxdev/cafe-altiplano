#!/usr/bin/env node
/**
 * Aplica los archivos SQL de db/ en orden.
 *
 *   npm run migrate
 *
 * Cada archivo corre completo dentro de una transacción: si algo falla, ese
 * archivo no deja nada a medias. Los tres son idempotentes, así que se puede
 * volver a correr sin problema.
 *
 * Usa DATABASE_URL, que solo existe para esto: el servidor en runtime habla
 * con Supabase por HTTPS con SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY y no
 * necesita acceso directo a Postgres.
 */
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DIR = path.join(__dirname, '..', 'db');
const ARCHIVOS = ['01_schema.sql', '02_rls.sql', '03_functions.sql'];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Falta DATABASE_URL en .env (solo se usa para migraciones).');
    process.exit(1);
  }

  const client = new Client({
    connectionString: url,
    // El pooler de Supabase presenta un certificado que no está en el
    // almacén público de CAs. La conexión va cifrada, pero sin validar la
    // cadena. Es aceptable para una migración puntual desde la máquina de
    // desarrollo; el servidor en runtime no usa esta ruta.
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000
  });

  await client.connect();
  const { rows } = await client.query('select current_database() as db, current_user as usuario');
  console.log('Conectado a ' + rows[0].db + ' como ' + rows[0].usuario);

  for (const archivo of ARCHIVOS) {
    const sql = fs.readFileSync(path.join(DIR, archivo), 'utf8');
    process.stdout.write('  ' + archivo + ' ... ');
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('commit');
      console.log('ok');
    } catch (e) {
      await client.query('rollback').catch(() => {});
      console.log('FALLÓ');
      console.error('    ' + e.message);
      if (e.position) console.error('    posición ' + e.position);
      await client.end();
      process.exit(1);
    }
  }

  // Resumen de lo que quedó creado.
  const tablas = await client.query(
    "select table_name from information_schema.tables " +
    "where table_schema = 'public' and table_name like 'cafe_%' order by 1"
  );
  const politicas = await client.query(
    "select tablename, policyname from pg_policies " +
    "where schemaname = 'public' and tablename like 'cafe_%' order by 1"
  );
  const rls = await client.query(
    "select relname, relrowsecurity from pg_class " +
    "where relnamespace = 'public'::regnamespace and relname like 'cafe_%' " +
    "and relkind = 'r' order by 1"
  );
  const funciones = await client.query(
    "select proname from pg_proc " +
    "where pronamespace = 'public'::regnamespace and proname like 'cafe_%' order by 1"
  );

  console.log('\nTablas:     ' + tablas.rows.map((r) => r.table_name).join(', '));
  console.log('RLS:        ' + rls.rows.map((r) => r.relname + '=' + (r.relrowsecurity ? 'on' : 'OFF')).join(', '));
  console.log('Políticas:  ' + (politicas.rows.length
    ? politicas.rows.map((r) => r.tablename + ': ' + r.policyname).join(' | ')
    : '(ninguna)'));
  console.log('Funciones:  ' + funciones.rows.map((r) => r.proname).join(', '));

  await client.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

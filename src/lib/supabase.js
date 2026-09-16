/**
 * Cliente de Supabase para uso exclusivo del servidor.
 *
 * Usa la service role key, que bypassea RLS por completo. Este módulo nunca
 * debe importarse desde nada que termine en /public.
 */
'use strict';

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

module.exports = supabase;

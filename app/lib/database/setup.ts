import type { SupabaseConfig } from './supabase';
import { createClient } from '@supabase/supabase-js';

const INITIAL_SETUP_SQL = `
-- Create test connection table
CREATE TABLE IF NOT EXISTS public._test_connection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public._test_connection ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read for connection testing
CREATE POLICY "Allow connection testing"
  ON public._test_connection
  FOR SELECT
  TO authenticated
  USING (true);

-- Create table info function
CREATE OR REPLACE FUNCTION public.get_table_info()
RETURNS TABLE (
  table_name text,
  row_count bigint,
  size bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tables.table_name::text,
    (xpath('/row/c/text()', query_to_xml(format('SELECT COUNT(*) AS c FROM %I.%I', table_schema, table_name), FALSE, TRUE, '')))[1]::text::bigint AS row_count,
    pg_total_relation_size(format('%I.%I', table_schema, table_name)::regclass) AS size
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_table_info() TO authenticated;
`;

export async function setupInitialStructure(config: SupabaseConfig): Promise<void> {
  const supabase = createClient(config.projectUrl, config.apiKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  try {
    // Execute setup SQL
    const { error } = await supabase.rpc('execute_sql', {
      sql_query: INITIAL_SETUP_SQL,
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Failed to set up initial database structure:', error);
    throw new Error('Failed to set up database structure');
  }
}

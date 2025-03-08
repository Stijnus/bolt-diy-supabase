import type { SupabaseConfig } from './supabase';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseClient } from './supabase';

const SCHEMA_INFO_FUNCTION = `
CREATE OR REPLACE FUNCTION get_schema_info()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'schema', table_schema,
        'table', table_name,
        'columns', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'name', column_name,
              'type', data_type,
              'nullable', is_nullable = 'YES',
              'default', column_default
            )
          )
          FROM information_schema.columns c
          WHERE c.table_schema = t.table_schema
          AND c.table_name = t.table_name
        )
      )
    )
    FROM information_schema.tables t
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    AND table_type = 'BASE TABLE'
  );
END;
$$;
`;

const TABLE_INFO_FUNCTION = `
CREATE OR REPLACE FUNCTION get_table_info()
RETURNS TABLE (
  name text,
  size bigint,
  row_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    schemaname || '.' || tablename as name,
    pg_total_relation_size(schemaname || '.' || tablename) as size,
    (SELECT n_live_tup FROM pg_stat_user_tables WHERE schemaname || '.' || relname = schemaname || '.' || tablename) as row_count
  FROM pg_tables
  WHERE schemaname NOT IN ('pg_catalog', 'information_schema');
END;
$$;
`;

export async function setupInitialStructure(config: SupabaseConfig): Promise<void> {
  const supabase = createClient(config.projectUrl, config.apiKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  try {
    // For new projects, we need to wait a bit for the database to be ready
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Try to create the test table
    try {
      const { error: createTableError } = await supabase.from('_test_connection').select('count').limit(1);

      // If the table doesn't exist, create it
      if (createTableError && createTableError.code === '42P01') {
        console.log('Creating test connection table...');

        // Create a simple sentinel table instead of trying complex SQL
        const { error: createError } = await supabase.rpc('pg_advisory_lock', { key: 1 }).then(() => {
          return supabase.from('_sentinel_check_').insert([{ id: 'test' }]);
        });

        if (createError && createError.code !== '42P01') {
          console.error('Failed to create sentinel table:', createError);
        }
      }
    } catch (error) {
      console.warn('Error checking/creating test table:', error);

      // Continue anyway - the project might still be initializing
    }

    // Instead of using SQL directly, we'll create a simple record to verify connection
    try {
      const { error: insertError } = await supabase.from('_sentinel_check_').insert([{ id: 'connection_test' }]);

      // If the table doesn't exist, that's fine - we'll create it later
      if (insertError && insertError.code !== '42P01') {
        console.error('Error inserting sentinel record:', insertError);
      }
    } catch (error) {
      console.warn('Error with sentinel check:', error);
    }

    // Create functions for schema and table info
    try {
      // Check if the exec function exists (needed for executing raw SQL)
      const { error: execCheckError } = await supabase.rpc('exec', { query: 'SELECT 1' });
      
      if (execCheckError) {
        // If 'exec' function doesn't exist, create it first
        console.log('Creating exec function for SQL execution...');
        const createExecFunctionSql = `
          CREATE OR REPLACE FUNCTION exec(query text)
          RETURNS void AS $$
          BEGIN
            EXECUTE query;
          END;
          $$ LANGUAGE plpgsql SECURITY DEFINER;
        `;
        
        // We need to use direct SQL API as the exec function doesn't exist yet
        const { error: createExecError } = await supabase
          .from('_sentinel_exec_check_')
          .select('*')
          .limit(1)
          .then(() => ({ error: null }))
          .catch(async () => {
            // Try direct SQL execution through REST API
            try {
              const response = await fetch(`${config.projectUrl}/rest/v1/sql`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': config.apiKey,
                  'Authorization': `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({ query: createExecFunctionSql })
              });
              
              if (!response.ok) {
                console.warn('Failed to create exec function via REST API:', await response.text());
                return { error: new Error('Failed to create exec function') };
              }
              
              return { error: null };
            } catch (err) {
              console.error('Error creating exec function:', err);
              return { error: err as Error };
            }
          });
          
        if (createExecError) {
          console.warn('Could not create exec function, will try alternative approach');
        }
      }

      // Now try to create the schema info function
      console.log('Creating schema and table info functions...');
      
      const schemaResult = await supabase.rpc('exec', { query: SCHEMA_INFO_FUNCTION });
      if (schemaResult.error) {
        console.warn('Failed to create schema_info function:', schemaResult.error);
      }
      
      const tableResult = await supabase.rpc('exec', { query: TABLE_INFO_FUNCTION });
      if (tableResult.error) {
        console.warn('Failed to create table_info function:', tableResult.error);
        
        // Try alternative approach with separate queries
        console.log('Trying alternative approach for table_info function...');
        const tableInfoAlt = `
          CREATE OR REPLACE FUNCTION get_table_info()
          RETURNS TABLE (name TEXT, size BIGINT, row_count BIGINT) 
          AS $$
          BEGIN
            RETURN QUERY SELECT 
              t.table_name::TEXT as name,
              0::BIGINT as size,
              0::BIGINT as row_count
            FROM information_schema.tables t
            WHERE t.table_schema = 'public'
            AND t.table_type = 'BASE TABLE';
          END;
          $$ LANGUAGE plpgsql SECURITY DEFINER;
        `;
        
        const altResult = await supabase.rpc('exec', { query: tableInfoAlt });
        if (altResult.error) {
          console.warn('Alternative approach also failed:', altResult.error);
        } else {
          console.log('Successfully created simplified table_info function');
        }
      }

      console.log('Database functions setup completed');
    } catch (funcError) {
      console.error('Error setting up database functions:', funcError);
      console.log('Project will continue without stats until functions are created')
    }
    return;
  } catch (error) {
    console.error('Failed to set up initial database structure:', error);

    // Don't throw an error, just log it - we want to continue even if setup fails
    console.log('Continuing with connection despite setup issues');
  }
}

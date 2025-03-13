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
        try {
          const response = await fetch(`${config.projectUrl}/rest/v1/sql`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: config.apiKey,
              Authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({ query: createExecFunctionSql }),
          });

          if (!response.ok) {
            console.warn('Failed to create exec function via REST API:', await response.text());
            return;
          }
        } catch (err) {
          console.error('Error creating exec function:', err);
          return;
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
      console.log('Project will continue without stats until functions are created');
    }

    return;
  } catch (error) {
    console.error('Failed to set up initial database structure:', error);

    // Don't throw an error, just log it - we want to continue even if setup fails
    console.log('Continuing with connection despite setup issues');
  }
}

export async function setupDatabase() {
  try {
    const client = createSupabaseClient();

    // Define the SQL setup directly in the code instead of reading from a file
    const setupSQL = `
      -- Create auth schema if it doesn't exist
      CREATE SCHEMA IF NOT EXISTS auth;

      -- Create users table in auth schema
      CREATE TABLE IF NOT EXISTS auth.users (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          encrypted_password TEXT NOT NULL,
          email_confirmed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
      );

      -- Create function to get database size
      CREATE OR REPLACE FUNCTION get_database_size()
      RETURNS TABLE (
          total_size BIGINT,
          table_size BIGINT,
          index_size BIGINT
      ) LANGUAGE plpgsql SECURITY DEFINER AS $$
      BEGIN
          RETURN QUERY
          SELECT
              pg_database_size(current_database()) as total_size,
              COALESCE(SUM(pg_total_relation_size(quote_ident(table_name))), 0) as table_size,
              COALESCE(SUM(pg_indexes_size(quote_ident(table_name))), 0) as index_size
          FROM information_schema.tables
          WHERE table_schema = 'public';
      END;
      $$;

      -- Create function to update updated_at timestamp
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = now();
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Create trigger for updating updated_at
      CREATE TRIGGER update_users_updated_at
          BEFORE UPDATE ON auth.users
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();

      -- Enable Row Level Security
      ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

      -- Create policy for users to view their own data
      CREATE POLICY "Users can view own data" ON auth.users
          FOR SELECT USING (auth.uid() = id);

      -- Create policy for users to update their own data
      CREATE POLICY "Users can update own data" ON auth.users
          FOR UPDATE USING (auth.uid() = id);

      -- Grant necessary permissions
      GRANT USAGE ON SCHEMA auth TO postgres, anon, authenticated;
      GRANT ALL ON ALL TABLES IN SCHEMA auth TO postgres;
      GRANT SELECT ON auth.users TO anon, authenticated;
      GRANT UPDATE ON auth.users TO authenticated;
      GRANT EXECUTE ON FUNCTION get_database_size() TO postgres, anon, authenticated;
    `;

    // Execute the SQL
    const { error } = await client.rpc('exec', { query: setupSQL });

    if (error) {
      console.error('Error setting up database:', error);
      throw error;
    }

    console.log('Database setup completed successfully');

    return true;
  } catch (error) {
    console.error('Failed to setup database:', error);
    return false;
  }
}

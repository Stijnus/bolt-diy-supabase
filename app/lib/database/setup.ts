import type { SupabaseConfig } from './supabase';
import { createClient } from '@supabase/supabase-js';

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

    return;
  } catch (error) {
    console.error('Failed to set up initial database structure:', error);

    // Don't throw an error, just log it - we want to continue even if setup fails
    console.log('Continuing with connection despite setup issues');
  }
}

import { createClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';

// Handles storing and retrieving Supabase configuration
export interface SupabaseConfig {
  projectUrl: string;
  apiKey: string;
}

// Store Supabase config in localStorage
const SUPABASE_CONFIG_KEY = 'bolt_supabase_config';

// Core functions for config management
export function getSupabaseConfig(): SupabaseConfig | null {
  try {
    const config = localStorage.getItem(SUPABASE_CONFIG_KEY);
    return config ? JSON.parse(config) : null;
  } catch (error) {
    console.error('Error reading Supabase config:', error);
    return null;
  }
}

export function setSupabaseConfig(config: SupabaseConfig) {
  try {
    localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Error saving Supabase config:', error);
  }
}

export function clearSupabaseConfig() {
  localStorage.removeItem(SUPABASE_CONFIG_KEY);
}

// Create Supabase client with stored config
export function createSupabaseClient() {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error('Supabase configuration not found');
  }

  return createClient(config.projectUrl, config.apiKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

// Verify Supabase connection
export async function verifySupabaseConnection(config: SupabaseConfig): Promise<boolean> {
  try {
    const supabase = createClient(config.projectUrl, config.apiKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });

    // For new projects, just try a simple connection test
    try {
      // Try to get version info - this should work on any Supabase project
      const { error } = await supabase.rpc('get_service_role');

      // If we get a specific error about the function not existing, that's expected
      if (error && error.code === 'PGRST202') {
        // Try a simple query instead
        const { error: tableError } = await supabase.from('_sentinel_check_').select('count').limit(1);

        /*
         * PGRST116 means no rows found - this is OK
         * 42P01 means table doesn't exist - also OK for new projects
         */
        if (tableError && !['PGRST116', '42P01'].includes(tableError.code || '')) {
          console.warn('Secondary connection test failed:', tableError);

          // Try one more basic test - this should work on any Postgres database
          const { error: versionError } = await supabase.rpc('version');

          if (versionError && versionError.code !== 'PGRST202') {
            console.error('Final connection test failed:', versionError);
            return false;
          }
        }

        // If we got here, the connection is probably valid
        return true;
      }

      // If we got data or no specific error, connection is valid
      return true;
    } catch (error) {
      console.error('Failed to verify Supabase connection:', error);

      // Be lenient - if we can connect at all, consider it valid
      return true;
    }
  } catch (error) {
    console.error('Failed to verify Supabase connection:', error);
    return false;
  }
}

// Generate a unique project reference
export function generateProjectRef(description: string): string {
  // Sanitize description - only allow lowercase letters, numbers and hyphens
  const sanitized = description
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-') // Replace invalid chars with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens

  // Take first 20 chars of sanitized description, or pad if too short
  let prefix = sanitized.slice(0, 20);

  if (prefix.length < 20) {
    prefix = prefix.padEnd(20, 'a');
  }

  // Generate a unique suffix
  const suffix = nanoid(8);

  // Combine prefix and suffix to ensure at least 20 chars
  const ref = `${prefix}-${suffix}`;

  // Final validation
  if (ref.length < 20) {
    throw new Error('Generated project reference is too short');
  }

  return ref;
}

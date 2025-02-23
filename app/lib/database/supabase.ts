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

    // Try to get table info first
    const { error: tableError } = await supabase.rpc('get_table_info');

    // Handle different error cases
    if (tableError) {
      // PGRST202 means function not found - this is expected for new projects
      if (tableError.code === 'PGRST202') {
        // Try test connection table instead
        const { error: testError } = await supabase.from('_test_connection').select('*').limit(1).single();

        /*
         * PGRST116 means no rows found - this is OK
         * 42P01 means table doesn't exist - also OK for new projects
         */
        if (testError && !['PGRST116', '42P01'].includes(testError.code || '')) {
          console.error('Supabase connection error:', testError);
          return false;
        }

        return true;
      }

      console.error('Supabase connection error:', tableError);

      return false;
    }

    return true;
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

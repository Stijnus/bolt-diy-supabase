import { createClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';
import { encrypt, decrypt } from '~/utils/encryption';

// Handles storing and retrieving Supabase configuration
export interface SupabaseConfig {
  projectUrl: string;
  apiKey: string;
}

// Store Supabase config in localStorage with encryption
const SUPABASE_CONFIG_KEY = 'bolt_supabase_config';
const CONFIG_VERSION = '1.0.0'; // Add versioning

interface StoredConfig extends SupabaseConfig {
  version: string;
  timestamp: number;
}

// Core functions for config management
export function getSupabaseConfig(): SupabaseConfig | null {
  try {
    const encryptedConfig = localStorage.getItem(SUPABASE_CONFIG_KEY);

    if (!encryptedConfig) {
      return null;
    }

    const decryptedConfig = decrypt(encryptedConfig);
    const config = JSON.parse(decryptedConfig) as StoredConfig;

    // Version check for future migrations
    if (config.version !== CONFIG_VERSION) {
      console.warn('Config version mismatch, clearing old config');
      clearSupabaseConfig();

      return null;
    }

    // Return only the necessary config fields
    return {
      projectUrl: config.projectUrl,
      apiKey: config.apiKey,
    };
  } catch (error) {
    console.error('Error reading Supabase config:', error);
    return null;
  }
}

export function setSupabaseConfig(config: SupabaseConfig) {
  try {
    const configToStore: StoredConfig = {
      ...config,
      version: CONFIG_VERSION,
      timestamp: Date.now(),
    };

    const encryptedConfig = encrypt(JSON.stringify(configToStore));
    localStorage.setItem(SUPABASE_CONFIG_KEY, encryptedConfig);
  } catch (error) {
    console.error('Error saving Supabase config:', error);
    throw new Error('Failed to save Supabase configuration securely');
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

    // For new projects, use a more reliable connection test
    try {
      // Try a simple version check first
      const { error: versionError } = await supabase.rpc('version');

      if (!versionError || versionError.code === 'PGRST202') {
        console.log('Connection verified via version RPC');
        return true;
      }

      // Try a simple health check query
      const { error: healthError } = await supabase.from('_sentinel_check_').select('count').limit(1);

      if (!healthError || healthError.code === 'PGRST116' || healthError.code === '42P01') {
        console.log('Connection verified via sentinel check');
        return true;
      }

      // If we can at least connect to the API, consider it connected
      const { error: apiError } = await supabase.from('_fake_table_to_test_connection_').select('count').limit(1);

      if (apiError && apiError.code === '42P01') {
        // Table doesn't exist error means we could connect to the database
        console.log('Connection verified via API check');
        return true;
      }

      console.error('All connection tests failed');
      return false;
    } catch (error) {
      console.error('Failed to verify Supabase connection:', error);
      return false;
    }
  } catch (error) {
    console.error('Failed to create Supabase client:', error);
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

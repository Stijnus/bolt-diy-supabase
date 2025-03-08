import { createSupabaseClient, getSupabaseConfig } from './supabase';

interface DatabaseOperation {
  operation: 'select' | 'insert' | 'update' | 'delete' | 'execute';
  table?: string;
  schema?: string;
  query?: string;
  filter?: Record<string, any>;
  data?: Record<string, any>;
  returning?: boolean;
}

interface DatabaseResponse {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    operation: string;
    table?: string;
    rowCount?: number;
  };
}

/**
 * Validates if Supabase is configured and accessible
 * @returns {Promise<boolean>} True if Supabase is ready to use
 */
export async function isSupabaseReady(): Promise<boolean> {
  try {
    const config = getSupabaseConfig();

    if (!config) {
      return false;
    }

    const supabase = createSupabaseClient();
    const { error } = await supabase.from('_sentinel_check_').select('count').limit(1);

    return !error || error.code === 'PGRST116' || error.code === '42P01';
  } catch (error) {
    console.error('Supabase readiness check failed:', error);
    return false;
  }
}

/**
 * Gets database schema information for LLM context
 * @returns {Promise<Object>} Database schema information
 */
export async function getDatabaseSchema(): Promise<{ tables: any[] }> {
  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase.rpc('get_schema_info');

    if (error) {
      throw error;
    }

    return {
      tables: data || [],
    };
  } catch (error) {
    console.error('Failed to get database schema:', error);

    return { tables: [] };
  }
}

/**
 * Executes a database operation based on LLM request
 * @param {DatabaseOperation} operation The operation to perform
 * @returns {Promise<DatabaseResponse>} The operation result
 */
export async function executeDatabaseOperation(operation: DatabaseOperation): Promise<DatabaseResponse> {
  try {
    const supabase = createSupabaseClient();
    let result;

    switch (operation.operation) {
      case 'select':
        if (!operation.table) {
          throw new Error('Table name is required for select operations');
        }

        result = await supabase
          .from(operation.table)
          .select(operation.query || '*')
          .match(operation.filter || {});
        break;

      case 'insert':
        if (!operation.table || !operation.data) {
          throw new Error('Table name and data are required for insert operations');
        }

        result = await supabase
          .from(operation.table)
          .insert(operation.data)
          .select(operation.returning ? '*' : undefined);
        break;

      case 'update':
        if (!operation.table || !operation.data || !operation.filter) {
          throw new Error('Table name, data, and filter are required for update operations');
        }

        result = await supabase
          .from(operation.table)
          .update(operation.data)
          .match(operation.filter)
          .select(operation.returning ? '*' : undefined);
        break;

      case 'delete':
        if (!operation.table || !operation.filter) {
          throw new Error('Table name and filter are required for delete operations');
        }

        result = await supabase
          .from(operation.table)
          .delete()
          .match(operation.filter)
          .select(operation.returning ? '*' : undefined);
        break;

      case 'execute':
        if (!operation.query) {
          throw new Error('Query is required for execute operations');
        }

        result = await supabase.rpc(operation.query, operation.data);
        break;

      default:
        throw new Error(`Unsupported operation: ${operation.operation}`);
    }

    if (result.error) {
      throw result.error;
    }

    return {
      success: true,
      data: result.data,
      metadata: {
        operation: operation.operation,
        table: operation.table,
        rowCount: Array.isArray(result.data) ? result.data.length : undefined,
      },
    };
  } catch (error) {
    console.error('Database operation failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown database error',
      metadata: {
        operation: operation.operation,
        table: operation.table,
      },
    };
  }
}

/**
 * Gets database capabilities and status for LLM context
 * @returns {Promise<Object>} Database capabilities and status
 */
export async function getDatabaseCapabilities(): Promise<{
  isReady: boolean;
  features: {
    rls: boolean;
    storage: boolean;
    auth: boolean;
    edgeFunctions: boolean;
  };
  schema?: { tables: any[] };
}> {
  try {
    const isReady = await isSupabaseReady();

    if (!isReady) {
      return {
        isReady: false,
        features: {
          rls: false,
          storage: false,
          auth: false,
          edgeFunctions: false,
        },
      };
    }

    const supabase = createSupabaseClient();
    const schema = await getDatabaseSchema();

    // Check available features
    const features = {
      rls: true, // RLS is always enabled in Supabase
      storage: false,
      auth: false,
      edgeFunctions: false,
    };

    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      features.storage = !!buckets && buckets.length > 0;
    } catch {}

    try {
      const { error: authError } = await supabase.from('auth.users').select('count').limit(1);
      features.auth = !authError;
    } catch {}

    try {
      /*
       * We'll set edge functions to false by default since
       * different Supabase versions have different APIs
       */
      features.edgeFunctions = false;

      // Try to access some functions API to determine if it's available
      const functionsClient = supabase.functions as any;

      if (
        functionsClient &&
        (typeof functionsClient.invoke === 'function' ||
          typeof functionsClient.listFunctions === 'function' ||
          typeof functionsClient.list === 'function')
      ) {
        features.edgeFunctions = true;
      }
    } catch {}

    return {
      isReady: true,
      features,
      schema,
    };
  } catch (error) {
    console.error('Failed to get database capabilities:', error);
    return {
      isReady: false,
      features: {
        rls: false,
        storage: false,
        auth: false,
        edgeFunctions: false,
      },
    };
  }
}

import { createSupabaseClient } from './supabase';
import { PostgrestError, createClient, type SupabaseClient } from '@supabase/supabase-js';

// Import types from single source to avoid conflicts
import { validateSupabaseConfig } from './types';

export interface DatabaseOperation {
  type: 'select' | 'insert' | 'update' | 'delete' | 'execute';
  table?: string;
  schema?: string;
  query?: string;
  filter?: Record<string, any>;
  data?: Record<string, any> | Record<string, any>[];
  returning?: boolean | string[];
}

export interface DatabaseResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    details?: string;
    code?: string;
  };
}

interface RetryOptions {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 5000,
};

async function retryOperation<T>(
  operation: () => Promise<T>,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS,
): Promise<T> {
  let lastError: Error | null = null;
  let delay = options.initialDelay;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === options.maxAttempts) {
        break;
      }

      console.warn(`Operation failed (attempt ${attempt}/${options.maxAttempts}):`, error);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, options.maxDelay);
    }
  }

  throw lastError || new Error('Operation failed after retries');
}

// Simple in-memory cache implementation
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class RequestCache {
  private _cache: Map<string, CacheEntry<any>> = new Map();
  private static _instance: RequestCache;

  private constructor() {
    // Private constructor for singleton pattern
  }

  static getInstance(): RequestCache {
    if (!RequestCache._instance) {
      RequestCache._instance = new RequestCache();
    }

    return RequestCache._instance;
  }

  set<T>(key: string, data: T, ttlMs: number = 5000): void {
    this._cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  get<T>(key: string): T | null {
    const entry = this._cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > entry.ttl) {
      this._cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  clear(): void {
    this._cache.clear();
  }
}

// Connection pool implementation
class ConnectionPool {
  private static _instance: ConnectionPool;
  private _pool: Map<string, any> = new Map();
  private _maxConnections: number = 5;
  private _connectionTimeout: number = 30000; // 30 seconds

  private constructor() {
    // Cleanup expired connections periodically
    setInterval(() => this._cleanup(), 60000);
  }

  static getInstance(): ConnectionPool {
    if (!ConnectionPool._instance) {
      ConnectionPool._instance = new ConnectionPool();
    }

    return ConnectionPool._instance;
  }

  async getConnection(config: { projectUrl: string; apiKey: string }): Promise<SupabaseClient> {
    try {
      // Validate config and get branded types
      const validatedConfig = validateSupabaseConfig(config);
      const key = `${validatedConfig.projectUrl}:${validatedConfig.apiKey}`;
      let connection = this._pool.get(key);

      if (!connection) {
        if (this._pool.size >= this._maxConnections) {
          // Remove oldest connection if pool is full
          const oldestKey = this._pool.keys().next().value;

          if (oldestKey) {
            this._pool.delete(oldestKey);
          }
        }

        // Create client with validated config
        const client = createClient(validatedConfig.projectUrl.toString(), validatedConfig.apiKey.toString(), {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
          },
        });

        connection = {
          client,
          lastUsed: Date.now(),
        };
        this._pool.set(key, connection);
      }

      connection.lastUsed = Date.now();

      return connection.client;
    } catch (error) {
      console.error('Failed to create database connection:', error);
      throw new Error('Failed to create database connection');
    }
  }

  private _cleanup(): void {
    const now = Date.now();

    // Convert to array first to avoid iterator issues
    Array.from(this._pool.entries()).forEach(([key, connection]) => {
      if (now - connection.lastUsed > this._connectionTimeout) {
        this._pool.delete(key);
      }
    });
  }
}

/**
 * Execute a database operation through Supabase
 */
export async function executeDatabaseOperation<T = any>(
  operation: DatabaseOperation,
  options: { cache?: boolean; ttl?: number } = {},
): Promise<DatabaseResponse<T>> {
  const cache = RequestCache.getInstance();
  const pool = ConnectionPool.getInstance();

  // Generate cache key for the operation
  const cacheKey = JSON.stringify(operation);

  // Check cache if enabled
  if (options.cache) {
    const cachedResult = cache.get<DatabaseResponse<T>>(cacheKey);

    if (cachedResult) {
      return cachedResult;
    }
  }

  try {
    const client = createSupabaseClient();
    const supabaseUrl = (client as any).supabaseUrl;
    const supabaseKey = (client as any).supabaseKey;

    if (!supabaseUrl || !supabaseKey) {
      return {
        success: false,
        error: {
          message: 'Supabase configuration not found',
          code: 'CONFIG_NOT_FOUND',
        },
      };
    }

    const supabase = await pool.getConnection({
      projectUrl: supabaseUrl,
      apiKey: supabaseKey,
    });
    let result: DatabaseResponse<T>;

    switch (operation.type) {
      case 'select': {
        if (!operation.table) {
          throw new Error('Table name is required for select operations');
        }

        let query = supabase.from(operation.table).select(operation.query || '*');

        // Apply filters if provided
        if (operation.filter) {
          Object.entries(operation.filter).forEach(([key, value]) => {
            query = query.eq(key, value);
          });
        }

        const { data, error } = await query;

        if (error) {
          throw error;
        }

        result = { success: true, data } as DatabaseResponse<T>;
        break;
      }

      case 'insert': {
        if (!operation.table || !operation.data) {
          throw new Error('Table name and data are required for insert operations');
        }

        const { data, error } = await supabase
          .from(operation.table)
          .insert(operation.data)
          .select(
            operation.returning
              ? Array.isArray(operation.returning)
                ? operation.returning.join(',')
                : '*'
              : undefined,
          );

        if (error) {
          throw error;
        }

        result = { success: true, data } as DatabaseResponse<T>;
        break;
      }

      case 'update': {
        if (!operation.table || !operation.data || !operation.filter) {
          throw new Error('Table name, data, and filter are required for update operations');
        }

        const { data, error } = await supabase
          .from(operation.table)
          .update(operation.data)
          .match(operation.filter)
          .select(
            operation.returning
              ? Array.isArray(operation.returning)
                ? operation.returning.join(',')
                : '*'
              : undefined,
          );

        if (error) {
          throw error;
        }

        result = { success: true, data } as DatabaseResponse<T>;
        break;
      }

      case 'delete': {
        if (!operation.table || !operation.filter) {
          throw new Error('Table name and filter are required for delete operations');
        }

        const { data, error } = await supabase
          .from(operation.table)
          .delete()
          .match(operation.filter)
          .select(
            operation.returning
              ? Array.isArray(operation.returning)
                ? operation.returning.join(',')
                : '*'
              : undefined,
          );

        if (error) {
          throw error;
        }

        result = { success: true, data } as DatabaseResponse<T>;
        break;
      }

      case 'execute': {
        if (!operation.query) {
          throw new Error('SQL query is required for execute operations');
        }

        try {
          // First try using the execute_sql RPC
          const { data, error } = await supabase.rpc('execute_sql', {
            sql_query: operation.query,
          });

          if (error) {
            // If the RPC doesn't exist, try using the SQL REST API
            console.warn('execute_sql RPC failed, trying REST API: ', error);
            throw error;
          }

          result = { success: true, data } as DatabaseResponse<T>;
          break;
        } catch (error) {
          // Fallback to REST API
          console.log('Falling back to direct SQL API:', error);

          // Get the auth information and URL
          const supabaseUrl = (supabase as any).supabaseUrl || '';
          const apiKey = (supabase as any).supabaseKey || '';

          // Make a direct request
          const headers = new Headers();
          headers.append('Content-Type', 'application/json');
          headers.append('apikey', apiKey);
          headers.append('Authorization', `Bearer ${apiKey}`);

          try {
            const response = await fetch(`${supabaseUrl}/rest/v1/`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ query: operation.query }),
            });

            if (!response.ok) {
              const errorData = (await response.json()) as { message?: string };
              throw new Error(errorData.message || 'SQL execution failed');
            }

            const data = await response.json();

            result = { success: true, data } as DatabaseResponse<T>;
            break;
          } catch (fetchError) {
            console.error('SQL execution failed:', fetchError);
            throw new Error('Failed to execute SQL query using REST API');
          }
        }
      }

      default:
        throw new Error(`Unsupported operation type: ${operation.type}`);
    }

    if (options.cache) {
      cache.set(cacheKey, result, options.ttl);
    }

    return result;
  } catch (error) {
    console.error('Database operation failed:', error);

    const pgError = error as PostgrestError;

    return {
      success: false,
      error: {
        message: pgError.message || 'An unknown database error occurred',
        details: pgError.details || undefined,
        code: pgError.code || undefined,
      },
    };
  }
}

/**
 * Check if the Supabase connection is active and working
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const supabase = createSupabaseClient();

    return await retryOperation(async () => {
      try {
        // First try: Check system tables that exist in any PostgreSQL database
        const { error: pgCatalogError } = await supabase.from('pg_catalog.pg_tables').select('schemaname').limit(1);

        if (!pgCatalogError) {
          console.log('Connection verified via pg_catalog.pg_tables');
          return true;
        }

        console.warn('pg_catalog.pg_tables check failed:', pgCatalogError);

        // Second try: Another system table
        const { error: pgStatError } = await supabase.from('pg_stat_database').select('datname').limit(1);

        if (!pgStatError) {
          console.log('Connection verified via pg_stat_database');
          return true;
        }

        console.warn('pg_stat_database check failed:', pgStatError);

        // Third try: Information schema tables
        const { error: infoSchemaError } = await supabase
          .from('information_schema.tables')
          .select('table_name')
          .limit(1);

        if (!infoSchemaError) {
          console.log('Connection verified via information_schema.tables');
          return true;
        }

        console.warn('information_schema.tables check failed:', infoSchemaError);

        // Last resort: Try a simple RPC call that might exist
        const { error: rpcError } = await supabase.rpc('version');

        if (!rpcError) {
          console.log('Connection verified via version RPC');
          return true;
        }

        console.warn('version RPC check failed:', rpcError);

        // All checks failed
        console.error('All connection checks failed');

        return false;
      } catch (error) {
        console.error('Connection check attempt failed:', error);
        throw error;
      }
    });
  } catch (error) {
    console.error('Database connection check failed after retries:', error);
    return false;
  }
}

/**
 * List all available tables in the public schema
 */
export async function listDatabaseTables(): Promise<DatabaseResponse<string[]>> {
  try {
    const supabase = createSupabaseClient();

    // Direct SQL query to get all tables using raw query
    const { error, data } = await supabase.rpc('execute_sql', {
      sql_query: `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `,
    });

    if (error) {
      // Fallback if RPC not available
      try {
        // Try a direct query to get table names
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('information_schema.tables')
          .select('table_name')
          .eq('table_schema', 'public')
          .eq('table_type', 'BASE TABLE');

        if (fallbackError) {
          throw fallbackError;
        }

        // Extract table names from the result
        const tableNames = fallbackData?.map((row) => row.table_name) || [];

        return {
          success: true,
          data: tableNames,
        };
      } catch (fallbackIssue) {
        console.error('Fallback table query failed:', fallbackIssue);
        throw error; // Throw the original error
      }
    }

    // Process the data to extract table names
    const tableNames = Array.isArray(data) ? data.map((row) => row.table_name || row[0]) : [];

    return {
      success: true,
      data: tableNames,
    };
  } catch (error) {
    console.error('Failed to list database tables:', error);

    const pgError = error as PostgrestError;

    return {
      success: false,
      error: {
        message: pgError.message || 'Failed to list database tables',
        details: pgError.details || undefined,
        code: pgError.code || undefined,
      },
    };
  }
}

/**
 * Create a new table in the database
 */
export async function createTable(
  tableName: string,
  columns: { name: string; type: string; constraints?: string }[],
): Promise<DatabaseResponse> {
  if (!tableName || !columns.length) {
    return {
      success: false,
      error: { message: 'Table name and at least one column are required' },
    };
  }

  // Format the SQL for table creation
  const columnDefs = columns
    .map((col) => {
      return `${col.name} ${col.type}${col.constraints ? ` ${col.constraints}` : ''}`;
    })
    .join(', ');

  const createTableSQL = `CREATE TABLE ${tableName} (${columnDefs})`;

  return executeDatabaseOperation({
    type: 'execute',
    query: createTableSQL,
  });
}

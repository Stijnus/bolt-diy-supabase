import { createSupabaseClient } from './supabase';
import { PostgrestError } from '@supabase/supabase-js';

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

/**
 * Execute a database operation through Supabase
 */
export async function executeDatabaseOperation<T = any>(operation: DatabaseOperation): Promise<DatabaseResponse<T>> {
  try {
    const supabase = createSupabaseClient();

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

        return { success: true, data } as DatabaseResponse<T>;
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

        return { success: true, data } as DatabaseResponse<T>;
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

        return { success: true, data } as DatabaseResponse<T>;
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

        return { success: true, data } as DatabaseResponse<T>;
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

          return { success: true, data } as DatabaseResponse<T>;
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
              const errorData = await response.json();
              throw new Error(errorData.message || 'SQL execution failed');
            }

            const data = await response.json();

            return { success: true, data } as DatabaseResponse<T>;
          } catch (fetchError) {
            console.error('SQL execution failed:', fetchError);
            throw new Error('Failed to execute SQL query using REST API');
          }
        }
      }

      default:
        throw new Error(`Unsupported operation type: ${operation.type}`);
    }
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

    // Simple query to verify the connection
    const { error } = await supabase.from('_metadata').select('*').limit(1).single();

    if (error) {
      // Try a simpler query if the metadata table doesn't exist
      try {
        const { error: simpleError } = await supabase.rpc('version');

        if (simpleError) {
          console.error('Database connection check failed:', simpleError);
          return false;
        }

        return true;
      } catch (innerError) {
        console.error('Database connection fallback check failed:', innerError);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Database connection check error:', error);
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

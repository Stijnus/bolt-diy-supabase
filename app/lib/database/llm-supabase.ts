import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './supabase';

// Types for database operations
interface DatabaseContext {
  connected: boolean;
  projectUrl: string;
  schema: SchemaInfo[];
  error?: string;
}

interface SchemaInfo {
  table: string;
  columns: ColumnInfo[];
}

interface ColumnInfo {
  name: string;
  type: string;
  is_nullable: boolean;
  default_value?: string;
}

interface DatabaseResponse<T extends any[] | Record<string, any>> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    operation?: string;
    table?: string;
    rowCount?: number;
    queryType?: 'select' | 'insert' | 'update' | 'delete' | 'other';
  };
}

/**
 * Error class for database operations
 */
class DatabaseOperationError extends Error {
  readonly operation?: string;
  readonly details?: unknown;

  constructor(message: string, operation?: string, details?: unknown) {
    super(message);
    this.name = 'DatabaseOperationError';
    this.operation = operation;
    this.details = details;
  }
}

/**
 * Singleton class to manage Supabase client
 * Ensures only one client instance is created and handles automatic refresh
 */
class SupabaseManager {
  private static _instance: SupabaseManager;
  private _client: SupabaseClient | null = null;
  private _lastConfig: string | null = null;

  // Private constructor to prevent direct instantiation
  private constructor() {
    // Singleton pattern - no initialization needed
  }

  static getInstance(): SupabaseManager {
    if (!SupabaseManager._instance) {
      SupabaseManager._instance = new SupabaseManager();
    }

    return SupabaseManager._instance;
  }

  getClient(): SupabaseClient {
    const config = getSupabaseConfig();

    if (!config) {
      throw new DatabaseOperationError('Supabase configuration not found');
    }

    const configString = JSON.stringify(config);

    if (!this._client || this._lastConfig !== configString) {
      this._client = createClient(config.projectUrl, config.apiKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      });
      this._lastConfig = configString;
    }

    return this._client;
  }
}

/**
 * Validates and sanitizes an SQL query
 * @param query The SQL query to validate
 * @returns The sanitized query
 * @throws {DatabaseOperationError} If the query is invalid or potentially harmful
 */
function validateAndSanitizeQuery(query: string): string {
  if (!query?.trim()) {
    throw new DatabaseOperationError('Query cannot be empty');
  }

  const sanitized = query.trim();

  // Basic security checks
  const dangerousPatterns = [
    // /;.*;/i, // Multiple statements - ALLOW this for table creation
    // /--/, // SQL comments - ALLOW this for better SQL readability
    // /\/\*/, // Block comments - ALLOW this for better SQL readability
    /xp_cmdshell/i, // Command execution
    /EXECUTE\s+AS\s+OWNER/i, // Privilege escalation
    /INTO\s+OUTFILE/i, // File operations
    /LOAD_FILE/i, // File operations
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(sanitized)) {
      throw new DatabaseOperationError('Query contains potentially harmful patterns', 'validate', { pattern });
    }
  }

  return sanitized;
}

/**
 * Determines the type of SQL query
 * @param query The SQL query to analyze
 * @returns The query type
 */
function getQueryType(query: string): NonNullable<DatabaseResponse<any>['metadata']>['queryType'] {
  const normalized = query.trim().toLowerCase();

  if (normalized.startsWith('select')) {
    return 'select';
  }

  if (normalized.startsWith('insert')) {
    return 'insert';
  }

  if (normalized.startsWith('update')) {
    return 'update';
  }

  if (normalized.startsWith('delete')) {
    return 'delete';
  }

  return 'other';
}

/**
 * Executes an SQL query safely with fallback options
 * @param query The SQL query to execute
 * @returns A promise resolving to the query results
 * @throws {DatabaseOperationError} If the query execution fails
 */
export async function executeSafeSQLQuery<T extends any[] | Record<string, any> = any[]>(
  query: string,
): Promise<DatabaseResponse<T>> {
  try {
    const sanitizedQuery = validateAndSanitizeQuery(query);
    const queryType = getQueryType(sanitizedQuery);
    const supabase = SupabaseManager.getInstance().getClient();

    // First try using RPC
    try {
      const { data, error } = await supabase.rpc('execute_sql', {
        sql_query: sanitizedQuery,
      });

      if (!error) {
        return {
          success: true,
          data: data as T,
          metadata: {
            operation: 'execute',
            queryType,
            rowCount: Array.isArray(data) ? data.length : undefined,
          },
        };
      }
    } catch (rpcError) {
      console.warn('RPC execution failed, falling back to direct query:', rpcError);
    }

    // If RPC fails and it's a SELECT query, try direct table operations
    if (queryType === 'select') {
      const tableName = extractTableName(sanitizedQuery);

      if (tableName) {
        const { data, error } = await supabase.from(tableName).select('*');

        if (!error) {
          // Ensure type safety by casting the response appropriately
          const responseData = (Array.isArray(data) ? data : [data]) as unknown as T;

          return {
            success: true,
            data: responseData,
            metadata: {
              operation: 'select',
              queryType,
              table: tableName,
              rowCount: Array.isArray(data) ? data.length : 1,
            },
          };
        }

        throw new DatabaseOperationError('Table operation failed', 'select', error);
      }
    }

    throw new DatabaseOperationError('Failed to execute query', queryType);
  } catch (error) {
    console.error('Database operation failed:', error);

    if (error instanceof DatabaseOperationError) {
      return {
        success: false,
        error: error.message,
        metadata: {
          operation: error.operation,
          queryType: getQueryType(query),
        },
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

// Helper function to get database schema
export async function getDatabaseSchema(): Promise<SchemaInfo[]> {
  try {
    const supabase = SupabaseManager.getInstance().getClient();
    const schema: SchemaInfo[] = [];

    // Get all tables in the public schema
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_type', 'BASE TABLE');

    if (tablesError) {
      throw tablesError;
    }

    // Get column information for each table
    for (const table of tables || []) {
      const { data: columns, error: columnsError } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable, column_default')
        .eq('table_schema', 'public')
        .eq('table_name', table.table_name);

      if (columnsError) {
        console.error(`Failed to get columns for table ${table.table_name}:`, columnsError);
        continue;
      }

      schema.push({
        table: table.table_name,
        columns: (columns || []).map((col) => ({
          name: col.column_name,
          type: col.data_type,
          is_nullable: col.is_nullable === 'YES',
          default_value: col.column_default,
        })),
      });
    }

    return schema;
  } catch (error) {
    console.error('Failed to get database schema:', error);
    return [];
  }
}

interface ValidatedDatabaseContext extends DatabaseContext {
  lastValidated: number;
  isAccessible: boolean;
  features: {
    canQuery: boolean;
    canModify: boolean;
    hasSchema: boolean;
  };
}

// Update storage to use validated context
let storedDatabaseContext: ValidatedDatabaseContext | null = null;

/**
 * Validates database access by performing test operations
 */
async function validateDatabaseAccess(): Promise<{
  isAccessible: boolean;
  features: ValidatedDatabaseContext['features'];
  error?: string;
}> {
  try {
    const supabase = SupabaseManager.getInstance().getClient();
    const features = {
      canQuery: false,
      canModify: false,
      hasSchema: false,
    };

    // Test 1: Basic API connectivity check
    try {
      const { error: healthError } = await supabase.from('_health_check').select('count').limit(1);
      // 404 is expected for non-existent table, but other errors indicate issues
      features.canQuery = !healthError || healthError.code === '42P01' || healthError.code === 'PGRST116';
    } catch (error) {
      console.warn('Health check failed:', error);
    }

    // Test 2: Schema access check using multiple methods
    try {
      // Method 1: Try information_schema
      const { data: tables, error: schemaError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .eq('table_type', 'BASE TABLE');

      if (!schemaError && tables) {
        features.hasSchema = true;
      } else {
        // Method 2: Try RPC
        const { error: rpcError } = await supabase.rpc('get_schema_info');
        features.hasSchema = !rpcError;
      }
    } catch (error) {
      console.warn('Schema access check failed:', error);
    }

    // Test 3: Write permission check
    if (features.canQuery) {
      try {
        // Create a temporary test table
        const { error: createError } = await supabase.rpc('execute_sql', {
          sql_query: `
            CREATE TABLE IF NOT EXISTS _ai_test_table (
              id SERIAL PRIMARY KEY,
              test_timestamp TIMESTAMPTZ DEFAULT NOW()
            );
          `,
        });

        if (!createError) {
          features.canModify = true;

          // Clean up the test table
          await supabase.rpc('execute_sql', {
            sql_query: 'DROP TABLE IF EXISTS _ai_test_table;',
          });
        }
      } catch (error) {
        console.warn('Write permission check failed:', error);
      }
    }

    // Consider the database accessible if we can do at least one operation
    const isAccessible = features.canQuery || features.canModify || features.hasSchema;

    if (!isAccessible) {
      return {
        isAccessible: false,
        features,
        error: 'Could not perform any database operations',
      };
    }

    return {
      isAccessible: true,
      features,
    };
  } catch (error) {
    console.error('Database validation failed:', error);
    return {
      isAccessible: false,
      features: {
        canQuery: false,
        canModify: false,
        hasSchema: false,
      },
      error: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
}

/**
 * Sets the database context for LLM interactions with validation
 * @param context The database context to store
 */
export async function setDatabaseContext(context: DatabaseContext): Promise<void> {
  try {
    // Validate database access
    const { isAccessible, features, error } = await validateDatabaseAccess();

    if (!isAccessible) {
      throw new Error(`Database validation failed: ${error || 'Could not verify database access'}`);
    }

    // Store validated context
    storedDatabaseContext = {
      ...context,
      lastValidated: Date.now(),
      isAccessible,
      features,
    };

    console.log('Database context validated and stored:', {
      projectUrl: context.projectUrl,
      isAccessible,
      features,
    });
  } catch (error) {
    console.error('Failed to set database context:', error);
    throw error;
  }
}

/**
 * Gets the stored database context with validation
 * @param forceValidate Force revalidation of the connection
 * @returns The stored database context or null if not set
 */
export async function getStoredDatabaseContext(forceValidate = false): Promise<ValidatedDatabaseContext | null> {
  if (!storedDatabaseContext) {
    return null;
  }

  // Revalidate if forced or if last validation was more than 5 minutes ago
  const shouldValidate = forceValidate || Date.now() - storedDatabaseContext.lastValidated > 5 * 60 * 1000;

  if (shouldValidate) {
    try {
      const { isAccessible, features } = await validateDatabaseAccess();

      storedDatabaseContext = {
        ...storedDatabaseContext,
        lastValidated: Date.now(),
        isAccessible,
        features,
      };
    } catch (error) {
      console.warn('Context revalidation failed:', error);
    }
  }

  return storedDatabaseContext;
}

// Update getDatabaseContext to use validated context
export async function getDatabaseContext(): Promise<DatabaseContext> {
  try {
    // Check stored context first
    const validatedContext = await getStoredDatabaseContext();
    if (validatedContext?.isAccessible) {
      return {
        connected: true,
        projectUrl: validatedContext.projectUrl,
        schema: validatedContext.schema,
      };
    }

    const config = getSupabaseConfig();

    if (!config) {
      return {
        connected: false,
        projectUrl: '',
        schema: [],
        error: 'No Supabase configuration found',
      };
    }

    const schema = await getDatabaseSchema();

    // Validate new connection
    const { isAccessible, features, error } = await validateDatabaseAccess();

    if (!isAccessible) {
      return {
        connected: false,
        projectUrl: config.projectUrl,
        schema: [],
        error: error || 'Database validation failed',
      };
    }

    const context = {
      connected: true,
      projectUrl: config.projectUrl,
      schema,
      lastValidated: Date.now(),
      isAccessible,
      features,
    };

    // Store the validated context
    storedDatabaseContext = context;

    return context;
  } catch (error) {
    console.error('Failed to get database context:', error);
    return {
      connected: false,
      projectUrl: '',
      schema: [],
      error: error instanceof Error ? error.message : 'Failed to get database context',
    };
  }
}

// Helper function to extract table name from a SELECT query
function extractTableName(query: string): string | null {
  try {
    const fromMatch = query.match(/FROM\s+([^\s;]+)/i);

    if (fromMatch && fromMatch[1]) {
      return fromMatch[1].replace(/["`']/g, '').trim();
    }

    return null;
  } catch {
    return null;
  }
}

// Initialize logging
export function initializeLogging() {
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  console.error = (...args) => {
    // Add timestamp and additional context
    const timestamp = new Date().toISOString();
    originalConsoleError(`[${timestamp}] [ERROR] Database:`, ...args);
  };

  console.warn = (...args) => {
    const timestamp = new Date().toISOString();
    originalConsoleWarn(`[${timestamp}] [WARN] Database:`, ...args);
  };
}

/**
 * Generates a system prompt for LLM with database context
 * @param context The current database context
 * @returns A formatted system prompt
 */
export function generateDatabasePrompt(context: DatabaseContext): string {
  const tableDescriptions = context.schema
    .map(
      (table) => `
Table: ${table.table}
Columns:
${table.columns
  .map(
    (col) =>
      `  - ${col.name} (${col.type})${col.is_nullable ? ' NULL' : ' NOT NULL'}${
        col.default_value ? ` DEFAULT ${col.default_value}` : ''
      }`,
  )
  .join('\n')}
`,
    )
    .join('\n');

  return `
You have access to a Supabase database with the following schema:

${tableDescriptions}

You can:
1. Query the database using SQL
2. Get schema information
3. Execute database operations

Guidelines:
- Always validate table and column names against the schema
- Use appropriate data types for columns
- Consider NULL constraints
- Follow SQL best practices
- Handle errors appropriately

Example operations:
1. Query data:
   SELECT * FROM [table] WHERE [condition]

2. Insert data:
   INSERT INTO [table] (columns) VALUES (values)

3. Update data:
   UPDATE [table] SET [column = value] WHERE [condition]

4. Delete data:
   DELETE FROM [table] WHERE [condition]
`;
}

/**
 * Validates a query against the database schema
 * @param query The SQL query to validate
 * @param schema The database schema
 * @returns Validation result and any issues found
 */
export function validateQueryAgainstSchema(
  query: string,
  schema: SchemaInfo[],
): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];
  const tableNames = schema.map((s) => s.table.toLowerCase());
  const queryType = getQueryType(query);
  const normalizedQuery = query.toLowerCase();

  // Extract table name from query
  const tableName = extractTableName(query)?.toLowerCase();

  if (tableName && !tableNames.includes(tableName)) {
    issues.push(`Table '${tableName}' does not exist in the schema`);
  }

  // Extract column names based on query type
  if (tableName) {
    const tableSchema = schema.find((s) => s.table.toLowerCase() === tableName);

    if (tableSchema) {
      const columnNames = tableSchema.columns.map((c) => c.name.toLowerCase());

      // Check columns in SELECT queries
      if (queryType === 'select' && !normalizedQuery.includes('select *')) {
        const columnMatches = normalizedQuery.match(/select\s+(.+?)\s+from/i);

        if (columnMatches) {
          const requestedColumns = columnMatches[1]
            .split(',')
            .map((col) => col.trim().split(' ').pop()?.toLowerCase() ?? '');

          requestedColumns.forEach((col) => {
            if (col !== '*' && !columnNames.includes(col)) {
              issues.push(`Column '${col}' does not exist in table '${tableName}'`);
            }
          });
        }
      }

      // Check columns in INSERT queries
      if (queryType === 'insert') {
        const columnMatches = normalizedQuery.match(/insert\s+into\s+\w+\s*\((.+?)\)/i);

        if (columnMatches) {
          const insertColumns = columnMatches[1].split(',').map((col) => col.trim().toLowerCase());

          insertColumns.forEach((col) => {
            if (!columnNames.includes(col)) {
              issues.push(`Column '${col}' does not exist in table '${tableName}'`);
            }
          });
        }
      }

      // Check columns in UPDATE queries
      if (queryType === 'update') {
        const setMatches = normalizedQuery.match(/set\s+(.+?)\s+where/i);

        if (setMatches) {
          const updateColumns = setMatches[1].split(',').map((col) => col.trim().split('=')[0].trim().toLowerCase());

          updateColumns.forEach((col) => {
            if (!columnNames.includes(col)) {
              issues.push(`Column '${col}' does not exist in table '${tableName}'`);
            }
          });
        }
      }
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Suggests query optimizations based on schema and query analysis
 * @param query The SQL query to analyze
 * @param schema The database schema
 * @returns Optimization suggestions
 */
export function suggestQueryOptimizations(query: string, schema: SchemaInfo[]): string[] {
  const suggestions: string[] = [];
  const queryType = getQueryType(query);
  const normalizedQuery = query.toLowerCase();

  // Check for SELECT *
  if (queryType === 'select' && normalizedQuery.includes('select *')) {
    suggestions.push('Consider selecting specific columns instead of SELECT * for better performance');
  }

  // Check for missing WHERE clause
  if (
    (queryType === 'select' || queryType === 'update' || queryType === 'delete') &&
    !normalizedQuery.includes('where')
  ) {
    suggestions.push('Consider adding a WHERE clause to limit the scope of the operation');
  }

  // Check for table existence and analyze potential joins
  const tableName = extractTableName(query)?.toLowerCase();

  if (tableName) {
    const tableSchema = schema.find((s) => s.table.toLowerCase() === tableName);

    if (tableSchema) {
      // Suggest indexes for commonly queried columns
      const whereMatches = normalizedQuery.match(/where\s+(.+?)(?:\s+(?:order|group|limit|$))/i);

      if (whereMatches) {
        const whereColumns = whereMatches[1].match(/\w+(?=\s*[=<>])/g) || [];

        whereColumns.forEach((col) => {
          suggestions.push(`Consider adding an index on column '${col}' if frequently queried`);
        });
      }
    }
  }

  return suggestions;
}

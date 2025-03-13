import type { BaseAction } from '~/types/actions';

interface DatabaseOperation {
  operation: 'select' | 'insert' | 'update' | 'delete' | 'execute';
  table?: string;
  schema?: string;
  query?: string;
  filter?: Record<string, any>;
  data?: Record<string, any>;
  returning?: boolean;
}

export interface DatabaseActionData extends BaseAction {
  type: 'database';
  action: 'get_schema' | 'execute_query' | 'execute_operation' | 'get_capabilities';
  operation?: DatabaseOperation;
  query?: string;
}

export async function executeDatabaseAction(action: DatabaseActionData): Promise<any> {
  try {
    const response = await fetch('/api/llm-database', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: action.action,
        operation: action.operation,
        query: action.query,
      }),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as { error?: string };
      throw new Error(errorData.error || 'Database action failed');
    }

    return await response.json();
  } catch (error: unknown) {
    console.error('Database action failed:', error);

    if (error instanceof Error) {
      throw error;
    }

    throw new Error('Unknown database error');
  }
}

// Example database actions
export const databaseActions = {
  // Get database schema
  getSchema: (): DatabaseActionData => ({
    type: 'database',
    action: 'get_schema',
    content: '', // Required by BaseAction
  }),

  // Execute a raw SQL query
  executeQuery: (query: string): DatabaseActionData => ({
    type: 'database',
    action: 'execute_query',
    operation: {
      operation: 'execute', // Add required operation field
      query,
    },
    content: '', // Required by BaseAction
  }),

  // Execute a CRUD operation
  executeOperation: (operation: DatabaseOperation): DatabaseActionData => ({
    type: 'database',
    action: 'execute_operation',
    operation,
    content: '', // Required by BaseAction
  }),

  // Get database capabilities
  getCapabilities: (): DatabaseActionData => ({
    type: 'database',
    action: 'get_capabilities',
    content: '', // Required by BaseAction
  }),
};

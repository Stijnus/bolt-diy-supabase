import { json } from '@remix-run/cloudflare';
import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import {
  getDatabaseContext,
  getDatabaseSchema,
  executeSafeSQLQuery,
  initializeLogging,
} from '~/lib/database/llm-supabase';
import { executeDatabaseOperation, getDatabaseCapabilities } from '~/lib/database/llm-integration';

// Initialize enhanced logging
initializeLogging();

interface RequestData {
  action: string;
  operation?: {
    query?: string;
    operation?: 'select' | 'insert' | 'update' | 'delete' | 'execute';
    table?: string;
    schema?: string;
    filter?: Record<string, any>;
    data?: Record<string, any>;
    returning?: boolean;
  };
  context?: any; // For set_context action
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }

    const requestData = (await request.json()) as RequestData;
    const { action, operation, context: providedContext } = requestData;

    // First check database context
    const context = await getDatabaseContext();

    // For get_capabilities and set_context, we'll allow these even without a connection
    if (action === 'get_capabilities') {
      const capabilities = await getDatabaseCapabilities();
      return json({ data: capabilities });
    }

    // Handle set_context action to update LLM's awareness of database
    if (action === 'set_context' && providedContext) {
      console.log('LLM context updated with database information');

      /*
       * In a real implementation, this would set the context in a session
       * or pass it to the LLM system prompt generator
       */
      return json({
        success: true,
        message: 'Database context updated for LLM',
        contextReceived: true,
      });
    }

    if (!context.connected) {
      return json(
        {
          error: context.error || 'Database is not accessible',
          action: 'check_status',
          status: 'not_ready',
        },
        { status: 503 },
      );
    }

    let result;

    switch (action) {
      case 'get_context':
        return json({ data: context });

      case 'get_schema': {
        result = await getDatabaseSchema();
        return json({ data: result });
      }

      case 'execute_query': {
        if (!operation?.query) {
          return json({ error: 'SQL query is required' }, { status: 400 });
        }

        result = await executeSafeSQLQuery(operation.query);

        return json(result);
      }

      case 'execute_operation': {
        if (!operation?.operation) {
          return json({ error: 'Operation type is required' }, { status: 400 });
        }

        result = await executeDatabaseOperation({
          operation: operation.operation,
          table: operation.table,
          schema: operation.schema,
          query: operation.query,
          filter: operation.filter,
          data: operation.data,
          returning: operation.returning,
        });

        return json(result);
      }

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('LLM database interaction error:', error);
    return json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}

// Example usage in LLM context:
/*
 *To interact with the database, you can:
 *
 *1. Check database status and capabilities:
 *   POST /api/llm-database
 *   { "action": "get_capabilities" }
 *
 *2. Get database schema:
 *   POST /api/llm-database
 *   { "action": "get_schema" }
 *
 *3. Execute database operations:
 *   POST /api/llm-database
 *   {
 *     "action": "execute_operation",
 *     "operation": {
 *       "operation": "select",
 *       "table": "users",
 *       "query": "id, name, email",
 *       "filter": { "active": true }
 *     }
 *   }
 *
 *The API will validate the connection and handle errors appropriately.
 */

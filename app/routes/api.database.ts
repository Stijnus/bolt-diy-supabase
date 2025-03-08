import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import {
  executeDatabaseOperation,
  checkDatabaseConnection,
  listDatabaseTables,
  createTable,
  type DatabaseOperation,
} from '~/lib/database/service';
import { getSupabaseConfig } from '~/lib/database/supabase';

interface DatabaseRequest {
  action: string;
  tableName?: string;
  columns?: Array<{ name: string; type: string; constraints?: string }>;
  operation?: DatabaseOperation;
  [key: string]: any;
}

export async function action({ request }: ActionFunctionArgs) {
  // Check if we have an active Supabase connection
  const config = getSupabaseConfig();

  if (!config) {
    return json(
      {
        success: false,
        error: 'No active Supabase connection. Please connect to Supabase first.',
      },
      { status: 400 },
    );
  }

  try {
    const body = (await request.json()) as DatabaseRequest;
    const { action, ...params } = body;

    switch (action) {
      case 'check_connection': {
        const isConnected = await checkDatabaseConnection();
        return json({ success: isConnected });
      }

      case 'list_tables': {
        const tables = await listDatabaseTables();
        return json(tables);
      }

      case 'create_table': {
        const { tableName, columns } = params;

        if (!tableName || !columns) {
          return json(
            {
              success: false,
              error: 'Table name and columns are required',
            },
            { status: 400 },
          );
        }

        const createResult = await createTable(tableName, columns);

        return json(createResult);
      }

      case 'execute': {
        const { operation } = params;

        if (!operation) {
          return json(
            {
              success: false,
              error: 'Operation is required',
            },
            { status: 400 },
          );
        }

        const result = await executeDatabaseOperation(operation as DatabaseOperation);

        return json(result);
      }

      default:
        return json(
          {
            success: false,
            error: `Unknown action: ${action}`,
          },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error('Database API error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An unknown error occurred',
      },
      { status: 500 },
    );
  }
}

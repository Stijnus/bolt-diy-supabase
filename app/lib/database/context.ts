import { getSupabaseConfig } from './supabase';
import { listDatabaseTables } from './service';

export interface DatabaseContextInfo {
  connected: boolean;
  projectUrl?: string;
  tables?: string[];
  schemas?: string[];
}

/**
 * Get the database context information for the LLM
 * This provides information about the current Supabase connection
 * and available database resources
 */
export async function getDatabaseContextForLLM(_context?: any): Promise<DatabaseContextInfo | null> {
  const config = getSupabaseConfig();

  if (!config) {
    return null; // No active connection
  }

  // Get tables to include in the context
  try {
    const tablesResult = await listDatabaseTables();

    const dbContext: DatabaseContextInfo = {
      connected: true,
      projectUrl: config.projectUrl,
      tables: tablesResult.success ? tablesResult.data : [],
      schemas: ['public'], // Default schema
    };

    return dbContext;
  } catch (error) {
    console.error('Error fetching database context:', error);

    // Return basic connection info even if we can't get tables
    return {
      connected: true,
      projectUrl: config.projectUrl,
    };
  }
}

/**
 * Generate system prompt additions for database operations
 * This gives the LLM instructions on how to interact with the database
 */
export function generateDatabaseSystemPrompt(
  context: DatabaseContextInfo | null,
  originalSystemPrompt: string = '',
): string {
  if (!context || !context.connected) {
    return originalSystemPrompt;
  }

  let prompt = `
You have access to a Supabase PostgreSQL database at ${context.projectUrl}.
`;

  if (context.tables && context.tables.length > 0) {
    prompt += `
Available tables: ${context.tables.join(', ')}
`;
  }

  prompt += `
To interact with the database, you can:
1. Create tables with appropriate columns and data types
2. Insert, update, or delete data
3. Query data to answer questions

Use the database API endpoints by forming operations like:
\`\`\`javascript
// To create a table
fetch('/api/database', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'create_table',
    tableName: 'users',
    columns: [
      { name: 'id', type: 'serial', constraints: 'PRIMARY KEY' },
      { name: 'name', type: 'text', constraints: 'NOT NULL' },
      { name: 'email', type: 'text', constraints: 'UNIQUE' }
    ]
  })
})

// To insert data
fetch('/api/database', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'execute',
    operation: {
      type: 'insert',
      table: 'users',
      data: { name: 'John Doe', email: 'john@example.com' },
      returning: true
    }
  })
})

// To query data
fetch('/api/database', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'execute',
    operation: {
      type: 'select',
      table: 'users',
      query: '*',
      filter: { email: 'john@example.com' }
    }
  })
})

// To execute custom SQL
fetch('/api/database', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'execute',
    operation: {
      type: 'execute',
      query: 'SELECT * FROM users WHERE email LIKE \\'%example.com\\''
    }
  })
})
\`\`\`

When the user asks you to create database tables or schemas, interact with the database, or perform any database-related tasks, use these endpoints to perform the operations directly.
`;

  // Combine with the original system prompt
  return originalSystemPrompt ? `${originalSystemPrompt}\n\n${prompt}` : prompt;
}

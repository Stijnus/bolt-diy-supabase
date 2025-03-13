import type { PromptOptions } from '~/lib/common/prompt-library';
import { getSystemPrompt } from './prompts';
import { generateDatabaseSystemPrompt, getDatabaseContextForLLM } from '~/lib/database/context';

export default async function supabasePrompt(options: PromptOptions): Promise<string> {
  // Get the base system prompt
  const basePrompt = getSystemPrompt(options.cwd);

  // Get real-time database context including tables
  const contextInfo = await getDatabaseContextForLLM();

  // Generate database-specific prompt with real connection info
  const databasePrompt = generateDatabaseSystemPrompt(contextInfo, '');

  // Add Supabase-specific API instructions
  const supabaseInstructions = `
<database_api_instructions>
AVAILABLE DATABASE OPERATIONS:
=================================================================

1. Database Schema Operations:
   - Create new tables with proper schema
   - Add/modify columns
   - Create indexes
   - Set up foreign key relationships
   - Enable Row Level Security (RLS)

2. Data Operations:
   - SELECT: Query data with filters and joins
   - INSERT: Add new records
   - UPDATE: Modify existing records
   - DELETE: Remove records
   - Execute custom SQL queries

3. Schema Information:
   - Get current database schema
   - View table structures
   - Check column types and constraints
   - List indexes and relationships

AVAILABLE API ENDPOINTS:
=================================================================

1. Check Database Status:
POST /api/llm-database
{ "action": "get_capabilities" }

2. Get Schema Information:
POST /api/llm-database
{ "action": "get_schema" }

3. Execute SQL Query (RECOMMENDED FOR SCHEMA OPERATIONS):
POST /api/llm-database
{
  "action": "execute_query",
  "operation": {
    "query": "YOUR SQL QUERY HERE"
  }
}

4. Execute CRUD Operations:
POST /api/llm-database
{
  "action": "execute_operation",
  "operation": {
    "operation": "select" | "insert" | "update" | "delete" | "execute",
    "table": "table_name",
    "query": "columns to select",
    "filter": { conditions },
    "data": { for insert/update },
    "returning": boolean
  }
}

IMPORTANT GUIDELINES:
=================================================================

1. Schema Operations:
   - Always use "execute_query" for CREATE TABLE, ALTER TABLE, etc.
   - Include proper constraints (PRIMARY KEY, FOREIGN KEY, etc.)
   - Set appropriate data types and NULL constraints
   - Consider adding indexes for performance
   - Enable RLS when creating tables

2. Data Operations:
   - Use "execute_operation" for simple CRUD operations
   - Use "execute_query" for complex queries with JOINs
   - Always validate data types match schema
   - Handle NULL values appropriately
   - Consider transaction safety

3. Best Practices:
   - Check schema before operations
   - Use parameterized queries when possible
   - Handle errors gracefully
   - Validate all inputs
   - Follow SQL best practices

Example Usage:
=================================================================

1. Creating a New Table with RLS:
\`\`\`javascript
const createTableResponse = await fetch('/api/llm-database', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'execute_query',
    operation: {
      query: \`
        CREATE TABLE IF NOT EXISTS users (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT now() NOT NULL
        );
        
        -- Enable RLS
        ALTER TABLE users ENABLE ROW LEVEL SECURITY;
        
        -- Create policy
        CREATE POLICY "Users can view own data" ON users
          FOR SELECT USING (auth.uid() = id);
      \`
    }
  })
});
\`\`\`

2. Complex Query with JOIN:
\`\`\`javascript
const queryResponse = await fetch('/api/llm-database', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'execute_query',
    operation: {
      query: \`
        SELECT u.name, p.title, p.created_at
        FROM users u
        JOIN posts p ON u.id = p.user_id
        WHERE p.status = 'published'
        ORDER BY p.created_at DESC
        LIMIT 10;
      \`
    }
  })
});
\`\`\`

3. Simple CRUD Operation:
\`\`\`javascript
const insertResponse = await fetch('/api/llm-database', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'execute_operation',
    operation: {
      operation: 'insert',
      table: 'users',
      data: {
        email: 'user@example.com',
        name: 'John Doe'
      },
      returning: true
    }
  })
});
\`\`\`

4. Update with Filter:
\`\`\`javascript
const updateResponse = await fetch('/api/llm-database', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'execute_operation',
    operation: {
      operation: 'update',
      table: 'users',
      data: {
        name: 'John Smith'
      },
      filter: {
        email: 'user@example.com'
      },
      returning: true
    }
  })
});
\`\`\`

Remember:
- Always check the schema before operations
- Use appropriate endpoints for different operations
- Handle errors and edge cases
- Follow security best practices
- Keep queries efficient and maintainable
</database_api_instructions>
`;

  // Combine all prompts - database context must come before API instructions
  return `${basePrompt}\n\n${databasePrompt}\n\n${supabaseInstructions}`;
}

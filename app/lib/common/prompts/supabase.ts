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
AVAILABLE DATABASE API ENDPOINTS:
=================================================================

1. Check Database Status:
POST /api/llm-database
{ "action": "get_capabilities" }

2. Get Schema Information:
POST /api/llm-database
{ "action": "get_schema" }

3. Execute SQL Query (RECOMMENDED FOR TABLE CREATION AND COMPLEX OPERATIONS):
POST /api/llm-database
{
  "action": "execute_query",
  "operation": {
    "query": "YOUR SQL QUERY HERE"
  }
}

4. Execute Operations for Simple CRUD:
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

IMPORTANT: Before using these endpoints:
1. CHECK YOUR CONTEXT FIRST - Connection info is already provided above
2. Only use these endpoints when you need to:
   - Perform actual database operations
   - Get updated schema information
   - Execute queries
3. DO NOT use these endpoints to check connection status
4. Always use proper error handling
5. Validate all inputs before executing operations

CRITICAL GUIDELINES FOR TABLE CREATION:
1. ALWAYS use the "execute_query" endpoint for creating tables, not "execute_operation"
2. When creating tables, ALWAYS use proper SQL CREATE TABLE syntax
3. Be sure to handle potential errors if tables already exist (use IF NOT EXISTS)
4. After creating tables, fetch the updated schema to confirm the creation

Example Usage:
\`\`\`javascript
// Creating a new table (ALWAYS use execute_query for SQL DDL statements)
const createTableResponse = await fetch('/api/llm-database', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'execute_query',
    operation: {
      query: "CREATE TABLE IF NOT EXISTS users (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now() NOT NULL);"
    }
  })
});

// Only check status if context information is outdated
const statusResponse = await fetch('/api/llm-database', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'get_capabilities' })
});

// Only get schema if you need updated information
const schemaResponse = await fetch('/api/llm-database', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'get_schema' })
});

// Execute a simple SELECT query (either method works)
const queryResponse = await fetch('/api/llm-database', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'execute_operation',
    operation: {
      operation: 'select',
      table: 'users',
      query: '*',
      filter: { active: true }
    }
  })
});
\`\`\`
</database_api_instructions>
`;

  // Combine all prompts - database context must come before API instructions
  return `${basePrompt}\n\n${databasePrompt}\n\n${supabaseInstructions}`;
}

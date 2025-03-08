import { getDatabaseContext } from './llm-supabase';
import { getManagementKey, createSupabaseProject, type ProjectStatus } from './management';

interface DatabaseContextInfo {
  connected: boolean;
  projectUrl: string;
  tables?: string[];
  schema?: SchemaInfo[];
  error?: string;
  managementKey?: {
    available: boolean;
    canCreateProjects: boolean;
  };
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

/**
 * Get the database context information for the LLM
 * This provides information about the current Supabase connection
 * and available database resources
 */
export async function getDatabaseContextForLLM(_context?: any): Promise<DatabaseContextInfo | null> {
  try {
    const context = await getDatabaseContext();
    const managementKey = getManagementKey();

    if (!context.connected) {
      return {
        connected: false,
        projectUrl: '',
        managementKey: {
          available: !!managementKey,
          canCreateProjects: !!managementKey,
        },
      };
    }

    return {
      connected: true,
      projectUrl: context.projectUrl,
      tables: context.schema.map((s) => s.table),
      schema: context.schema,
      managementKey: {
        available: !!managementKey,
        canCreateProjects: !!managementKey,
      },
    };
  } catch (error) {
    console.error('Error fetching database context:', error);
    return null;
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
  if (!context) {
    return originalSystemPrompt;
  }

  let prompt = '';

  if (!context.connected && context.managementKey?.canCreateProjects) {
    prompt = `
<supabase_project_creation>
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
                   ⚠️ NO DATABASE CONNECTED YET ⚠️                    
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

I notice there's no Supabase database connected yet, but I can help create one!
I have access to the Supabase Management API and can create a new project.

To create a new project, I need:
1. Project name (required)
2. Region (optional, defaults to us-east-1)

Would you like me to:
1. Create a new Supabase project for you?
2. Help you connect to an existing project?

Just let me know what you prefer!
=================================================================
</supabase_project_creation>
`;
    return originalSystemPrompt + prompt;
  }

  if (!context.connected) {
    return originalSystemPrompt;
  }

  prompt = `
<active_database_connection>
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
                   ⚠️ STOP AND READ THIS FIRST ⚠️                    
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

YOU ARE ALREADY CONNECTED TO A SUPABASE DATABASE
=================================================================
DO NOT MAKE API CALLS TO CHECK CONNECTION - READ THIS INFORMATION:

STATUS: ✅ CONNECTED AND READY
-----------------------------------------------------------------
Project URL.......: ${context.projectUrl}
Management API....: ${context.managementKey?.available ? '✅ Available' : '❌ Not configured'}
-----------------------------------------------------------------

Available Database Tables:
${
  context.tables && context.tables.length > 0
    ? context.tables.map((table) => `  • ${table}`).join('\n')
    : `  • No tables created yet
  
  YOU CAN CREATE NEW TABLES using the execute_query endpoint with SQL CREATE TABLE statements.
  Example: 
  CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
  );`
}

Schema Information:
${
  context.schema && context.schema.length > 0
    ? context.schema
        .map(
          (table) => `
Table: ${table.table}
Columns:
${table.columns
  .map(
    (col) =>
      `  • ${col.name} (${col.type})${col.is_nullable ? ' NULL' : ' NOT NULL'}${
        col.default_value ? ` DEFAULT ${col.default_value}` : ''
      }`,
  )
  .join('\n')}
`,
        )
        .join('\n')
    : '  • No schema information available'
}

❗️ CRITICAL INSTRUCTIONS - READ BEFORE RESPONDING:
-----------------------------------------------------------------
1. DO NOT MAKE API CALLS TO CHECK CONNECTION STATUS
   - You already have the connection information above
   - The database is confirmed connected
   - Use this information to answer connection-related questions

2. WHEN ASKED ABOUT THE DATABASE:
   - Respond with the Project URL and details shown above
   - Do not try to verify the connection - it's already verified
   - Include the actual connection information in your response

3. ONLY USE API CALLS FOR:
   - Executing actual database queries
   - Getting updated schema information
   - Performing database operations

4. YOUR RESPONSE SHOULD:
   - Include the actual Project URL shown above
   - Mention the available tables (if any)
   - Use this context instead of making API calls
=================================================================
</active_database_connection>
`;

  return originalSystemPrompt + prompt;
}

/**
 * Helper function to create a new Supabase project
 * @param name Project name
 * @param region Optional region (defaults to us-east-1)
 * @returns Project status
 */
export async function createProject(name: string, region?: string): Promise<ProjectStatus> {
  const managementKey = getManagementKey();

  if (!managementKey) {
    throw new Error('Management key is required to create a project');
  }

  return await createSupabaseProject(name, region);
}

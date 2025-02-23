import { createSupabaseClient } from './supabase';
import type { TableDefinition } from './schema';
import { generateTableSQL } from './schema';
import { toast } from 'react-toastify';

export async function createMigration(table: TableDefinition): Promise<string> {
  try {
    const sql = generateTableSQL(table);
    return sql;
  } catch (error) {
    console.error('Failed to create migration:', error);
    throw error;
  }
}

export async function executeMigration(sql: string): Promise<void> {
  try {
    const supabase = createSupabaseClient();
    const { error } = await supabase.rpc('execute_sql', { sql_query: sql });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Failed to execute migration:', error);
    toast.error('Failed to execute database migration');
    throw error;
  }
}

export async function validateMigration(sql: string): Promise<boolean> {
  // Check for forbidden operations
  const forbiddenPatterns = [
    /\bDROP\b/i,
    /\bTRUNCATE\b/i,
    /\bALTER\s+TABLE\s+.*\s+RENAME\b/i,
    /\bBEGIN\b/i,
    /\bCOMMIT\b/i,
    /\bROLLBACK\b/i,
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(sql)) {
      toast.error('Migration contains forbidden operations');
      return false;
    }
  }

  // Ensure RLS is enabled for new tables
  if (sql.includes('CREATE TABLE') && !sql.includes('ENABLE ROW LEVEL SECURITY')) {
    toast.error('New tables must have RLS enabled');
    return false;
  }

  return true;
}

import { z } from 'zod';

// Schema for table creation
export const TableSchema = z.object({
  name: z.string().min(1).max(63).regex(/^[a-z][a-z0-9_]*$/),
  columns: z.array(
    z.object({
      name: z.string().min(1).max(63).regex(/^[a-z][a-z0-9_]*$/),
      type: z.enum([
        'text',
        'varchar',
        'char',
        'int2',
        'int4',
        'int8',
        'float4',
        'float8',
        'bool',
        'date',
        'time',
        'timetz',
        'timestamp',
        'timestamptz',
        'interval',
        'uuid',
        'json',
        'jsonb',
      ]),
      nullable: z.boolean().default(false),
      unique: z.boolean().default(false),
      primaryKey: z.boolean().default(false),
      defaultValue: z.string().optional(),
      references: z
        .object({
          table: z.string(),
          column: z.string(),
          onDelete: z.enum(['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT']).default('NO ACTION'),
        })
        .optional(),
    }),
  ),
  enableRLS: z.boolean().default(true),
  policies: z.array(
    z.object({
      name: z.string(),
      action: z.enum(['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
      role: z.enum(['authenticated', 'anon', 'service_role']),
      using: z.string(),
      check: z.string().optional(),
    }),
  ),
});

export type TableDefinition = z.infer<typeof TableSchema>;

// Helper to generate SQL for table creation
export function generateTableSQL(table: TableDefinition): string {
  let sql = `/*
  # Create ${table.name} table
  
  1. New Tables
    - ${table.name}
${table.columns.map((col) => `      - ${col.name} (${col.type}${col.nullable ? ', nullable' : ''}${col.unique ? ', unique' : ''}${col.primaryKey ? ', primary key' : ''})`).join('\n')}
  
  2. Security
    - Enable RLS: ${table.enableRLS}
    - Policies:
${table.policies.map((policy) => `      - ${policy.name} (${policy.action} for ${policy.role})`).join('\n')}
*/

CREATE TABLE IF NOT EXISTS ${table.name} (
  ${table.columns
    .map((col) => {
      let definition = `${col.name} ${col.type}`;
      if (col.primaryKey) definition += ' PRIMARY KEY';
      if (!col.nullable) definition += ' NOT NULL';
      if (col.unique) definition += ' UNIQUE';
      if (col.defaultValue) definition += ` DEFAULT ${col.defaultValue}`;
      if (col.references) {
        definition += ` REFERENCES ${col.references.table}(${col.references.column})`;
        if (col.references.onDelete !== 'NO ACTION') {
          definition += ` ON DELETE ${col.references.onDelete}`;
        }
      }
      return definition;
    })
    .join(',\n  ')}
);

${table.enableRLS ? `\nALTER TABLE ${table.name} ENABLE ROW LEVEL SECURITY;` : ''}

${table.policies
  .map(
    (policy) => `
CREATE POLICY "${policy.name}"
  ON ${table.name}
  FOR ${policy.action}
  TO ${policy.role}
  USING (${policy.using})${policy.check ? `\n  WITH CHECK (${policy.check})` : ''};`,
  )
  .join('\n')}
`

  return sql;
}
import { z } from 'zod';
import type { ColumnDefinition } from './types';

// Schema for table creation
export const TABLE_SCHEMA = z.object({
  name: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z][a-z0-9_]*$/),
  columns: z.array(
    z.object({
      name: z
        .string()
        .min(1)
        .max(63)
        .regex(/^[a-z][a-z0-9_]*$/),
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

export type TableDefinition = z.infer<typeof TABLE_SCHEMA>;

// Interface for table schema
export interface TableSchema {
  name: string;
  columns: ColumnDefinition[];
  constraints?: string[];
  indexes?: string[];
}

// Helper to generate SQL for table creation
export function generateTableSQL(table: TableSchema): string {
  const columnDefs = table.columns
    .map((col) => {
      let def = `${col.name} ${col.type}`;

      if (col.nullable === false) {
        def += ' NOT NULL';
      }

      if (col.default !== undefined) {
        def += ` DEFAULT ${col.default}`;
      }

      if (col.unique) {
        def += ' UNIQUE';
      }

      return def;
    })
    .join(',\n  ');

  let sql = `CREATE TABLE IF NOT EXISTS ${table.name} (\n  ${columnDefs}`;

  // Add constraints if any
  if (table.constraints?.length) {
    sql += ',\n  ' + table.constraints.join(',\n  ');
  }

  sql += '\n);';

  // Add indexes if any
  if (table.indexes?.length) {
    sql += '\n\n' + table.indexes.join(';\n') + ';';
  }

  return sql;
}

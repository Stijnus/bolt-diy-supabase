import { z } from 'zod'; // We'll need to add zod as a dependency

// Branded types for sensitive data
declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type ApiKey = Brand<string, 'ApiKey'>;
export type ProjectUrl = Brand<string, 'ProjectUrl'>;

// Zod schemas for runtime validation
export const apiKeySchema = z
  .string()
  .min(20)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .brand<'ApiKey'>();

export const projectUrlSchema = z
  .string()
  .url()
  .regex(/\.supabase\.co$/)
  .brand<'ProjectUrl'>();

export const supabaseConfigSchema = z.object({
  projectUrl: projectUrlSchema,
  apiKey: apiKeySchema,
});

export type SupabaseConfig = z.infer<typeof supabaseConfigSchema>;

// Database operation types
export const operationTypeSchema = z.enum(['select', 'insert', 'update', 'delete', 'execute']);
export type OperationType = z.infer<typeof operationTypeSchema>;

export const databaseOperationSchema = z.object({
  type: operationTypeSchema,
  table: z.string().optional(),
  schema: z.string().optional(),
  query: z.string().optional(),
  filter: z.record(z.unknown()).optional(),
  data: z.union([z.record(z.unknown()), z.array(z.record(z.unknown()))]).optional(),
  returning: z.union([z.boolean(), z.array(z.string())]).optional(),
});

export type DatabaseOperation = z.infer<typeof databaseOperationSchema>;

// Response types
export interface DatabaseError {
  message: string;
  details?: string;
  code?: string;
}

export interface DatabaseResponse<T> {
  success: boolean;
  data?: T;
  error?: DatabaseError;
}

// Type guards
export function isApiKey(value: string): value is ApiKey {
  return apiKeySchema.safeParse(value).success;
}

export function isProjectUrl(value: string): value is ProjectUrl {
  return projectUrlSchema.safeParse(value).success;
}

export function validateSupabaseConfig(config: unknown): SupabaseConfig {
  return supabaseConfigSchema.parse(config);
}

export function validateDatabaseOperation(operation: unknown): DatabaseOperation {
  return databaseOperationSchema.parse(operation);
}

export interface ColumnDefinition {
  name: string;
  type: string;
  nullable?: boolean;
  unique?: boolean;
  default?: string;
}

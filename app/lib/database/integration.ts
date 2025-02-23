import { getSupabaseConfig } from './supabase';
import { createClient } from '@supabase/supabase-js';
import { writeFile, readFile } from '~/utils/fileUtils';
import { WORK_DIR } from '~/utils/constants';
import { path } from '~/utils/path';
import type { PackageJson } from '~/types/package';

interface MigrationResult {
  success: boolean;
  error?: string;
}

export async function getSupabaseIntegrationDetails() {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error('No Supabase configuration found. Please connect to Supabase first.');
  }

  return {
    projectUrl: config.projectUrl,
    anonKey: config.apiKey,
  };
}

export async function writeSupabaseEnvFile(projectPath: string = WORK_DIR): Promise<void> {
  const config = await getSupabaseIntegrationDetails();

  const envContent = `SUPABASE_URL=${config.projectUrl}
SUPABASE_ANON_KEY=${config.anonKey}
`;

  await writeFile(path.join(projectPath, '.env'), envContent);
  await writeFile(path.join(projectPath, '.env.example'), envContent.replace(/=.+/g, '=your_value_here'));
}

export async function executeMigrations(migrations: string[]): Promise<MigrationResult[]> {
  const config = await getSupabaseIntegrationDetails();
  const supabase = createClient(config.projectUrl, config.anonKey);

  const results: MigrationResult[] = [];

  for (const migration of migrations) {
    try {
      const { error } = await supabase.rpc('execute_sql', { sql_query: migration });

      if (error) {
        results.push({
          success: false,
          error: error.message,
        });
        continue;
      }

      results.push({ success: true });
    } catch (error) {
      results.push({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error executing migration',
      });
    }
  }

  return results;
}

export async function generateSupabaseClient(projectPath: string = WORK_DIR): Promise<string> {
  const config = await getSupabaseIntegrationDetails();

  const clientCode = `import { createClient } from '@supabase/supabase-js'

const supabaseUrl = '${config.projectUrl}'
const supabaseAnonKey = '${config.anonKey}'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
`;

  await writeFile(path.join(projectPath, 'src', 'supabaseClient.ts'), clientCode);

  return 'src/supabaseClient.ts';
}

export async function setupSupabaseProject(projectPath: string = WORK_DIR): Promise<void> {
  // Write environment files
  await writeSupabaseEnvFile(projectPath);

  // Generate Supabase client
  await generateSupabaseClient(projectPath);

  // Add Supabase dependencies to package.json
  const packageJsonPath = path.join(projectPath, 'package.json');
  const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(packageJsonContent) as PackageJson;

  if (!packageJson.dependencies) {
    packageJson.dependencies = {};
  }

  packageJson.dependencies['@supabase/supabase-js'] = '^2.39.0';

  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
}

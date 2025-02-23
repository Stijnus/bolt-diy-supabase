import { toast } from 'react-toastify';
import { logStore } from '~/lib/stores/logs';
import { createClient } from '@supabase/supabase-js';

const MANAGEMENT_KEY_STORAGE = 'bolt_supabase_management';
const MAX_POLL_ATTEMPTS = 180; // 3 minutes with 1-second intervals
const POLL_INTERVAL = 1000; // 1 second

interface Organization {
  id: string;
  name: string;
}

interface ProjectCreateParams {
  name: string;
  organization_id: string;
  region?: string;
  db_pass?: string;
  kps_enabled?: boolean;
}

interface ProjectStatus {
  ref: string;
  status: string;
  api: {
    anon_key: string;
    service_role_key: string;
  };
  services: Array<{
    name: string;
    status: string;
    statusMessage?: string;
  }>;
}

interface ApiErrorResponse {
  error?: string;
  message?: string;
}

interface ApiResponse<T> {
  data: T;
  error: ApiErrorResponse | null;
}

export function getManagementKey(): string | null {
  return localStorage.getItem(MANAGEMENT_KEY_STORAGE);
}

export function setManagementKey(key: string) {
  localStorage.setItem(MANAGEMENT_KEY_STORAGE, key);
}

export function clearManagementKey() {
  localStorage.removeItem(MANAGEMENT_KEY_STORAGE);
}

async function fetchOrganizations(): Promise<Organization[]> {
  const managementKey = getManagementKey();

  if (!managementKey) {
    throw new Error('Management key not found');
  }

  const response = await fetch('/api/supabase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Supabase-Management-Key': managementKey,
    },
    body: JSON.stringify({
      path: '/organizations',
      method: 'GET',
    }),
  });

  const data = (await response.json()) as ApiResponse<Organization[]>;

  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to fetch organizations');
  }

  return data.data;
}

async function createProject(params: ProjectCreateParams): Promise<ProjectStatus> {
  const managementKey = getManagementKey();

  if (!managementKey) {
    throw new Error('Management key not found');
  }

  const response = await fetch('/api/supabase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Supabase-Management-Key': managementKey,
    },
    body: JSON.stringify({
      path: '/projects',
      method: 'POST',
      body: params,
    }),
  });

  const data = (await response.json()) as ApiResponse<ProjectStatus>;

  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to create project');
  }

  return data.data;
}

function logInfo(message: string, details: Record<string, unknown>) {
  logStore.logInfo(message, {
    type: 'supabase_status',
    message,
    ...details,
  });
}

export async function createSupabaseProject(description: string, region = 'us-east-1'): Promise<ProjectStatus> {
  const managementKey = getManagementKey();

  if (!managementKey) {
    throw new Error('Management key not found');
  }

  try {
    logInfo('Creating Supabase project', {
      type: 'supabase_create',
      description,
      region,
    });

    const organizations = await fetchOrganizations();

    if (!organizations.length) {
      throw new Error('No organizations found');
    }

    const project = await createProject({
      name: description,
      organization_id: organizations[0].id,
      region,
      db_pass: generateSecurePassword(),
      kps_enabled: true,
    });

    // Wait for project to be ready
    const status = await pollProjectStatus(project.ref, managementKey);

    // Execute initial migrations
    const supabase = createClient(`https://${status.ref}.supabase.co`, status.api.service_role_key);

    // Execute the get_table_info function migration
    await supabase.rpc('execute_sql', {
      sql_query: `
        CREATE OR REPLACE FUNCTION public.get_table_info()
        RETURNS TABLE (
          table_name text,
          row_count bigint,
          size bigint
        ) 
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $$
        BEGIN
          RETURN QUERY
          SELECT 
            tables.table_name::text,
            (xpath('/row/c/text()', query_to_xml(format('SELECT COUNT(*) AS c FROM %I.%I', table_schema, table_name), FALSE, TRUE, '')))[1]::text::bigint AS row_count,
            pg_total_relation_size(format('%I.%I', table_schema, table_name)::regclass) AS size
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE';
        END;
        $$;

        GRANT EXECUTE ON FUNCTION public.get_table_info() TO authenticated;
      `,
    });

    return status;
  } catch (error) {
    logStore.logError('Failed to create Supabase project', error as Error);
    throw error;
  }
}

async function pollProjectStatus(projectRef: string, managementKey: string): Promise<ProjectStatus> {
  let attempts = 0;

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const response = await fetch('/api/supabase', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Supabase-Management-Key': managementKey,
          },
          body: JSON.stringify({
            path: `/projects/${projectRef}`,
            method: 'GET',
          }),
        });

        const data = (await response.json()) as ApiResponse<ProjectStatus>;

        if (!response.ok) {
          throw new Error(data.error?.message || 'Failed to check project status');
        }

        const status = data.data;

        logInfo('Project status retrieved', {
          projectRef,
          status: status.status,
          services: status.services.map((s) => ({ name: s.name, status: s.status })),
        });

        // Update toast with current status
        const pendingServices = status.services.filter((s) => s.status !== 'ACTIVE_HEALTHY');

        if (pendingServices.length > 0) {
          const message = `Setting up: ${pendingServices.map((s) => s.name).join(', ')}`;
          toast.info(message, {
            autoClose: false,
            toastId: 'supabase-setup',
          });
          logInfo(message, {
            projectRef,
            pendingServices: pendingServices.length,
          });
        }

        // Check if all services are ready
        const allReady = status.services.every((s) => s.status === 'ACTIVE_HEALTHY');

        if (allReady) {
          toast.dismiss('supabase-setup');
          toast.success('Supabase project is ready!');
          logInfo('Project setup complete', {
            message: 'All services are healthy',
            projectRef,
          });
          resolve(status);

          return;
        }

        // Check timeout
        if (++attempts >= MAX_POLL_ATTEMPTS) {
          toast.dismiss('supabase-setup');

          const timeoutError = new Error(`Timeout waiting for project to be ready after ${MAX_POLL_ATTEMPTS} attempts`);
          logStore.logError('Project setup timeout', timeoutError);
          reject(timeoutError);

          return;
        }

        // Continue polling
        setTimeout(poll, POLL_INTERVAL);
      } catch (error) {
        toast.dismiss('supabase-setup');
        logStore.logError('Failed to check project status', error as Error);
        reject(error);
      }
    };

    poll();
  });
}

function generateSecurePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const length = 16;

  return Array.from(crypto.getRandomValues(new Uint32Array(length)))
    .map((x) => chars[x % chars.length])
    .join('');
}

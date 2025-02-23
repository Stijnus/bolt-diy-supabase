import { toast } from 'react-toastify';
import { logStore } from '~/lib/stores/logs';
import { generateProjectRef } from './supabase';

const MANAGEMENT_KEY_STORAGE = 'bolt_supabase_management';
const MAX_POLL_ATTEMPTS = 180; // 3 minutes with 1-second intervals
const POLL_INTERVAL = 1000; // 1 second
const INITIAL_DELAY = 60000; // 1 minute initial delay before first status check

interface ProjectStatus {
  ref: string;
  status: string;
  api: {
    anon_key: string;
    service_role_key: string;
  };
  services: {
    name: string;
    status: string;
    statusMessage?: string;
  }[];
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

export async function createSupabaseProject(description: string, region = 'us-east-1') {
  const managementKey = getManagementKey();
  if (!managementKey) {
    throw new Error('Management key not found');
  }

  const dbPass = generateSecurePassword();

  try {
    logStore.logInfo('Creating Supabase project', {
      type: 'supabase_create',
      message: 'Starting project creation process',
      description,
      region,
    });

    // Get organization ID first
    const orgResponse = await fetch('/api/supabase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Supabase-Management-Key': managementKey,
      },
      body: JSON.stringify({
        path: '/organizations',
        method: 'GET'
      }),
    });

    if (!orgResponse.ok) {
      const error = await orgResponse.json();
      logStore.logError('Failed to get organizations', error);
      throw new Error(error.error || 'Failed to get organizations');
    }

    const organizations = await orgResponse.json();
    if (!organizations?.length) {
      throw new Error('No organizations found');
    }

    const organizationId = organizations[0].id;
    logStore.logInfo('Found organization', {
      type: 'supabase_create',
      message: 'Organization found',
      organizationId,
    });

    // Create project
    const createResponse = await fetch('/api/supabase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Supabase-Management-Key': managementKey,
      },
      body: JSON.stringify({
        path: '/projects',
        method: 'POST',
        body: {
          name: description,
          organization_id: organizationId,
          region,
          db_pass: dbPass,
          kps_enabled: true
        },
      }),
    });

    if (!createResponse.ok) {
      const error = await createResponse.json();
      logStore.logError('Failed to create project', error);
      throw new Error(error.error || 'Failed to create project');
    }

    const project = await createResponse.json();
    logStore.logInfo('Project created', {
      type: 'supabase_create',
      message: 'Project created successfully',
      projectRef: project.ref,
    });

    // Add initial delay before starting to poll
    logStore.logInfo('Waiting for initial setup', {
      type: 'supabase_create',
      message: `Waiting ${INITIAL_DELAY/1000} seconds before checking status`,
      projectRef: project.ref,
    });

    toast.info(`Project created. Waiting ${INITIAL_DELAY/1000} seconds for initial setup...`, {
      autoClose: false,
      toastId: 'supabase-initial-delay'
    });

    await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY));
    
    toast.dismiss('supabase-initial-delay');
    
    // Start polling for project status
    return pollProjectStatus(project.ref, managementKey);
  } catch (error) {
    logStore.logError('Failed to create Supabase project', error);
    throw error;
  }
}

function generateSecurePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const length = 16;
  return Array.from(crypto.getRandomValues(new Uint32Array(length)))
    .map((x) => chars[x % chars.length])
    .join('');
}

async function pollProjectStatus(projectRef: string, managementKey: string): Promise<ProjectStatus> {
  let attempts = 0;
  let lastError: Error | null = null;
  const maxRetries = 3;

  const checkStatus = async (retryCount = 0): Promise<ProjectStatus> => {
    try {
      const response = await fetch('/api/supabase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Supabase-Management-Key': managementKey,
        },
        body: JSON.stringify({
          path: `/projects/${projectRef}`,
          method: 'GET'
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to check project status');
      }

      const status = await response.json();
      logStore.logInfo('Project status check', {
        type: 'supabase_status',
        message: 'Project status retrieved',
        projectRef,
        status: status.status,
        services: status.services.map((s: any) => ({ name: s.name, status: s.status })),
      });

      return status;
    } catch (error) {
      lastError = error as Error;
      
      if (retryCount < maxRetries) {
        logStore.logWarning(`Retrying status check (attempt ${retryCount + 1}/${maxRetries})`, {
          type: 'supabase_status',
          error: lastError.message,
          projectRef,
        });
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        return checkStatus(retryCount + 1);
      }
      
      throw error;
    }
  };

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await checkStatus();
        
        // Update toast with current status
        const pendingServices = status.services.filter(s => s.status !== 'ACTIVE_HEALTHY');
        if (pendingServices.length > 0) {
          const message = `Setting up: ${pendingServices.map(s => s.name).join(', ')}`;
          toast.info(message, {
            autoClose: false,
            toastId: 'supabase-setup',
          });
          logStore.logInfo(message, {
            type: 'supabase_status',
            projectRef,
            pendingServices: pendingServices.length,
          });
        }

        // Check if all services are ready
        const allReady = status.services.every(s => s.status === 'ACTIVE_HEALTHY');
        if (allReady) {
          toast.dismiss('supabase-setup');
          toast.success('Supabase project is ready!');
          logStore.logInfo('Project setup complete', {
            type: 'supabase_status',
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
          logStore.logError('Project setup timeout', timeoutError, {
            type: 'supabase_status',
            projectRef,
            attempts,
          });
          reject(timeoutError);
          return;
        }

        // Continue polling
        setTimeout(poll, POLL_INTERVAL);
      } catch (error) {
        toast.dismiss('supabase-setup');
        logStore.logError('Failed to check project status', error, {
          type: 'supabase_status',
          projectRef,
          attempts,
        });
        reject(error);
      }
    };

    poll();
  });
}
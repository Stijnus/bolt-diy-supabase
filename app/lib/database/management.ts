const MANAGEMENT_KEY_STORAGE = 'supabase-management-key';

export interface ProjectStatus {
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

export interface ApiResponse<T = any> {
  data?: T;
  error?: {
    message?: string;
    [key: string]: any;
  };
}

export interface Region {
  id: string;
  name: string;
}

const DEFAULT_REGIONS: Region[] = [
  { id: 'us-east-1', name: 'US East (N. Virginia)' },
  { id: 'us-west-1', name: 'US West (Oregon)' },
  { id: 'eu-central-1', name: 'EU Central (Frankfurt)' },
  { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' },
];

export function getManagementKey(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return localStorage.getItem(MANAGEMENT_KEY_STORAGE);
}

export function setManagementKey(key: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(MANAGEMENT_KEY_STORAGE, key);
}

export function clearManagementKey(): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(MANAGEMENT_KEY_STORAGE);
}

function generateRandomPassword() {
  return [...Array(16)].map(() => String.fromCharCode(Math.floor(Math.random() * 26) + 97)).join('');
}

async function getOrgId(managementKey: string): Promise<string> {
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

  const result = (await response.json()) as ApiResponse<Array<{ id: string; name: string }>>;

  if (!response.ok || !result.data) {
    throw new Error(result.error?.message || 'Failed to fetch organizations');
  }

  const orgs = result.data;

  if (orgs.length === 0) {
    throw new Error('No organizations found');
  }

  return orgs[0].id;
}

export async function createSupabaseProject(description: string, region?: string): Promise<ProjectStatus> {
  const managementKey = getManagementKey();

  if (!managementKey) {
    throw new Error('Management key not configured');
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
      body: {
        name: description,
        region: region || 'us-east-1',
        db_pass: generateRandomPassword(),
        org_id: await getOrgId(managementKey),
      },
    }),
  });

  const result = (await response.json()) as ApiResponse<ProjectStatus>;

  if (!response.ok || !result.data) {
    throw new Error(result.error?.message || 'Failed to create project');
  }

  return result.data;
}

export async function getAvailableRegions(managementKey: string): Promise<Region[]> {
  try {
    console.log('Fetching available regions from Supabase...');

    const response = await fetch('/api/supabase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Supabase-Management-Key': managementKey,
      },
      body: JSON.stringify({
        path: '/regions',
        method: 'GET',
      }),
    });

    // Handle 404 errors by returning default regions
    if (response.status === 404) {
      console.log('Regions endpoint returned 404, using default regions');
      return DEFAULT_REGIONS;
    }

    if (!response.ok) {
      console.error('Failed to fetch regions:', response.status);
      throw new Error(`Failed to fetch regions: ${response.statusText}`);
    }

    const result = (await response.json()) as ApiResponse<Region[]>;
    console.log('Regions response:', result);

    if (!result.data) {
      console.warn('No regions data returned, using default regions');
      return DEFAULT_REGIONS;
    }

    return result.data;
  } catch (error) {
    console.error('Error fetching regions:', error);

    // Return default regions if there's an error
    return DEFAULT_REGIONS;
  }
}

/**
 * Tests if a management key is valid by making a request to the Supabase API
 */
export async function verifyManagementKey(key: string): Promise<boolean> {
  try {
    const response = await fetch('/api/supabase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Supabase-Management-Key': key,
      },
      body: JSON.stringify({
        path: '/organizations',
        method: 'GET',
      }),
    });

    const result = (await response.json()) as ApiResponse<any>;

    return response.ok && !!result.data;
  } catch (error) {
    console.error('Error verifying management key:', error);
    return false;
  }
}

export async function getProjectStatus(projectRef: string): Promise<{ status: string }> {
  const managementKey = getManagementKey();

  if (!managementKey) {
    throw new Error('Management key not configured');
  }

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

  const result = (await response.json()) as ApiResponse<{ status: string }>;

  if (!response.ok || !result.data) {
    throw new Error(result.error?.message || 'Failed to get project status');
  }

  return result.data;
}

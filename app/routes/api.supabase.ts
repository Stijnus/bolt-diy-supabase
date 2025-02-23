import { json } from '@remix-run/cloudflare';
import type { ActionFunctionArgs } from '@remix-run/cloudflare';

interface SupabaseApiRequest {
  path: string;
  method?: string;
  body?: Record<string, unknown>;
}

const SUPABASE_MANAGEMENT_API = 'https://api.supabase.com/v1';

export async function action({ request }: ActionFunctionArgs) {
  try {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }

    const requestData = (await request.json()) as SupabaseApiRequest;
    const { path, method = 'GET', body } = requestData;

    if (!path) {
      return json({ error: 'Path is required' }, { status: 400 });
    }

    // Get management key from request headers
    const managementKey = request.headers.get('X-Supabase-Management-Key');

    if (!managementKey) {
      return json({ error: 'Management key is required' }, { status: 401 });
    }

    // Forward request to Supabase Management API
    const response = await fetch(`${SUPABASE_MANAGEMENT_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${managementKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const responseData = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      console.error('Supabase API error:', {
        status: response.status,
        data: responseData,
        path,
        method,
      });
      return json(
        { error: responseData.message || 'Failed to communicate with Supabase' },
        { status: response.status },
      );
    }

    return json(responseData);
  } catch (error) {
    console.error('Supabase management API error:', error);
    return json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}

import { json } from '@remix-run/cloudflare';
import type { ActionFunctionArgs } from '@remix-run/cloudflare';

interface SupabaseApiRequest {
  path: string;
  method?: string;
  body?: Record<string, unknown>;
  action?: 'test-management-key';
}

const SUPABASE_MANAGEMENT_API = 'https://api.supabase.com/v1';

export async function action({ request }: ActionFunctionArgs) {
  try {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }

    const requestData = (await request.json()) as SupabaseApiRequest;
    const { path, method = 'GET', body, action } = requestData;

    // Get management key from request headers
    const managementKey = request.headers.get('X-Supabase-Management-Key');

    if (!managementKey) {
      console.error('Missing management key in request');
      return json({ error: 'Management key is required' }, { status: 401 });
    }

    // Regular API request handling
    if (!path) {
      console.error('Missing path in request');
      return json({ error: 'Path is required' }, { status: 400 });
    }

    console.log(`Proxying request to Supabase API: ${method} ${path}`);

    if (body) {
      console.log('Request body:', JSON.stringify(body, null, 2));
    }

    // Forward request to Supabase Management API
    const url = `${SUPABASE_MANAGEMENT_API}${path}`;
    console.log('Full request URL:', url);

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${managementKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const responseData = (await response.json()) as Record<string, any>;
    console.log(`Supabase API response (${response.status}):`, JSON.stringify(responseData, null, 2));

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

    return json({ data: responseData });
  } catch (error) {
    console.error('Supabase management API error:', error);
    return json({ error: error instanceof Error ? error.message : 'Internal server error' }, { status: 500 });
  }
}

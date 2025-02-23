import { json } from '@remix-run/cloudflare';
import type { ActionFunctionArgs } from '@remix-run/cloudflare';

const SUPABASE_MANAGEMENT_API = 'https://api.supabase.com/v1';

export async function action({ request }: ActionFunctionArgs) {
  try {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }

    const { path, method = 'GET', body } = await request.json();
    
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
        'Authorization': `Bearer ${managementKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Supabase API error:', {
        status: response.status,
        data,
        path,
        method
      });
      return json(
        { error: data.error?.message || data.message || 'Failed to communicate with Supabase' }, 
        { status: response.status }
      );
    }

    return json(data);
  } catch (error) {
    console.error('Supabase management API error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Internal server error' }, 
      { status: 500 }
    );
  }
}
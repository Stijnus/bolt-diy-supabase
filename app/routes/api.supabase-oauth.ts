import { json } from '@remix-run/cloudflare';
import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import { setManagementKey } from '~/lib/database/management';

// This is the URL where Supabase will redirect after OAuth
const REDIRECT_URL =
  process.env.NODE_ENV === 'development'
    ? 'http://localhost:5173/api/supabase-oauth'
    : 'https://bolt.new/api/supabase-oauth';

// The OAuth client ID and secret should be stored securely
const SUPABASE_OAUTH_CLIENT_ID = process.env.SUPABASE_OAUTH_CLIENT_ID;
const SUPABASE_OAUTH_CLIENT_SECRET = process.env.SUPABASE_OAUTH_CLIENT_SECRET;

// Add UUID validation function
const isValidUUID = (uuid: string) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

// Add a simple encode/decode function for the state parameter
const encodeState = (clientId: string, clientSecret: string) => {
  return Buffer.from(JSON.stringify({ clientId, clientSecret })).toString('base64');
};

const decodeState = (state: string) => {
  try {
    return JSON.parse(Buffer.from(state, 'base64').toString());
  } catch (e) {
    return null;
  }
};

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  if (error) {
    console.error('OAuth error:', error, errorDescription);
    return json({ error, errorDescription }, { status: 400 });
  }

  if (!code) {
    return json({ error: 'No code provided' }, { status: 400 });
  }

  if (!state) {
    return json({ error: 'No state parameter provided' }, { status: 400 });
  }

  // Decode the state parameter to get the credentials
  const credentials = decodeState(state);
  if (!credentials || !credentials.clientId || !credentials.clientSecret) {
    return json({ error: 'Invalid state parameter' }, { status: 400 });
  }

  try {
    // Log the request parameters for debugging
    console.log('Token exchange parameters:', {
      code,
      redirect_uri: REDIRECT_URL,
      hasClientId: !!credentials.clientId,
      hasClientSecret: !!credentials.clientSecret,
    });

    // Exchange the code for an access token using the credentials from state
    const tokenResponse = await fetch('https://api.supabase.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        redirect_uri: REDIRECT_URL,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch (e) {
        errorJson = null;
      }

      console.error('Token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorJson || errorText,
      });

      return json(
        {
          error: 'Failed to exchange code for token',
          details: errorJson || errorText,
          status: tokenResponse.status,
        },
        { status: 500 },
      );
    }

    const { access_token } = await tokenResponse.json();

    if (!access_token) {
      console.error('No access token in response');
      return json({ error: 'No access token received' }, { status: 500 });
    }

    // Store the access token as the management key
    setManagementKey(access_token);

    // Redirect back to the root page with a success parameter
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/?supabase=connected',
      },
    });
  } catch (error) {
    console.error('OAuth handler error:', error);
    return json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

// Start the OAuth flow
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  let clientId = SUPABASE_OAUTH_CLIENT_ID;
  let clientSecret = SUPABASE_OAUTH_CLIENT_SECRET;

  // Check if credentials are provided in the request body
  if (!clientId || !clientSecret) {
    try {
      const body = await request.json();
      if (body.clientId && body.clientSecret) {
        clientId = body.clientId;
        clientSecret = body.clientSecret;
      }
    } catch (error) {
      // If no JSON body, continue with env variables
    }
  }

  // Validate OAuth credentials
  if (!clientId || !clientSecret) {
    console.error('Missing OAuth credentials');
    return json(
      {
        error:
          'OAuth credentials not configured. Please set SUPABASE_OAUTH_CLIENT_ID and SUPABASE_OAUTH_CLIENT_SECRET environment variables.',
      },
      { status: 500 },
    );
  }

  // Validate client ID format
  if (!isValidUUID(clientId)) {
    return json(
      {
        error: 'Invalid client ID format',
        details: {
          message: 'Client ID must be a valid UUID format (e.g., 123e4567-e89b-12d3-a456-426614174000)',
        },
      },
      { status: 400 },
    );
  }

  try {
    // Generate the OAuth URL with state parameter
    const oauthUrl = new URL('https://api.supabase.com/v1/oauth/authorize');
    oauthUrl.searchParams.set('client_id', clientId);
    oauthUrl.searchParams.set('redirect_uri', REDIRECT_URL);
    oauthUrl.searchParams.set('response_type', 'code');
    oauthUrl.searchParams.set('scope', 'all');
    oauthUrl.searchParams.set('state', encodeState(clientId, clientSecret));

    return json({ url: oauthUrl.toString() });
  } catch (error) {
    console.error('Failed to generate OAuth URL:', error);
    return json({ error: 'Failed to generate OAuth URL' }, { status: 500 });
  }
}

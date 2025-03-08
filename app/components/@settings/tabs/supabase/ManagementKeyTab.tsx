import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { getManagementKey, setManagementKey, clearManagementKey } from '~/lib/database/management';
import { useSearchParams } from '@remix-run/react';
import { toast } from 'react-toastify';

// Add these interfaces at the top of the file
interface ApiResponse {
  data?: any;
  error?: {
    message: string;
  };
}

interface OAuthResponse {
  url: string;
  error?: string;
  details?: any;
  status?: number;
}

interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

interface ManagementKeyTabProps {
  onConnectionUpdate?: () => void;
}

// Add UUID validation function at the top with other interfaces
const isValidUUID = (uuid: string) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

const OAUTH_CREDENTIALS_STORAGE = 'supabase-oauth-credentials';

interface StoredOAuthCredentials extends OAuthCredentials {
  timestamp: number;
}

function getStoredOAuthCredentials(): OAuthCredentials | null {
  try {
    const stored = localStorage.getItem(OAUTH_CREDENTIALS_STORAGE);

    if (!stored) {
      return null;
    }

    const credentials = JSON.parse(stored) as StoredOAuthCredentials;

    return {
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
    };
  } catch {
    return null;
  }
}

function setStoredOAuthCredentials(credentials: OAuthCredentials) {
  const toStore: StoredOAuthCredentials = {
    ...credentials,
    timestamp: Date.now(),
  };
  localStorage.setItem(OAUTH_CREDENTIALS_STORAGE, JSON.stringify(toStore));
}

function clearStoredOAuthCredentials() {
  localStorage.removeItem(OAUTH_CREDENTIALS_STORAGE);
}

export default function ManagementKeyTab({ onConnectionUpdate }: ManagementKeyTabProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [managementKey, setKey] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [showOAuthDialog, setShowOAuthDialog] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [oauthCredentials, setOAuthCredentials] = useState<OAuthCredentials>({
    clientId: '',
    clientSecret: '',
  });

  const testManagementKey = async (): Promise<boolean> => {
    const key = getManagementKey();

    if (!key) {
      return false;
    }

    try {
      setIsConnecting(true);

      const response = await fetch('/api/supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_key' }),
      });

      if (!response.ok) {
        throw new Error('Failed to test management key');
      }

      toast.success('Successfully verified your Supabase management key.');

      // Notify parent of successful connection
      onConnectionUpdate?.();

      return true;
    } catch (err) {
      console.error('Test failed:', err);
      toast.error('Failed to verify your Supabase management key.');

      return false;
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    // Load stored credentials on mount
    const storedCredentials = getStoredOAuthCredentials();

    if (storedCredentials) {
      setOAuthCredentials(storedCredentials);
    }

    const key = getManagementKey();
    setHasKey(!!key);

    if (key) {
      setKey(key);
    }

    const supabaseStatus = searchParams.get('supabase');
    const oauthStatus = searchParams.get('oauth');

    const handleConnectionSuccess = async () => {
      // Show connecting message
      toast.info('Establishing connection to Supabase...');

      // Remove the parameters without page reload
      if (supabaseStatus) {
        searchParams.delete('supabase');
      }

      if (oauthStatus) {
        searchParams.delete('oauth');
      }

      setSearchParams(searchParams);

      // Close the OAuth dialog if it was open
      setShowOAuthDialog(false);

      // Test the key and update connection state
      const isSuccess = await testManagementKey();

      if (isSuccess) {
        // Store OAuth credentials if we have them
        if (oauthCredentials.clientId && oauthCredentials.clientSecret) {
          setStoredOAuthCredentials(oauthCredentials);
        }

        // Notify parent of connection update
        onConnectionUpdate?.();

        // Show success message
        toast.success('Successfully connected to Supabase');

        // Wait for state updates to complete
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Redirect to root with tab=supabase to show connection status
        window.location.href = '/?tab=supabase';
      }
    };

    if (supabaseStatus === 'connected' || oauthStatus === 'success') {
      handleConnectionSuccess();
    }
  }, [searchParams]);

  const validateManagementKey = (key: string): boolean => {
    return /^sbp_[a-zA-Z0-9]{40,}$/.test(key.trim());
  };

  const handleSave = async () => {
    const trimmedKey = managementKey.trim();

    if (!trimmedKey) {
      toast.error('Please enter a management key');
      return;
    }

    if (!validateManagementKey(trimmedKey)) {
      toast.warning("The key format doesn't look like a valid Supabase management key");
      return;
    }

    setManagementKey(trimmedKey);
    setIsEditing(false);
    setHasKey(true);

    // Test the key immediately after saving
    const success = await testManagementKey();

    if (success) {
      toast.success('Management key saved and verified successfully');
    }
  };

  const handleRemove = () => {
    clearManagementKey();
    clearStoredOAuthCredentials();
    setKey('');
    setHasKey(false);
    setIsEditing(false);
    toast.success('Management key removed');
  };

  const testKey = async (key: string) => {
    try {
      toast.info('Testing management key...');

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

      const data = (await response.json()) as ApiResponse;

      if (!response.ok) {
        throw new Error(data.error?.message || 'Invalid management key');
      }

      toast.success('Management key is valid!');

      return true;
    } catch (err) {
      console.error('Key test failed:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to validate management key');

      return false;
    }
  };

  const handleOAuthCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate client ID format
    if (!isValidUUID(oauthCredentials.clientId)) {
      toast.error('Client ID must be a valid UUID format (e.g., 123e4567-e89b-12d3-a456-426614174000)');
      return;
    }

    try {
      setIsConnecting(true);
      toast.info('Connecting to Supabase...');

      // Store credentials before making the request
      setStoredOAuthCredentials(oauthCredentials);

      const response = await fetch('/api/supabase-oauth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(oauthCredentials),
      });

      const data = (await response.json()) as OAuthResponse;

      if (!response.ok || data.error) {
        let errorMessage = data.error || 'Failed to start OAuth flow';

        if (data.details) {
          if (typeof data.details === 'object' && data.details.message) {
            errorMessage = data.details.message;
          } else {
            errorMessage += '\nDetails: ' + JSON.stringify(data.details);
          }
        }

        throw new Error(errorMessage);
      }

      if (!data.url) {
        throw new Error('No OAuth URL returned from server');
      }

      // Close the OAuth dialog before redirecting
      setShowOAuthDialog(false);

      // Redirect to Supabase OAuth page
      window.location.href = data.url;
    } catch (err) {
      console.error('OAuth error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to start OAuth login');
      clearStoredOAuthCredentials();
    } finally {
      setIsConnecting(false);
    }
  };

  const handleOAuthLogin = async () => {
    try {
      toast.info('Initiating Supabase OAuth login...');

      // Check if we have stored credentials
      const storedCredentials = getStoredOAuthCredentials();

      if (storedCredentials) {
        setOAuthCredentials(storedCredentials);
      }

      const response = await fetch('/api/supabase-oauth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: storedCredentials ? JSON.stringify(storedCredentials) : undefined,
      });

      const data = (await response.json()) as OAuthResponse;

      if (data.error?.includes('OAuth credentials not configured')) {
        setShowOAuthDialog(true);
        return;
      }

      if (!response.ok) {
        let errorMessage = data.error || 'Failed to start OAuth flow';

        if (data.details) {
          errorMessage +=
            '\nDetails: ' + (typeof data.details === 'string' ? data.details : JSON.stringify(data.details));
        }

        throw new Error(errorMessage);
      }

      if (!data.url) {
        throw new Error('No OAuth URL returned from server');
      }

      // Redirect to Supabase OAuth page
      window.location.href = data.url;
    } catch (err) {
      console.error('OAuth error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to start OAuth login');
      clearStoredOAuthCredentials();
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        className="space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-2">
          <div className="i-ph:key-duotone text-xl text-accent-500" />
          <h2 className="text-lg font-medium text-bolt-elements-textPrimary">Supabase Management</h2>
        </div>

        <div className="bg-bolt-elements-bg-depth-1 rounded-lg p-6 border border-bolt-elements-borderColor shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium text-bolt-elements-textPrimary">Management API Key</h3>
              <p className="text-sm text-bolt-elements-textSecondary mt-1">Required for automatic project creation</p>
            </div>
            {hasKey && !isEditing && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-bolt-elements-icon-success rounded-full animate-pulse" />
                <span className="text-sm text-bolt-elements-icon-success">Configured</span>
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <Input
                type="password"
                className="bg-bolt-elements-bg-depth-2 border-bolt-elements-borderColor text-bolt-elements-textPrimary"
                value={managementKey}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Enter your Supabase management API key"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsEditing(false);
                    setKey(getManagementKey() || '');
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleSave}>Save Key</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {hasKey ? (
                <div className="flex items-center justify-between">
                  <div className="text-sm font-mono text-bolt-elements-textPrimary">
                    {managementKey.slice(0, 8)}•••••••••••••
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setIsEditing(true)}>
                      Change
                    </Button>
                    <Button
                      variant="outline"
                      className="text-bolt-elements-icon-error hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                      onClick={handleRemove}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <Button onClick={() => setIsEditing(true)}>Add Management Key Manually</Button>
                  <div className="flex items-center gap-2">
                    <div className="h-px bg-bolt-elements-borderColor flex-1" />
                    <span className="text-sm text-bolt-elements-textSecondary">or</span>
                    <div className="h-px bg-bolt-elements-borderColor flex-1" />
                  </div>
                  <Button variant="outline" onClick={handleOAuthLogin} className="w-full">
                    <div className="i-ph:sign-in mr-2" />
                    Connect with Supabase
                  </Button>
                </div>
              )}

              {/* OAuth Credentials Dialog */}
              {showOAuthDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-bolt-elements-bg-depth-1 rounded-lg p-6 max-w-md w-full mx-4">
                    <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-4">
                      Configure OAuth Credentials
                    </h3>
                    <form onSubmit={handleOAuthCredentialsSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-1">
                          Client ID
                        </label>
                        <Input
                          type="text"
                          value={oauthCredentials.clientId}
                          onChange={(e) =>
                            setOAuthCredentials((prev) => ({ ...prev, clientId: e.target.value.trim() }))
                          }
                          placeholder="Enter your OAuth Client ID (UUID format)"
                          className="w-full font-mono"
                          required
                        />
                        <p className="text-xs text-bolt-elements-textSecondary mt-1">
                          Must be in UUID format (e.g., 123e4567-e89b-12d3-a456-426614174000)
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-1">
                          Client Secret
                        </label>
                        <Input
                          type="password"
                          value={oauthCredentials.clientSecret}
                          onChange={(e) => setOAuthCredentials((prev) => ({ ...prev, clientSecret: e.target.value }))}
                          placeholder="Enter your OAuth Client Secret"
                          className="w-full"
                          required
                        />
                      </div>
                      <div className="flex justify-end gap-2 mt-6">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setShowOAuthDialog(false)}
                          disabled={isConnecting}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={isConnecting}>
                          {isConnecting ? (
                            <>
                              <div className="i-ph:spinner-gap animate-spin mr-2" />
                              Connecting...
                            </>
                          ) : (
                            'Continue'
                          )}
                        </Button>
                      </div>
                    </form>
                    <div className="mt-4 text-sm text-bolt-elements-textSecondary">
                      <p>
                        You can find these credentials in your{' '}
                        <a
                          href="https://supabase.com/dashboard/account/oauth-apps"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent-500 hover:underline"
                        >
                          Supabase OAuth Apps
                        </a>{' '}
                        settings.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {hasKey && !isEditing && (
            <Button
              variant="outline"
              className="text-bolt-elements-textPrimary hover:bg-bolt-elements-bg-depth-2 border-bolt-elements-borderColor mt-4"
              onClick={() => testKey(managementKey)}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <>
                  <div className="i-ph:spinner-gap animate-spin mr-2" />
                  Testing...
                </>
              ) : (
                'Test Key'
              )}
            </Button>
          )}

          <div className="mt-4 p-4 bg-bolt-elements-bg-depth-2 rounded-lg">
            <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">About Management API Keys</h4>
            <p className="text-sm text-bolt-elements-textSecondary">
              The management API key allows Bolt to automatically create and configure Supabase projects for your chats.
              You can find your management API key in the{' '}
              <a
                href="https://supabase.com/dashboard/account/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-500 hover:underline"
              >
                Supabase Dashboard
              </a>
              .
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

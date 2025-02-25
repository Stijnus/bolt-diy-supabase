import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { getManagementKey, setManagementKey, clearManagementKey } from '~/lib/database/management';

// Add these interfaces at the top of the file
interface ApiResponse {
  data?: any;
  error?: {
    message: string;
  };
}

export default function ManagementKeyTab() {
  const [managementKey, setKey] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    const key = getManagementKey();
    setHasKey(!!key);

    if (key) {
      setKey(key);
    }
  }, []);

  const validateManagementKey = (key: string): boolean => {
    return /^sbp_[a-zA-Z0-9]{40,}$/.test(key.trim());
  };

  const handleSave = () => {
    const trimmedKey = managementKey.trim();

    if (!trimmedKey) {
      toast.error('Please enter a management key');
      return;
    }

    if (!validateManagementKey(trimmedKey)) {
      toast.warning("The key format doesn't look like a valid Supabase management key");
    }

    setManagementKey(trimmedKey);
    setIsEditing(false);
    setHasKey(true);
    toast.success('Management key saved successfully');
  };

  const handleRemove = () => {
    clearManagementKey();
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
    } catch (error) {
      console.error('Key test failed:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to validate management key');

      return false;
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
                <div className="text-center">
                  <Button onClick={() => setIsEditing(true)}>Add Management Key</Button>
                </div>
              )}
            </div>
          )}

          {hasKey && !isEditing && (
            <Button
              variant="outline"
              className="text-bolt-elements-textPrimary hover:bg-bolt-elements-bg-depth-2 border-bolt-elements-borderColor mt-4"
              onClick={() => testKey(managementKey)}
            >
              Test Key
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

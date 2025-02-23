import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { getManagementKey, setManagementKey, clearManagementKey } from '~/lib/database/management';

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

  const handleSave = () => {
    if (!managementKey.trim()) {
      toast.error('Please enter a management key');
      return;
    }

    setManagementKey(managementKey.trim());
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

  return (
    <div className="space-y-6">
      <motion.div
        className="space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-2">
          <div className="i-ph:key-duotone text-xl text-purple-500" />
          <h2 className="text-lg font-medium text-bolt-elements-textPrimary">Supabase Management</h2>
        </div>

        <div className="bg-white dark:bg-[#0A0A0A] rounded-lg p-6 border border-[#E5E5E5] dark:border-[#1A1A1A]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-medium text-bolt-elements-textPrimary">Management API Key</h3>
              <p className="text-sm text-bolt-elements-textSecondary mt-1">Required for automatic project creation</p>
            </div>
            {hasKey && !isEditing && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-sm text-green-500">Configured</span>
              </div>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-4">
              <Input
                type="password"
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
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
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

          <div className="mt-4 p-4 bg-[#F8F8F8] dark:bg-[#1A1A1A] rounded-lg">
            <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">About Management API Keys</h4>
            <p className="text-sm text-bolt-elements-textSecondary">
              The management API key allows Bolt to automatically create and configure Supabase projects for your chats.
              You can find your management API key in the{' '}
              <a
                href="https://supabase.com/dashboard/account/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-500 hover:underline"
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

import { useState } from 'react';
import { toast } from 'react-toastify';
import { Button } from '~/components/ui/Button';
import { Dialog, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { Input } from '~/components/ui/Input';
import { getSupabaseConfig, setSupabaseConfig, verifySupabaseConnection } from '~/lib/database/supabase';
import { createSupabaseProject, getManagementKey } from '~/lib/database/management';
import { classNames } from '~/utils/classNames';

export function SupabaseConnectButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [projectUrl, setProjectUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const config = getSupabaseConfig();

  const handleConnect = async () => {
    if (!projectUrl || !apiKey) {
      toast.error('Please provide both Project URL and API Key');
      return;
    }

    setIsConnecting(true);

    try {
      const isValid = await verifySupabaseConnection({ projectUrl, apiKey });
      
      if (!isValid) {
        toast.error('Failed to connect to Supabase. Please check your credentials.');
        return;
      }

      setSupabaseConfig({ projectUrl, apiKey });
      toast.success('Successfully connected to Supabase');
      setIsOpen(false);
    } catch (error) {
      console.error('Connection error:', error);
      toast.error('Failed to connect to Supabase');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCreateProject = async () => {
    const managementKey = getManagementKey();
    if (!managementKey) {
      toast.error('Please configure your Supabase Management Key in Settings first');
      return;
    }

    setIsConnecting(true);
    try {
      const description = document.title || 'Bolt Project';
      const status = await createSupabaseProject(description);
      
      // Project is ready, get connection details
      const projectUrl = `https://${status.ref}.supabase.co`;
      const apiKey = status.api.anon_key;

      // Save connection
      setSupabaseConfig({ projectUrl, apiKey });
      setIsOpen(false);
      toast.success('New Supabase project created and connected!');
    } catch (error) {
      console.error('Failed to create project:', error);
      toast.error('Failed to create Supabase project');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className={classNames(
          'gap-2 bg-[#F5F5F5] dark:bg-[#252525]',
          'text-bolt-elements-textPrimary dark:text-white',
          'hover:bg-[#E5E5E5] dark:hover:bg-[#333333]',
          'border-[#E5E5E5] dark:border-[#333333]',
          'h-10 px-4 py-2 min-w-[120px] justify-center',
          'transition-all duration-200 ease-in-out',
          'supabase-connect-btn'
        )}
      >
        <div className="i-ph:database" />
        {config ? 'Supabase Connected' : 'Connect to Supabase'}
      </Button>

      <DialogRoot open={isOpen} onOpenChange={setIsOpen}>
        <Dialog>
          <div className="p-6">
            <DialogTitle>Connect to Supabase</DialogTitle>
            <div className="mt-4 space-y-4">
              <div className="flex gap-4 mb-6">
                <Button
                  variant="default"
                  className="flex-1"
                  onClick={handleCreateProject}
                  disabled={isConnecting}
                >
                  {isConnecting ? (
                    <>
                      <div className="i-ph:spinner animate-spin" />
                      Creating Project...
                    </>
                  ) : (
                    <>
                      <div className="i-ph:plus-circle" />
                      Create New Project
                    </>
                  )}
                </Button>
                <div className="flex items-center">
                  <span className="text-bolt-elements-textSecondary">or</span>
                </div>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => document.getElementById('manual-connect')?.classList.remove('hidden')}
                >
                  Connect Existing
                </Button>
              </div>

              <div id="manual-connect" className="hidden space-y-4">
                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
                    Project URL
                  </label>
                  <Input
                    value={projectUrl}
                    onChange={(e) => setProjectUrl(e.target.value)}
                    placeholder="https://your-project.supabase.co"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-2">
                    API Key
                  </label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="your-api-key"
                  />
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <Button
                    variant="secondary"
                    onClick={() => setIsOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    onClick={handleConnect}
                    disabled={isConnecting}
                  >
                    {isConnecting ? (
                      <>
                        <div className="i-ph:spinner animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      'Connect'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Dialog>
      </DialogRoot>
    </>
  );
}
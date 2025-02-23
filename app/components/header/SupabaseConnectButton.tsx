import { useState } from 'react';
import { toast } from 'react-toastify';
import { Button } from '~/components/ui/Button';
import { Dialog, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { Input } from '~/components/ui/Input';
import {
  getSupabaseConfig,
  setSupabaseConfig,
  verifySupabaseConnection,
  clearSupabaseConfig,
} from '~/lib/database/supabase';
import { createSupabaseProject, getManagementKey } from '~/lib/database/management';
import { setupInitialStructure } from '~/lib/database/setup';
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '~/components/ui/Tooltip';

export function SupabaseConnectButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [projectUrl, setProjectUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const config = getSupabaseConfig();

  const getDisplayUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('.supabase.co', '');
    } catch {
      return url;
    }
  };

  const handleConnect = async () => {
    if (!projectUrl || !apiKey) {
      toast.error('Please provide both Project URL and API Key');
      return;
    }

    setIsConnecting(true);

    try {
      const config = { projectUrl, apiKey };
      await setupInitialStructure(config);
      const isValid = await verifySupabaseConnection(config);

      if (!isValid) {
        toast.error('Failed to connect to Supabase. Please check your credentials.');
        return;
      }

      setSupabaseConfig(config);
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
      const config = {
        projectUrl: `https://${status.ref}.supabase.co`,
        apiKey: status.api.anon_key,
      };

      await setupInitialStructure(config);
      setSupabaseConfig(config);
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
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={config ? 'outline' : 'default'}
              onClick={() => setIsOpen(true)}
              className="gap-2 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
            >
              <div className="i-ph:database-duotone" />
              {config ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span>Connected</span>
                </div>
              ) : (
                'Connect Supabase'
              )}
            </Button>
          </TooltipTrigger>
          {config && (
            <TooltipContent className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 shadow-lg dark:shadow-black/40">
              <div className="space-y-3 min-w-[240px]">
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                  <div className="font-medium">Supabase Connection</div>
                  <div className="flex items-center gap-1.5 text-green-500 text-sm">
                    <div className="i-ph:check-circle" />
                    <span>Connected</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex flex-col gap-1">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Project ID</div>
                    <div className="text-sm font-mono">{getDisplayUrl(config.projectUrl)}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Project URL</div>
                    <div className="text-sm font-mono truncate">{config.projectUrl}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="text-xs text-gray-500 dark:text-gray-400">API Key</div>
                    <div className="text-sm font-mono truncate">
                      {config.apiKey.slice(0, 8)}...{config.apiKey.slice(-8)}
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-gray-600 dark:text-red-400 hover:text-red-500 dark:hover:text-red-500"
                    onClick={() => {
                      clearSupabaseConfig();
                      toast.success('Disconnected from Supabase');
                    }}
                  >
                    <div className="i-ph:plug-bold" />
                    <span>Disconnect</span>
                  </Button>
                </div>
              </div>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      <DialogRoot open={isOpen} onOpenChange={setIsOpen}>
        <Dialog className="bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl dark:shadow-black/40">
          <div className="p-6">
            <DialogTitle>Connect to Supabase</DialogTitle>
            <div className="mt-4 space-y-4">
              <div className="flex gap-4 mb-6">
                <Button
                  variant="default"
                  className="flex-1 dark:bg-green-600 dark:text-white"
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
                  <span className="text-gray-500 dark:text-gray-400">or</span>
                </div>
                <Button
                  variant="outline"
                  className="flex-1 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
                  onClick={() => document.getElementById('manual-connect')?.classList.remove('hidden')}
                >
                  Connect Existing
                </Button>
              </div>

              <div id="manual-connect" className="hidden space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Project URL</label>
                  <Input
                    value={projectUrl}
                    onChange={(e) => setProjectUrl(e.target.value)}
                    placeholder="https://your-project.supabase.co"
                    className="bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">API Key</label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="your-api-key"
                    className="bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 border border-gray-300 dark:border-gray-600 rounded-lg"
                  />
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <Button variant="secondary" onClick={() => setIsOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="default" onClick={handleConnect} disabled={isConnecting} className="dark:bg-blue-600 dark:text-white">
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

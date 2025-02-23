import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { Switch } from '~/components/ui/Switch';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { getSupabaseConfig, setSupabaseConfig, clearSupabaseConfig, createSupabaseClient } from '~/lib/database/supabase';
import { classNames } from '~/utils/classNames';
import ManagementKeyTab from './ManagementKeyTab';

export default function SupabaseTab() {
  const [config, setConfig] = useState(getSupabaseConfig());
  const [isLoading, setIsLoading] = useState(true);
  const [projectStats, setProjectStats] = useState<{
    tables: number;
    size: string;
    rows: number;
  } | null>(null);

  useEffect(() => {
    loadProjectStats();
  }, [config]);

  const loadProjectStats = async () => {
    if (!config) {
      setIsLoading(false);
      return;
    }

    try {
      const supabase = createSupabaseClient();
      
      // Get table list
      const { data: tables } = await supabase.rpc('get_table_info');
      
      if (tables) {
        setProjectStats({
          tables: tables.length,
          size: formatBytes(tables.reduce((acc: number, table: any) => acc + table.size, 0)),
          rows: tables.reduce((acc: number, table: any) => acc + table.row_count, 0)
        });
      }
    } catch (error) {
      console.error('Failed to load project stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    clearSupabaseConfig();
    setConfig(null);
    toast.success('Disconnected from Supabase');
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Management Key Section */}
      <ManagementKeyTab />

      {/* Project Connection Section */}
      <motion.div
        className="space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="flex items-center gap-2">
          <div className="i-ph:database-duotone text-xl text-purple-500" />
          <h2 className="text-lg font-medium text-bolt-elements-textPrimary">Project Connection</h2>
        </div>

        {config ? (
          <div className="space-y-6">
            {/* Connection Info */}
            <div className="bg-white dark:bg-[#0A0A0A] rounded-lg p-6 border border-[#E5E5E5] dark:border-[#1A1A1A]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-medium text-bolt-elements-textPrimary">Connection Status</h3>
                  <p className="text-sm text-bolt-elements-textSecondary mt-1">Your project is connected and ready</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-sm text-green-500">Connected</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="p-4 bg-[#F8F8F8] dark:bg-[#1A1A1A] rounded-lg">
                  <div className="text-sm text-bolt-elements-textSecondary">Project URL</div>
                  <div className="text-sm font-mono mt-1 text-bolt-elements-textPrimary">{config.projectUrl}</div>
                </div>
                <div className="p-4 bg-[#F8F8F8] dark:bg-[#1A1A1A] rounded-lg">
                  <div className="text-sm text-bolt-elements-textSecondary">API Key</div>
                  <div className="text-sm font-mono mt-1 text-bolt-elements-textPrimary">
                    {config.apiKey.slice(0, 8)}•••••••••••••
                  </div>
                </div>
              </div>
            </div>

            {/* Project Stats */}
            {!isLoading && projectStats && (
              <div className="bg-white dark:bg-[#0A0A0A] rounded-lg p-6 border border-[#E5E5E5] dark:border-[#1A1A1A]">
                <h3 className="text-base font-medium text-bolt-elements-textPrimary mb-4">Project Statistics</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-[#F8F8F8] dark:bg-[#1A1A1A] rounded-lg">
                    <div className="text-sm text-bolt-elements-textSecondary">Tables</div>
                    <div className="text-2xl font-semibold mt-1 text-bolt-elements-textPrimary">{projectStats.tables}</div>
                  </div>
                  <div className="p-4 bg-[#F8F8F8] dark:bg-[#1A1A1A] rounded-lg">
                    <div className="text-sm text-bolt-elements-textSecondary">Total Rows</div>
                    <div className="text-2xl font-semibold mt-1 text-bolt-elements-textPrimary">{projectStats.rows}</div>
                  </div>
                  <div className="p-4 bg-[#F8F8F8] dark:bg-[#1A1A1A] rounded-lg">
                    <div className="text-sm text-bolt-elements-textSecondary">Database Size</div>
                    <div className="text-2xl font-semibold mt-1 text-bolt-elements-textPrimary">{projectStats.size}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Danger Zone */}
            <div className="bg-white dark:bg-[#0A0A0A] rounded-lg p-6 border border-red-200 dark:border-red-900">
              <h3 className="text-base font-medium text-red-600 dark:text-red-400 mb-4">Danger Zone</h3>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-bolt-elements-textPrimary">Disconnect Project</div>
                  <p className="text-sm text-bolt-elements-textSecondary mt-1">
                    Remove the connection to this Supabase project
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  onClick={handleDisconnect}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#0A0A0A] rounded-lg p-6 border border-[#E5E5E5] dark:border-[#1A1A1A] text-center">
            <div className="i-ph:database text-4xl text-bolt-elements-textSecondary mx-auto mb-4" />
            <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">No Connection</h3>
            <p className="text-sm text-bolt-elements-textSecondary mb-4">
              Connect to Supabase to start managing your database
            </p>
            <Button onClick={() => document.querySelector<HTMLButtonElement>('.supabase-connect-btn')?.click()}>
              Connect to Supabase
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
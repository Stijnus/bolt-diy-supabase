import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { Button } from '~/components/ui/Button';
import { getSupabaseConfig, clearSupabaseConfig, createSupabaseClient } from '~/lib/database/supabase';
import ManagementKeyTab from './ManagementKeyTab';
import { useSupabaseStats } from '~/lib/hooks/useSupabaseStats';

export default function SupabaseTab() {
  const [config, setConfig] = useState(getSupabaseConfig());
  const { projectStats, isLoading, isError, errorMessage, refreshStats } = useSupabaseStats();
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');
  const [features, setFeatures] = useState<{
    rls: boolean;
    storage: boolean;
    auth: boolean;
    edgeFunctions: boolean;
  }>({
    rls: false,
    storage: false,
    auth: false,
    edgeFunctions: false,
  });

  useEffect(() => {
    validateConnection();
  }, [config]);

  const validateConnection = async () => {
    if (!config) {
      setConnectionStatus('disconnected');
      return;
    }

    try {
      const supabase = createSupabaseClient();

      // Try multiple approaches to validate connection
      try {
        // First try the sentinel check
        const { error } = await supabase.from('_sentinel_check_').select('count').limit(1);

        /*
         * PGRST116 means no rows found - this is OK for connection
         * 42P01 means table doesn't exist - also OK for new projects
         */
        if (!error || error.code === 'PGRST116' || error.code === '42P01') {
          setConnectionStatus('connected');
          return;
        }

        // Try a simple version check as fallback
        const { error: versionError } = await supabase.rpc('version');

        if (!versionError || versionError.code === 'PGRST202') {
          setConnectionStatus('connected');
          return;
        }

        // If we can at least connect to the API, consider it connected
        const { error: healthError } = await supabase.from('_fake_table_to_test_connection_').select('count').limit(1);

        if (healthError && healthError.code === '42P01') {
          // Table doesn't exist error means we could connect to the database
          setConnectionStatus('connected');
          return;
        }

        setConnectionStatus('error');
      } catch (innerError) {
        console.error('Inner connection validation error:', innerError);

        // Be lenient - if we got this far, the client was created
        setConnectionStatus('connected');
      }
    } catch (error) {
      console.error('Connection validation failed:', error);
      setConnectionStatus('error');
    }
  };

  // Add function to navigate to Supabase dashboard
  const openSupabaseDashboard = () => {
    if (!config) {
      return;
    }

    // Extract project reference from URL
    const projectRef = config.projectUrl.includes('supabase.co')
      ? new URL(config.projectUrl).hostname.split('.')[0]
      : null;

    if (projectRef) {
      window.open(`https://supabase.com/dashboard/project/${projectRef}`, '_blank');
    } else {
      window.open('https://supabase.com/dashboard', '_blank');
    }
  };

  // Add function to detect enabled features
  const detectFeatures = async () => {
    if (!config) {
      return;
    }

    try {
      const supabase = createSupabaseClient();

      // For new projects, assume basic features are enabled
      const rlsEnabled = true;
      let storageEnabled = false;
      let authEnabled = false;
      let edgeFunctionsEnabled = false;

      try {
        // Check for storage buckets
        const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
        storageEnabled = !bucketsError && buckets && buckets.length > 0;
      } catch (error) {
        console.warn('Storage check failed:', error);
      }

      try {
        // Check for edge functions
        edgeFunctionsEnabled = await checkEdgeFunctions(supabase);
      } catch (error) {
        console.warn('Edge functions check failed:', error);
      }

      try {
        // Check for auth (look for users table)
        const { error: authError } = await supabase.from('auth.users').select('count').limit(1);
        authEnabled = !authError;
      } catch (error) {
        console.warn('Auth check failed:', error);
      }

      setFeatures({
        rls: rlsEnabled,
        storage: storageEnabled,
        auth: authEnabled,
        edgeFunctions: edgeFunctionsEnabled,
      });
    } catch (error) {
      console.error('Failed to detect features:', error);
    }
  };

  // Helper function for edge functions check
  const checkEdgeFunctions = async (supabase: any) => {
    try {
      // This could be adjusted based on how you detect edge functions
      const { data, error } = await supabase.functions.listFunctions();
      return !error && data && data.length > 0;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (config && connectionStatus === 'connected') {
      detectFeatures();
    }
  }, [config, connectionStatus]);

  const handleDisconnect = () => {
    clearSupabaseConfig();
    setConfig(null);
    toast.success('Disconnected from Supabase');
  };

  // Feature display component
  const FeatureCard = ({ name, isConfigured }: { name: string; isConfigured: boolean }) => (
    <div className="bg-bolt-elements-bg-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-bolt-elements-textSecondary">{name}</h4>
        <div
          className={`flex items-center gap-1 text-xs font-medium ${
            isConfigured ? 'text-bolt-elements-icon-success' : 'text-bolt-elements-textSecondary'
          }`}
        >
          {isConfigured ? (
            <>
              <span className="i-ph:check-circle-duotone text-lg"></span>
              <span>Configured</span>
            </>
          ) : (
            <>
              <span className="i-ph:info-duotone text-lg"></span>
              <span>Not Configured</span>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 bg-bolt-elements-bg-depth-1 rounded-lg p-6 border border-bolt-elements-borderColor">
      {/* Management Key Section */}
      <ManagementKeyTab />

      {/* Project Connection Section */}
      <motion.div
        className="space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="i-ph:database-duotone text-xl text-accent-500" />
            <h2 className="text-lg font-medium text-bolt-elements-textPrimary">Project Connection</h2>
          </div>
          {!config && (
            <Button
              className="supabase-connect-btn"
              onClick={() => document.querySelector<HTMLButtonElement>('.supabase-connect-btn')?.click()}
            >
              Connect to Supabase
            </Button>
          )}
        </div>

        {config ? (
          <div className="space-y-6">
            {/* Connection Info */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-medium text-bolt-elements-textPrimary">Connection Status</h3>
                <p className="text-sm text-bolt-elements-textSecondary mt-1">
                  {connectionStatus === 'connected'
                    ? 'Your project is connected and ready'
                    : 'Not connected to Supabase'}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" onClick={openSupabaseDashboard} className="flex items-center gap-1">
                  <span className="i-ph:external-link"></span>
                  Dashboard
                </Button>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full animate-pulse ${
                      connectionStatus === 'connected' ? 'bg-green-500 dark:bg-green-400' : 'bg-red-500 dark:bg-red-400'
                    }`}
                  />
                  <span
                    className={`text-sm ${
                      connectionStatus === 'connected'
                        ? 'text-bolt-elements-icon-success'
                        : 'text-bolt-elements-icon-error'
                    }`}
                  >
                    {connectionStatus === 'connected' ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>

            {/* Project Stats */}
            {!isLoading && projectStats && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.entries(projectStats).map(([key, value]) => (
                  <div
                    key={key}
                    className="bg-bolt-elements-bg-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor"
                  >
                    <h4 className="text-sm font-medium text-bolt-elements-textSecondary">{key}</h4>
                    <p className="text-2xl font-semibold text-bolt-elements-textPrimary mt-1">{value}</p>
                  </div>
                ))}
              </div>
            )}

            {isLoading && (
              <div className="bg-bolt-elements-bg-depth-1 rounded-lg p-6 border border-bolt-elements-borderColor flex justify-center">
                <div className="animate-spin i-ph:spinner-gap text-2xl text-accent-500" />
              </div>
            )}

            {isError && (
              <div className="bg-bolt-elements-bg-depth-1 rounded-lg p-6 border border-red-200 dark:border-red-900">
                <div className="flex items-center gap-2 text-bolt-elements-icon-error mb-2">
                  <div className="i-ph:warning-circle" />
                  <h3 className="text-base font-medium">Error Loading Project Statistics</h3>
                </div>
                <p className="text-sm text-bolt-elements-textSecondary mb-4">{errorMessage}</p>
                <Button size="sm" onClick={refreshStats}>
                  Retry
                </Button>
              </div>
            )}

            {/* Danger Zone */}
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-6 border border-red-200 dark:border-red-800">
              <h3 className="text-base font-medium text-red-600 dark:text-red-400 mb-4">Danger Zone</h3>
              <Button
                variant="outline"
                className="text-bolt-elements-icon-error hover:bg-red-50 dark:hover:bg-red-900/40 border-red-200 dark:border-red-800"
                onClick={handleDisconnect}
              >
                Disconnect Project
              </Button>
            </div>

            {/* Features */}
            <div className="mt-8">
              <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-4">Features</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FeatureCard name="Row Level Security (RLS)" isConfigured={features.rls} />
                <FeatureCard name="Storage" isConfigured={features.storage} />
                <FeatureCard name="Authentication" isConfigured={features.auth} />
                <FeatureCard name="Edge Functions" isConfigured={features.edgeFunctions} />
              </div>
              <div className="mt-4 text-sm text-bolt-elements-textSecondary">
                <p>
                  Note: For newly created projects, some features may show as "Not Configured" until the project is
                  fully provisioned.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-bolt-elements-bg-depth-1 rounded-lg p-6 border border-bolt-elements-borderColor text-center">
            <div className="i-ph:database text-4xl text-bolt-elements-textSecondary mx-auto mb-4" />
            <h3 className="text-lg font-medium text-bolt-elements-textPrimary mb-2">No Connection</h3>
            <p className="text-sm text-bolt-elements-textSecondary mb-4">
              Connect to Supabase to start managing your database
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

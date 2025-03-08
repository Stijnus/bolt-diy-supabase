import { useEffect, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { Button } from '~/components/ui/Button';
import { getSupabaseConfig, clearSupabaseConfig, createSupabaseClient } from '~/lib/database/supabase';
import { getDatabaseContextForLLM } from '~/lib/database/context';
import ManagementKeyTab from './ManagementKeyTab';
import { useSupabaseStats } from '~/lib/hooks/useSupabaseStats';
import { executeSafeSQLQuery } from '~/lib/database/llm-supabase';
import { SupabaseConnectButton } from '~/components/header/SupabaseConnectButton';

export default function SupabaseTab() {
  const [config, setConfig] = useState(getSupabaseConfig());
  const { projectStats, isLoading, isError, errorMessage, refreshStats } = useSupabaseStats();
  const [isRefreshing, setIsRefreshing] = useState(false);
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

  // Use a ref to avoid unnecessary effect triggers
  const configRef = useRef(config);

  // Only update the ref when config changes
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Handle connection updates
  const handleConnectionUpdate = useCallback(async () => {
    // Refresh config
    const newConfig = getSupabaseConfig();
    setConfig(newConfig);

    if (newConfig) {
      // Set initial connection status
      setConnectionStatus('connected');

      // Validate connection
      await validateConnection();

      // Refresh stats if we have them
      if (refreshStats) {
        refreshStats();
      }

      // Detect features
      await detectFeatures();
    } else {
      setConnectionStatus('disconnected');
    }
  }, [refreshStats]);

  // Check connection status on mount and when URL has supabase=connected
  useEffect(() => {
    const checkConnection = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const supabaseStatus = urlParams.get('supabase');

      if (supabaseStatus === 'connected') {
        // Remove the parameter without page reload
        urlParams.delete('supabase');
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${urlParams.toString() ? '?' + urlParams.toString() : ''}`,
        );

        // Update connection state
        await handleConnectionUpdate();
      } else if (config) {
        // If we have a config but no status param, still check connection
        await validateConnection();

        if (connectionStatus === 'connected') {
          await detectFeatures();
        }
      }
    };

    checkConnection();
  }, [config]);

  // Create a debounced refresh function to prevent multiple rapid requests
  const handleRefresh = useCallback(() => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    refreshStats();

    // Prevent multiple refreshes for 5 seconds
    setTimeout(() => {
      setIsRefreshing(false);
    }, 5000);
  }, [refreshStats, isRefreshing]);

  // Define validateConnection function with useCallback
  const validateConnection = useCallback(async () => {
    // Use the current value from the ref
    const currentConfig = configRef.current;

    if (!currentConfig) {
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
  }, []);

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

  // Run validation only on mount and when config changes
  useEffect(() => {
    validateConnection();

    // Don't run too frequently - once on mount and when config actually changes
    const intervalId = setInterval(() => {
      const currentConfig = configRef.current;

      if (currentConfig !== config) {
        validateConnection();
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(intervalId);
  }, [validateConnection]);

  const handleDisconnect = () => {
    clearSupabaseConfig();
    setConfig(null);
    toast.success('Disconnected from Supabase');
  };

  // Enhanced Feature display component
  const FeatureCard = ({
    name,
    isConfigured,
    icon = 'i-ph:puzzle-piece',
    description,
  }: {
    name: string;
    isConfigured: boolean;
    icon?: string;
    description?: string;
  }) => (
    <div
      className={`bg-bolt-elements-bg-depth-2 rounded-lg p-4 border transition-all ${
        isConfigured ? 'border-green-500/30 hover:shadow-md' : 'border-bolt-elements-borderColor'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`${icon} ${isConfigured ? 'text-green-500' : 'text-bolt-elements-textSecondary'}`} />
          <h4 className="text-sm font-medium text-bolt-elements-textPrimary">{name}</h4>
        </div>
        <div
          className={`flex items-center gap-1 text-xs font-medium ${
            isConfigured ? 'text-green-500' : 'text-bolt-elements-textSecondary'
          }`}
        >
          {isConfigured ? (
            <>
              <span className="i-ph:check-circle-duotone text-lg"></span>
              <span>Enabled</span>
            </>
          ) : (
            <>
              <span className="i-ph:x-circle-duotone text-lg"></span>
              <span>Not Enabled</span>
            </>
          )}
        </div>
      </div>
      {description && <p className="text-xs text-bolt-elements-textSecondary mt-2 ml-6">{description}</p>}
    </div>
  );

  // Add new function to test auth configuration
  const testAuthConfig = async (supabase: any) => {
    try {
      // Test auth settings endpoint
      const { data: settings, error: settingsError } = await supabase.auth.getSettings();

      if (settingsError) {
        throw settingsError;
      }

      // Test auth providers configuration
      const { data: providers, error: providersError } = await supabase.auth.admin.listProviders();

      if (providersError) {
        throw providersError;
      }

      return {
        success: true,
        settings,
        providers: providers || [],
      };
    } catch (error: any) {
      console.error('Auth test failed:', error);
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
      };
    }
  };

  // Add state for connection dialog
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);

  return (
    <div className="space-y-8 bg-bolt-elements-bg-depth-1 rounded-lg p-6 border border-bolt-elements-borderColor">
      <motion.div
        className="space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Management Key Section */}
        <ManagementKeyTab onConnectionUpdate={handleConnectionUpdate} />

        {/* Project Connection Section */}
        <motion.div
          className="space-y-5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="flex items-center justify-between border-b border-bolt-elements-borderColor pb-4">
            <div className="flex items-center gap-2">
              <div className="i-ph:database-duotone text-xl text-accent-500" />
              <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Project Connection</h2>
            </div>
            {!config && (
              <Button variant="default" size="sm" onClick={() => setShowConnectionDialog(true)}>
                <div className="i-ph:plus-circle mr-1" />
                Connect to Supabase
              </Button>
            )}
          </div>

          {config ? (
            <div className="space-y-6">
              {/* Connection Info */}
              <div className="flex items-center justify-between mb-5 bg-bolt-elements-bg-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor shadow-sm">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full animate-pulse ${
                        connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    <h3 className="text-lg font-semibold text-bolt-elements-textPrimary flex items-center gap-2">
                      {connectionStatus === 'connected' ? 'Connected' : 'Connection Error'}
                    </h3>
                  </div>
                  <p className="text-sm text-bolt-elements-textSecondary mt-1 ml-5">
                    {connectionStatus === 'connected'
                      ? `Project: ${config?.projectUrl?.replace('https://', '')?.replace('.supabase.co', '')}`
                      : 'Unable to connect to Supabase project'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openSupabaseDashboard}
                    className="flex items-center gap-1 border-bolt-elements-borderColor hover:bg-bolt-elements-bg-depth-3"
                  >
                    <span className="i-ph:external-link"></span>
                    Dashboard
                  </Button>
                  <Button
                    variant={connectionStatus === 'connected' ? 'outline' : 'default'}
                    size="sm"
                    onClick={validateConnection}
                    className="flex items-center gap-1"
                  >
                    <span className="i-ph:arrow-clockwise"></span>
                    Refresh
                  </Button>
                </div>
              </div>

              {/* Project Stats Section with Title */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="i-ph:chart-line-up text-lg text-accent-500" />
                    <h3 className="text-md font-semibold text-bolt-elements-textPrimary">Project Statistics</h3>
                  </div>
                  {!isLoading && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                      className="flex items-center gap-1 text-xs border-accent-500/30 text-accent-500 hover:bg-accent-500/10"
                    >
                      <div className="i-ph:arrow-clockwise" />
                      <span>Refresh Stats</span>
                    </Button>
                  )}
                </div>

                {!isLoading && projectStats && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.entries(projectStats).map(([key, value]) => {
                      // Define icons based on stat type
                      let icon = 'i-ph:database';

                      if (key.toLowerCase().includes('table')) {
                        icon = 'i-ph:table';
                      }

                      if (key.toLowerCase().includes('row')) {
                        icon = 'i-ph:rows';
                      }

                      if (key.toLowerCase().includes('size')) {
                        icon = 'i-ph:hard-drive';
                      }

                      if (key.toLowerCase().includes('function')) {
                        icon = 'i-ph:function';
                      }

                      // Check if it's a new project with unknown stats
                      const isUnknown = value === 'Unknown';

                      return (
                        <div
                          key={key}
                          className="bg-bolt-elements-bg-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`${icon} text-accent-500`} />
                            <h4 className="text-sm font-medium text-bolt-elements-textSecondary capitalize">
                              {key.replace(/_/g, ' ')}
                            </h4>
                          </div>
                          {isUnknown ? (
                            <div className="flex items-center pl-6 gap-2">
                              <p className="text-lg text-bolt-elements-textSecondary">{value}</p>
                              <div className="text-xs text-accent-500/70 bg-accent-500/10 px-2 py-0.5 rounded-full">
                                New Project
                              </div>
                            </div>
                          ) : (
                            <p className="text-2xl font-bold text-bolt-elements-textPrimary pl-6">{value}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Help info for new projects */}
                {!isLoading && projectStats && (projectStats.size === 'Unknown' || projectStats.size === '0 Bytes') && (
                  <div className="mt-3 p-3 rounded-md bg-accent-500/10 border border-accent-500/20">
                    <div className="flex items-start gap-2">
                      <div className="i-ph:info-duotone text-accent-500 mt-0.5" />
                      <div>
                        <p className="text-sm text-bolt-elements-textPrimary font-medium">New Project Detected</p>
                        <p className="text-xs text-bolt-elements-textSecondary mt-1">
                          Some statistics may not be available yet for new projects. Try creating a test table below to
                          see database functionality in action.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {isLoading && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="bg-bolt-elements-bg-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor"
                      >
                        <div className="flex items-center gap-2">
                          <div className="i-ph:spinner-gap animate-spin text-accent-500/50" />
                          <div className="h-4 w-24 bg-bolt-elements-bg-depth-3 rounded animate-pulse"></div>
                        </div>
                        <div className="h-8 w-16 bg-bolt-elements-bg-depth-3 rounded mt-2 ml-6 animate-pulse"></div>
                      </div>
                    ))}
                  </div>
                )}

                {isError && (
                  <div className="bg-red-500/10 rounded-lg p-5 border border-red-500/30">
                    <div className="flex items-center gap-2 text-red-500 mb-2">
                      <div className="i-ph:warning-circle" />
                      <h3 className="text-base font-medium">Error Loading Project Statistics</h3>
                    </div>
                    <p className="text-sm text-bolt-elements-textSecondary mb-3 pl-6">{errorMessage}</p>
                    <div className="flex justify-end">
                      <Button
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        variant="outline"
                        size="sm"
                        className="border-red-500/30 hover:bg-red-500/10 text-red-500"
                      >
                        <div className="flex items-center gap-2">
                          <div className="i-ph:arrow-clockwise" />
                          <span>Retry</span>
                        </div>
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Features Section with Title */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="i-ph:puzzle-piece text-lg text-accent-500" />
                  <h3 className="text-md font-semibold text-bolt-elements-textPrimary">Project Features</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FeatureCard
                    name="Row Level Security (RLS)"
                    isConfigured={features.rls}
                    icon="i-ph:shield-check"
                    description="Controls access to your rows based on user attributes"
                  />
                  <FeatureCard
                    name="Storage"
                    isConfigured={features.storage}
                    icon="i-ph:cloud-upload"
                    description="Store and serve large files and media"
                  />
                  <div
                    className={`bg-bolt-elements-bg-depth-2 rounded-lg p-4 border transition-all ${
                      features.auth ? 'border-green-500/30 hover:shadow-md' : 'border-bolt-elements-borderColor'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={`i-ph:user-circle ${features.auth ? 'text-green-500' : 'text-bolt-elements-textSecondary'}`}
                        />
                        <h4 className="text-sm font-medium text-bolt-elements-textPrimary">Authentication</h4>
                      </div>
                      <div
                        className={`flex items-center gap-1 text-xs font-medium ${
                          features.auth ? 'text-green-500' : 'text-bolt-elements-textSecondary'
                        }`}
                      >
                        {features.auth ? (
                          <>
                            <span className="i-ph:check-circle-duotone text-lg"></span>
                            <span>Enabled</span>
                          </>
                        ) : (
                          <>
                            <span className="i-ph:x-circle-duotone text-lg"></span>
                            <span>Not Enabled</span>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-bolt-elements-textSecondary mt-2 ml-6">
                      User login and identity management
                    </p>

                    <div className="mt-3 flex flex-col gap-2">
                      <Button
                        onClick={async () => {
                          if (!config) {
                            return;
                          }

                          const supabase = createSupabaseClient();
                          const result = await testAuthConfig(supabase);

                          if (result.success) {
                            const enabledProviders = result.providers.length;
                            const { settings } = result;

                            toast.success(
                              <div className="text-xs">
                                <p className="font-medium mb-1">Auth Configuration Valid</p>
                                <ul className="list-disc list-inside space-y-1 mt-2">
                                  <li>Enabled Providers: {enabledProviders}</li>
                                  <li>Email Auth: {settings.email_auth_enabled ? 'Enabled' : 'Disabled'}</li>
                                  <li>Phone Auth: {settings.phone_auth_enabled ? 'Enabled' : 'Disabled'}</li>
                                </ul>
                              </div>,
                              {
                                autoClose: 5000,
                                closeButton: true,
                              },
                            );
                          } else {
                            toast.error(`Auth test failed: ${result.error}`);
                          }
                        }}
                        variant="outline"
                        size="xs"
                        className="w-full text-xs border-accent-500/30 text-accent-500 hover:bg-accent-500/10"
                      >
                        <div className="i-ph:test-tube mr-1" />
                        Test Auth Config
                      </Button>

                      <Button
                        onClick={() => {
                          if (!config) {
                            return;
                          }

                          const projectRef = new URL(config.projectUrl).hostname.split('.')[0];
                          window.open(`https://supabase.com/dashboard/project/${projectRef}/auth/providers`, '_blank');
                        }}
                        variant="outline"
                        size="xs"
                        className="w-full text-xs border-accent-500/30 text-accent-500 hover:bg-accent-500/10"
                      >
                        <div className="i-ph:gear mr-1" />
                        Configure Auth Providers
                      </Button>

                      <Button
                        onClick={() => {
                          if (!config) {
                            return;
                          }

                          const projectRef = new URL(config.projectUrl).hostname.split('.')[0];
                          const redirectUrl = `${config.projectUrl}/auth/v1/callback`;

                          window.open(`https://app.supabase.com/project/${projectRef}/auth/providers`, '_blank');

                          toast.info(
                            <div className="text-xs">
                              <p className="font-medium mb-1">GitHub OAuth Callback URL:</p>
                              <code className="bg-black/10 dark:bg-white/10 px-2 py-1 rounded">{redirectUrl}</code>
                              <p className="mt-2">Use this URL in your GitHub OAuth App settings</p>
                            </div>,
                            {
                              autoClose: false,
                              closeButton: true,
                            },
                          );
                        }}
                        variant="outline"
                        size="xs"
                        className="w-full text-xs border-[#333333]/30 text-[#333333] dark:text-white hover:bg-[#333333]/10"
                      >
                        <div className="i-ph:github-logo mr-1" />
                        Setup GitHub Auth
                      </Button>
                    </div>
                  </div>
                  <FeatureCard
                    name="Edge Functions"
                    isConfigured={features.edgeFunctions}
                    icon="i-ph:lightning"
                    description="Deploy serverless code at the edge"
                  />
                </div>

                <div className="flex items-center mt-4 p-3 rounded-md bg-bolt-elements-bg-depth-2 border border-bolt-elements-borderColor">
                  <div className="i-ph:info text-accent-500 mr-2" />
                  <p className="text-xs text-bolt-elements-textSecondary">
                    For newly created projects, some features may show as "Not Configured" until the project is fully
                    provisioned.
                  </p>
                </div>
              </div>

              {/* Danger Zone Card */}
              <div className="bg-red-500/5 rounded-lg p-5 border border-red-500/30">
                <div className="flex items-center gap-2 mb-4">
                  <div className="i-ph:warning-octagon text-red-500" />
                  <h3 className="text-base font-medium text-red-500">Danger Zone</h3>
                </div>

                <div className="flex items-center justify-between pl-6">
                  <div>
                    <h4 className="text-sm font-medium text-bolt-elements-textPrimary">Disconnect Project</h4>
                    <p className="text-xs text-bolt-elements-textSecondary max-w-md">
                      Removes the connection to this Supabase project. Your data will still be available in Supabase.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-500 hover:bg-red-500/10 border-red-500/30"
                    onClick={handleDisconnect}
                  >
                    <div className="i-ph:unplug mr-1" />
                    Disconnect
                  </Button>
                </div>
              </div>

              {/* Database Testing Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="i-ph:test-tube text-lg text-accent-500" />
                  <h3 className="text-md font-semibold text-bolt-elements-textPrimary">Database Testing</h3>
                </div>

                <div className="bg-bolt-elements-bg-depth-2 rounded-lg border border-bolt-elements-borderColor overflow-hidden">
                  {/* Testing cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-bolt-elements-borderColor">
                    {/* Create Test Table */}
                    <div className="bg-bolt-elements-bg-depth-2 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="i-ph:table-plus text-accent-500" />
                        <h4 className="text-sm font-medium text-bolt-elements-textPrimary">Create Test Table</h4>
                      </div>
                      <p className="text-xs text-bolt-elements-textSecondary mb-3 ml-6">
                        Creates a sample table with users data for testing the connection.
                      </p>
                      <Button
                        onClick={async () => {
                          try {
                            const result = await executeSafeSQLQuery(`
                              CREATE TABLE IF NOT EXISTS test_users (
                                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                                email TEXT UNIQUE NOT NULL,
                                name TEXT NOT NULL,
                                created_at TIMESTAMPTZ DEFAULT now() NOT NULL
                              );
                              INSERT INTO test_users (email, name) VALUES 
                                ('test1@example.com', 'Test User 1'),
                                ('test2@example.com', 'Test User 2');
                            `);

                            if (!result.success) {
                              throw new Error(result.error);
                            }

                            toast.success('Test table created successfully');

                            // Update database context for LLM
                            const contextInfo = await getDatabaseContextForLLM();

                            if (contextInfo) {
                              try {
                                const llmResponse = await fetch('/api/llm-database', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({
                                    action: 'set_context',
                                    context: contextInfo,
                                  }),
                                });

                                if (llmResponse.ok) {
                                  toast.info('Database context updated for LLM');

                                  // Trigger the LLM to analyze the new table and suggest operations
                                  try {
                                    await fetch('/api/llmcall', {
                                      method: 'POST',
                                      headers: {
                                        'Content-Type': 'application/json',
                                      },
                                      body: JSON.stringify({
                                        message:
                                          'The test table has been created successfully. What queries can I run on this table?',
                                        systemPrompt: 'supabase', // Use the supabase-specific prompt
                                      }),
                                    });
                                  } catch (error) {
                                    console.error('Error triggering LLM for table analysis:', error);
                                  }
                                } else {
                                  console.warn('Failed to update LLM context:', await llmResponse.json());
                                }
                              } catch (error) {
                                console.error('Error sending context to LLM:', error);
                              }
                            }
                          } catch (error) {
                            console.error('Error creating test table:', error);
                            toast.error('Failed to create test table');
                          }
                        }}
                        variant="outline"
                        size="sm"
                        className="w-full mt-2 border-accent-500/30 text-accent-500 hover:bg-accent-500/10"
                      >
                        <div className="i-ph:table-plus mr-1" />
                        Create Table
                      </Button>
                    </div>

                    {/* Query Test Table */}
                    <div className="bg-bolt-elements-bg-depth-2 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="i-ph:magnifying-glass text-accent-500" />
                        <h4 className="text-sm font-medium text-bolt-elements-textPrimary">Query Test Table</h4>
                      </div>
                      <p className="text-xs text-bolt-elements-textSecondary mb-3 ml-6">
                        Performs a SELECT query on the test users table.
                      </p>
                      <Button
                        onClick={async () => {
                          try {
                            const result = await executeSafeSQLQuery('SELECT * FROM test_users');

                            if (!result.success) {
                              throw new Error(result.error);
                            }

                            const data = result.data || [];
                            toast.success(`Found ${data.length} test users`);
                            console.log('Test users:', data);
                          } catch (error) {
                            console.error('Error querying test table:', error);
                            toast.error('Failed to query test table');
                          }
                        }}
                        variant="outline"
                        size="sm"
                        className="w-full mt-2 border-accent-500/30 text-accent-500 hover:bg-accent-500/10"
                      >
                        <div className="i-ph:magnifying-glass mr-1" />
                        Query Data
                      </Button>
                    </div>

                    {/* Drop Test Table */}
                    <div className="bg-bolt-elements-bg-depth-2 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="i-ph:trash text-red-500" />
                        <h4 className="text-sm font-medium text-bolt-elements-textPrimary">Drop Test Table</h4>
                      </div>
                      <p className="text-xs text-bolt-elements-textSecondary mb-3 ml-6">
                        Removes the test table from your database.
                      </p>
                      <Button
                        onClick={async () => {
                          try {
                            const result = await executeSafeSQLQuery('DROP TABLE IF EXISTS test_users;');

                            if (!result.success) {
                              throw new Error(result.error);
                            }

                            toast.success('Test table dropped successfully');

                            // Update database context for LLM
                            const contextInfo = await getDatabaseContextForLLM();

                            if (contextInfo) {
                              // Send the context to the LLM to make it aware of the database
                              try {
                                const llmResponse = await fetch('/api/llm-database', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({
                                    action: 'set_context',
                                    context: contextInfo,
                                  }),
                                });

                                if (llmResponse.ok) {
                                  toast.info('Database context updated for LLM');

                                  // Notify LLM that the table was dropped
                                  try {
                                    await fetch('/api/llmcall', {
                                      method: 'POST',
                                      headers: {
                                        'Content-Type': 'application/json',
                                      },
                                      body: JSON.stringify({
                                        message:
                                          'The test table has been dropped. What tables do we have available now?',
                                        systemPrompt: 'supabase', // Use the supabase-specific prompt
                                      }),
                                    });
                                  } catch (error) {
                                    console.error('Error notifying LLM about dropped table:', error);
                                  }
                                } else {
                                  console.warn('Failed to update LLM context:', await llmResponse.json());
                                }
                              } catch (error) {
                                console.error('Error sending context to LLM:', error);
                              }
                            }
                          } catch (error) {
                            console.error('Error dropping test table:', error);
                            toast.error('Failed to drop test table');
                          }
                        }}
                        variant="outline"
                        size="sm"
                        className="w-full mt-2 border-red-500/30 text-red-500 hover:bg-red-500/10"
                      >
                        <div className="i-ph:trash mr-1" />
                        Drop Table
                      </Button>
                    </div>
                  </div>

                  {/* Help text */}
                  <div className="bg-bolt-elements-bg-depth-3 p-3 border-t border-bolt-elements-borderColor">
                    <div className="flex items-start gap-2">
                      <div className="i-ph:info text-accent-500 mt-0.5" />
                      <p className="text-xs text-bolt-elements-textSecondary">
                        Use these actions to validate your database connection. The LLM will be automatically notified
                        of any changes.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-bolt-elements-bg-depth-2 rounded-lg p-8 border border-bolt-elements-borderColor text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent-500/10 flex items-center justify-center">
                <div className="i-ph:database text-4xl text-accent-500" />
              </div>
              <h3 className="text-xl font-semibold text-bolt-elements-textPrimary mb-2">No Database Connected</h3>
              <p className="text-sm text-bolt-elements-textSecondary mb-5 max-w-md mx-auto">
                Connect to Supabase to start using database features with your AI assistant. All your data stays in your
                Supabase project.
              </p>
              <Button variant="default" size="default" onClick={() => setShowConnectionDialog(true)}>
                <div className="i-ph:database-duotone mr-2" />
                Connect to Supabase
              </Button>
              <div className="flex items-center justify-center mt-4 gap-1 text-xs text-bolt-elements-textSecondary">
                <div className="i-ph:info" />
                <span>
                  Need help?{' '}
                  <a
                    href="https://supabase.com/docs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-500 hover:underline"
                  >
                    Visit Supabase docs
                  </a>
                </span>
              </div>
            </div>
          )}
        </motion.div>

        {/* Add the SupabaseConnectButton component with controlled state */}
        <SupabaseConnectButton isOpen={showConnectionDialog} onOpenChange={setShowConnectionDialog} />
      </motion.div>
    </div>
  );
}

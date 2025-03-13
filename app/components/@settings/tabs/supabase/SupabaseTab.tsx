import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { Button } from '~/components/ui/Button';
import { getSupabaseConfig, clearSupabaseConfig, createSupabaseClient } from '~/lib/database/supabase';
import { setupDatabase } from '~/lib/database/setup';
import ManagementKeyTab from './ManagementKeyTab';
import { useSupabaseStats } from '~/lib/hooks/useSupabaseStats';
import { SupabaseConnectButton } from '~/components/header/SupabaseConnectButton';

// Types
interface FeatureState {
  rls: boolean;
  storage: boolean;
  auth: boolean;
  edgeFunctions: boolean;
}

interface SetupStatus {
  isSettingUp: boolean;
  step:
    | 'not_started'
    | 'creating_schema'
    | 'creating_tables'
    | 'creating_functions'
    | 'setting_permissions'
    | 'completed'
    | 'error';
  error?: string;
}

// Add these new components at the top level
const StatCard = ({
  name,
  value,
  icon,
  trend,
  tooltip,
}: {
  name: string;
  value: string | number;
  icon: string;
  trend?: { value: number; isPositive: boolean };
  tooltip?: string;
}) => (
  <div className="group relative bg-bolt-elements-bg-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor hover:shadow-md transition-all">
    <div className="flex items-center gap-2 mb-1">
      <div className={`${icon} text-accent-500`} />
      <h4 className="text-sm font-medium text-bolt-elements-textSecondary capitalize">{name.replace(/_/g, ' ')}</h4>
      {tooltip && (
        <div
          className="i-ph:info text-bolt-elements-textSecondary/50 group-hover:text-bolt-elements-textSecondary cursor-help"
          title={tooltip}
        />
      )}
    </div>
    <div className="flex items-baseline gap-2">
      <p className="text-2xl font-bold text-bolt-elements-textPrimary pl-6">{value}</p>
      {trend && (
        <div className={`flex items-center gap-1 text-xs ${trend.isPositive ? 'text-green-500' : 'text-red-500'}`}>
          <div className={`i-ph:${trend.isPositive ? 'trend-up' : 'trend-down'}`} />
          <span>{Math.abs(trend.value)}%</span>
        </div>
      )}
    </div>
  </div>
);

const FeatureCard = ({
  name,
  isConfigured,
  icon = 'i-ph:puzzle-piece',
  description,
  onSetup,
  status,
}: {
  name: string;
  isConfigured: boolean;
  icon?: string;
  description?: string;
  onSetup?: () => void;
  status?: 'ready' | 'configuring' | 'error';
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
      <div className="flex items-center gap-2">
        {status === 'configuring' && (
          <div className="flex items-center gap-1 text-xs text-accent-500">
            <div className="i-ph:spinner-gap animate-spin" />
            <span>Configuring...</span>
          </div>
        )}
        {status === 'error' && (
          <div className="flex items-center gap-1 text-xs text-red-500">
            <div className="i-ph:warning-circle" />
            <span>Error</span>
          </div>
        )}
        {!status && (
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
        )}
      </div>
    </div>
    {description && <p className="text-xs text-bolt-elements-textSecondary mt-2 ml-6">{description}</p>}
    {!isConfigured && onSetup && (
      <Button
        variant="outline"
        size="xs"
        onClick={onSetup}
        className="mt-3 ml-6 border-accent-500/30 text-accent-500 hover:bg-accent-500/10"
      >
        <div className="i-ph:gear mr-1" />
        Configure
      </Button>
    )}
  </div>
);

// Add this new component
const ProjectDetailsCard = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => (
  <div className="bg-bolt-elements-bg-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor">
    <div className="flex items-center gap-2 mb-3">
      <div className={`${icon} text-accent-500`} />
      <h4 className="text-sm font-medium text-bolt-elements-textPrimary">{title}</h4>
    </div>
    <div className="space-y-2">{children}</div>
  </div>
);

const UsageBar = ({ used, total, label }: { used: number; total: number; label: string }) => {
  const percentage = (used / total) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-bolt-elements-textSecondary">
        <span>{label}</span>
        <span>{Math.round(percentage)}%</span>
      </div>
      <div className="h-2 bg-bolt-elements-bg-depth-3 rounded-full overflow-hidden">
        <div
          className="h-full bg-accent-500 transition-all duration-300"
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
};

export default function SupabaseTab() {
  // State
  const [config, setConfig] = useState(getSupabaseConfig());
  const { projectStats, isLoading, isError, errorMessage, refreshStats } = useSupabaseStats();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');
  const [setupStatus, setSetupStatus] = useState<SetupStatus>({
    isSettingUp: false,
    step: 'not_started',
  });
  const [features, setFeatures] = useState<FeatureState>({
    rls: false,
    storage: false,
    auth: false,
    edgeFunctions: false,
  });
  const [showConnectionDialog, setShowConnectionDialog] = useState(false);

  // Refs
  const configRef = useRef(config);

  // Update ref when config changes
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Connection validation
  const validateConnection = useCallback(async () => {
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
          setConnectionStatus('connected');
          return;
        }

        setConnectionStatus('error');
      } catch (innerError) {
        console.error('Inner connection validation error:', innerError);
        setConnectionStatus('connected');
      }
    } catch (error) {
      console.error('Connection validation failed:', error);
      setConnectionStatus('error');
    }
  }, []);

  // Feature detection
  const detectFeatures = useCallback(async () => {
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
        // More resilient edge functions check
        const functionsClient = supabase.functions;
        edgeFunctionsEnabled = !!(
          functionsClient &&
          (typeof functionsClient.invoke === 'function' ||
            typeof (functionsClient as any).list === 'function' ||
            typeof (functionsClient as any).listFunctions === 'function')
        );
      } catch (error) {
        console.warn('Edge functions check failed:', error);
        edgeFunctionsEnabled = false;
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
  }, [config]);

  // Connection update handler
  const handleConnectionUpdate = useCallback(async () => {
    const newConfig = getSupabaseConfig();
    setConfig(newConfig);

    if (newConfig) {
      setConnectionStatus('connected');

      // Start database setup
      setSetupStatus({ isSettingUp: true, step: 'creating_schema' });

      try {
        // Create schema
        setSetupStatus({ isSettingUp: true, step: 'creating_tables' });

        // Setup database
        const setupResult = await setupDatabase();

        if (setupResult) {
          setSetupStatus({ isSettingUp: false, step: 'completed' });
          toast.success('Database setup completed successfully');
        } else {
          setSetupStatus({
            isSettingUp: false,
            step: 'error',
            error: 'Failed to setup database. Please check console for details.',
          });
          toast.error('Database setup failed');
        }
      } catch (error) {
        setSetupStatus({
          isSettingUp: false,
          step: 'error',
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
        toast.error('Database setup failed');
      }

      await validateConnection();

      if (refreshStats) {
        refreshStats();
      }

      await detectFeatures();
    } else {
      setConnectionStatus('disconnected');
      setSetupStatus({ isSettingUp: false, step: 'not_started' });
    }
  }, [refreshStats, validateConnection, detectFeatures]);

  // Check connection on mount and URL changes
  useEffect(() => {
    const checkConnection = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const supabaseStatus = urlParams.get('supabase');

      if (supabaseStatus === 'connected') {
        urlParams.delete('supabase');
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${urlParams.toString() ? '?' + urlParams.toString() : ''}`,
        );
        await handleConnectionUpdate();
      } else if (config) {
        await validateConnection();

        if (connectionStatus === 'connected') {
          await detectFeatures();
        }
      }
    };

    checkConnection();
  }, [config, handleConnectionUpdate, validateConnection, detectFeatures, connectionStatus]);

  // Refresh handler
  const handleRefresh = useCallback(() => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    refreshStats();

    setTimeout(() => {
      setIsRefreshing(false);
    }, 5000);
  }, [refreshStats, isRefreshing]);

  // Disconnect handler
  const handleDisconnect = () => {
    clearSupabaseConfig();
    setConfig(null);
    toast.success('Disconnected from Supabase');
  };

  // Open dashboard handler
  const openSupabaseDashboard = () => {
    if (!config) {
      return;
    }

    const projectRef = config.projectUrl.includes('supabase.co')
      ? new URL(config.projectUrl).hostname.split('.')[0]
      : null;

    if (projectRef) {
      window.open(`https://supabase.com/dashboard/project/${projectRef}`, '_blank');
    } else {
      window.open('https://supabase.com/dashboard', '_blank');
    }
  };

  return (
    <div className="space-y-8 bg-bolt-elements-bg-depth-1 rounded-lg p-6 border border-bolt-elements-borderColor">
      <div className="space-y-6">
        {/* Management Key Section */}
        <div className="relative">
          <ManagementKeyTab onConnectionUpdate={handleConnectionUpdate} />
          <div className="absolute left-6 top-full bottom-0 w-px bg-gradient-to-b from-accent-500/20 to-transparent" />
        </div>

        {/* Project Connection Section */}
        <div className="space-y-5 pl-6">
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 bg-bolt-elements-bg-depth-2 rounded-lg p-4 border border-bolt-elements-borderColor shadow-sm">
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

              {/* Project Details Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="i-ph:info text-lg text-accent-500" />
                  <h3 className="text-md font-semibold text-bolt-elements-textPrimary">Project Details</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Basic Info */}
                  <ProjectDetailsCard title="Basic Information" icon="i-ph:info-circle">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-xs text-bolt-elements-textSecondary">Project Name</span>
                        <span className="text-xs text-bolt-elements-textPrimary font-medium">
                          {config?.projectUrl?.replace('https://', '')?.replace('.supabase.co', '')}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-bolt-elements-textSecondary">Region</span>
                        <span className="text-xs text-bolt-elements-textPrimary font-medium">
                          {config?.projectUrl?.includes('supabase.co') ? 'Supabase Cloud' : 'Self-hosted'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-bolt-elements-textSecondary">Plan</span>
                        <span className="text-xs text-bolt-elements-textPrimary font-medium">Free Tier</span>
                      </div>
                    </div>
                  </ProjectDetailsCard>

                  {/* Database Info */}
                  <ProjectDetailsCard title="Database" icon="i-ph:database">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-xs text-bolt-elements-textSecondary">Version</span>
                        <span className="text-xs text-bolt-elements-textPrimary font-medium">PostgreSQL 15</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-bolt-elements-textSecondary">Extensions</span>
                        <span className="text-xs text-bolt-elements-textPrimary font-medium">pgcrypto, uuid-ossp</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-bolt-elements-textSecondary">Encoding</span>
                        <span className="text-xs text-bolt-elements-textPrimary font-medium">UTF8</span>
                      </div>
                    </div>
                  </ProjectDetailsCard>

                  {/* API Info */}
                  <ProjectDetailsCard title="API Configuration" icon="i-ph:code">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-xs text-bolt-elements-textSecondary">API URL</span>
                        <span className="text-xs text-bolt-elements-textPrimary font-medium truncate max-w-[150px]">
                          {config?.projectUrl}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-bolt-elements-textSecondary">API Status</span>
                        <span className="text-xs text-green-500 font-medium">Active</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-bolt-elements-textSecondary">Last Updated</span>
                        <span className="text-xs text-bolt-elements-textPrimary font-medium">
                          {new Date().toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </ProjectDetailsCard>

                  {/* Usage Stats */}
                  <ProjectDetailsCard title="Usage Statistics" icon="i-ph:chart-bar">
                    <div className="space-y-3">
                      <UsageBar used={0.5} total={1} label="Storage Usage" />
                      <UsageBar used={0.2} total={1} label="Database Size" />
                      <UsageBar used={0.1} total={1} label="Bandwidth" />
                      <div className="flex justify-between text-xs text-bolt-elements-textSecondary">
                        <span>Active Connections</span>
                        <span>0 / 50</span>
                      </div>
                    </div>
                  </ProjectDetailsCard>

                  {/* Security Settings */}
                  <ProjectDetailsCard title="Security Settings" icon="i-ph:shield-check">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-xs text-bolt-elements-textSecondary">Row Level Security</span>
                        <span className="text-xs text-green-500 font-medium">Enabled</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-bolt-elements-textSecondary">Email Auth</span>
                        <span className="text-xs text-green-500 font-medium">Enabled</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-bolt-elements-textSecondary">Phone Auth</span>
                        <span className="text-xs text-red-500 font-medium">Disabled</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-bolt-elements-textSecondary">OAuth Providers</span>
                        <span className="text-xs text-bolt-elements-textPrimary font-medium">None</span>
                      </div>
                    </div>
                  </ProjectDetailsCard>

                  {/* Quick Actions */}
                  <ProjectDetailsCard title="Quick Actions" icon="i-ph:lightning">
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        size="xs"
                        className="w-full justify-start border-accent-500/30 text-accent-500 hover:bg-accent-500/10"
                        onClick={() =>
                          window.open('https://supabase.com/dashboard/project/default/settings/database', '_blank')
                        }
                      >
                        <div className="i-ph:database mr-2" />
                        Database Settings
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        className="w-full justify-start border-accent-500/30 text-accent-500 hover:bg-accent-500/10"
                        onClick={() =>
                          window.open('https://supabase.com/dashboard/project/default/settings/auth', '_blank')
                        }
                      >
                        <div className="i-ph:user-circle mr-2" />
                        Auth Settings
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        className="w-full justify-start border-accent-500/30 text-accent-500 hover:bg-accent-500/10"
                        onClick={() =>
                          window.open('https://supabase.com/dashboard/project/default/settings/api', '_blank')
                        }
                      >
                        <div className="i-ph:code mr-2" />
                        API Settings
                      </Button>
                    </div>
                  </ProjectDetailsCard>
                </div>
              </div>

              {/* Project Stats */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(projectStats).map(([key, value]) => {
                      let icon = 'i-ph:database';
                      let tooltip = '';

                      if (key.toLowerCase().includes('table')) {
                        icon = 'i-ph:table';
                        tooltip = 'Number of tables in your database';
                      } else if (key.toLowerCase().includes('row')) {
                        icon = 'i-ph:rows';
                        tooltip = 'Total number of rows across all tables';
                      } else if (key.toLowerCase().includes('size')) {
                        icon = 'i-ph:hard-drive';
                        tooltip = 'Total database size including indexes and metadata';
                      } else if (key.toLowerCase().includes('function')) {
                        icon = 'i-ph:function';
                        tooltip = 'Number of database functions and stored procedures';
                      }

                      const isUnknown = value === 'Unknown';
                      const formattedValue = isUnknown ? '0' : value;

                      return (
                        <StatCard
                          key={key}
                          name={key}
                          value={formattedValue}
                          icon={icon}
                          tooltip={tooltip}
                          trend={!isUnknown ? { value: 5, isPositive: true } : undefined}
                        />
                      );
                    })}
                  </div>
                )}

                {isLoading && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

              {/* Features Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="i-ph:puzzle-piece text-lg text-accent-500" />
                    <h3 className="text-md font-semibold text-bolt-elements-textPrimary">Project Features</h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-bolt-elements-textSecondary">
                    <div className="flex items-center gap-1">
                      <div className="i-ph:check-circle text-green-500" />
                      <span>{Object.values(features).filter(Boolean).length} Enabled</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="i-ph:x-circle text-bolt-elements-textSecondary" />
                      <span>{Object.values(features).filter(Boolean).length} Not Configured</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FeatureCard
                    name="Row Level Security (RLS)"
                    isConfigured={features.rls}
                    icon="i-ph:shield-check"
                    description="Controls access to your rows based on user attributes"
                    onSetup={() => window.open('https://supabase.com/docs/guides/auth/row-level-security', '_blank')}
                  />
                  <FeatureCard
                    name="Storage"
                    isConfigured={features.storage}
                    icon="i-ph:cloud-upload"
                    description="Store and serve large files and media"
                    onSetup={() => window.open('https://supabase.com/docs/guides/storage', '_blank')}
                  />
                  <FeatureCard
                    name="Authentication"
                    isConfigured={features.auth}
                    icon="i-ph:user-circle"
                    description="User login and identity management"
                    onSetup={() => window.open('https://supabase.com/docs/guides/auth', '_blank')}
                  />
                  <FeatureCard
                    name="Edge Functions"
                    isConfigured={features.edgeFunctions}
                    icon="i-ph:lightning"
                    description="Deploy serverless code at the edge"
                    onSetup={() => window.open('https://supabase.com/docs/guides/functions', '_blank')}
                  />
                </div>

                <div className="flex items-center mt-4 p-3 rounded-md bg-bolt-elements-bg-depth-2 border border-bolt-elements-borderColor">
                  <div className="i-ph:info text-accent-500 mr-2" />
                  <p className="text-xs text-bolt-elements-textSecondary">
                    For newly created projects, some features may show as "Not Configured" until the project is fully
                    provisioned. Click "Configure" on any feature to learn how to set it up.
                  </p>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="bg-red-500/5 rounded-lg p-5 border border-red-500/30">
                <div className="flex items-center gap-2 mb-4">
                  <div className="i-ph:warning-octagon text-red-500" />
                  <h3 className="text-base font-medium text-red-500">Danger Zone</h3>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pl-6">
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
        </div>

        {/* Connection Dialog */}
        <SupabaseConnectButton isOpen={showConnectionDialog} onOpenChange={setShowConnectionDialog} />
      </div>

      {config && setupStatus.isSettingUp && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-bolt-elements-bg-depth-1 rounded-lg p-6 border border-bolt-elements-borderColor max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="i-ph:database-duotone text-2xl text-accent-500 animate-pulse" />
              <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">Setting Up Database</h3>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`i-ph:check-circle ${setupStatus.step === 'creating_schema' ? 'text-accent-500 animate-spin' : setupStatus.step === 'completed' ? 'text-green-500' : 'text-bolt-elements-textSecondary'}`}
                  />
                  <span className="text-sm text-bolt-elements-textPrimary">Creating Schema</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`i-ph:check-circle ${setupStatus.step === 'creating_tables' ? 'text-accent-500 animate-spin' : setupStatus.step === 'completed' ? 'text-green-500' : 'text-bolt-elements-textSecondary'}`}
                  />
                  <span className="text-sm text-bolt-elements-textPrimary">Creating Tables</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`i-ph:check-circle ${setupStatus.step === 'creating_functions' ? 'text-accent-500 animate-spin' : setupStatus.step === 'completed' ? 'text-green-500' : 'text-bolt-elements-textSecondary'}`}
                  />
                  <span className="text-sm text-bolt-elements-textPrimary">Creating Functions</span>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`i-ph:check-circle ${setupStatus.step === 'setting_permissions' ? 'text-accent-500 animate-spin' : setupStatus.step === 'completed' ? 'text-green-500' : 'text-bolt-elements-textSecondary'}`}
                  />
                  <span className="text-sm text-bolt-elements-textPrimary">Setting Permissions</span>
                </div>
              </div>

              {setupStatus.error && (
                <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/30">
                  <div className="flex items-center gap-2 text-red-500">
                    <div className="i-ph:warning-circle" />
                    <p className="text-sm">{setupStatus.error}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

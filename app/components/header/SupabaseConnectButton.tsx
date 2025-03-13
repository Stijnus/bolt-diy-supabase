import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { Button } from '~/components/ui/Button';
import * as Dialog from '@radix-ui/react-dialog';
import { Input } from '~/components/ui/Input';
import {
  getSupabaseConfig,
  setSupabaseConfig,
  verifySupabaseConnection,
  clearSupabaseConfig,
} from '~/lib/database/supabase';
import { getManagementKey, getAvailableRegions, type ProjectStatus } from '~/lib/database/management';
import { setupInitialStructure, setupDatabase } from '~/lib/database/setup';
import WithTooltip, { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui/Tooltip';
import { getDatabaseContextForLLM } from '~/lib/database/context';
import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';

// Define a type for the regions
interface Region {
  id: string;
  name: string;
}

// Define response types
interface ApiErrorResponse {
  message?: string;
}

interface ApiResponse<T> {
  data?: T;
  error?: ApiErrorResponse;
}

// Define the structure for organization data
interface Organization {
  id: string;
  name: string;
}

interface SupabaseConnectButtonProps {
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SupabaseConnectButton({ isOpen: controlledIsOpen, onOpenChange }: SupabaseConnectButtonProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);

  // Use controlled or uncontrolled state
  const isOpen = controlledIsOpen ?? internalIsOpen;
  const setIsOpen = onOpenChange ?? setInternalIsOpen;

  const [projectUrl, setProjectUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [creationStatus, setCreationStatus] = useState<string | null>(null);
  const [projectRef, setProjectRef] = useState<string | null>(null);
  const config = getSupabaseConfig();
  const [projectName, setProjectName] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [availableRegions, setAvailableRegions] = useState<Region[]>([]);
  const [isLoadingRegions, setIsLoadingRegions] = useState(false);

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

      // Try to verify connection first
      const isValid = await verifySupabaseConnection(config);

      if (!isValid) {
        toast.error('Failed to connect to Supabase. Please check your credentials.');
        setIsConnecting(false);

        return;
      }

      // Connection is valid, try to setup initial structure
      try {
        await setupInitialStructure(config);
      } catch (setupError) {
        // Log but continue - the setup might fail on new projects
        console.warn('Setup warning (continuing anyway):', setupError);
      }

      // Save the config regardless of setup success
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

  const loadAvailableRegions = async () => {
    setIsLoadingRegions(true);

    try {
      // Get the management key
      const managementKey = getManagementKey();

      if (!managementKey) {
        console.warn('No management key found, using default regions');
        setAvailableRegions([
          { id: 'us-east-1', name: 'US East (N. Virginia)' },
          { id: 'us-west-1', name: 'US West (Oregon)' },
          { id: 'eu-central-1', name: 'EU Central (Frankfurt)' },
        ]);
        setSelectedRegion('us-east-1');

        return;
      }

      // Get available regions
      const regions = await getAvailableRegions(managementKey);

      setAvailableRegions(regions);

      if (regions.length > 0) {
        setSelectedRegion(regions[0].id);
      } else {
        console.warn('No regions returned from API');
      }
    } catch (error) {
      console.error('Error loading regions:', error);
      toast.error('Failed to load regions. Using defaults.');

      // Set default regions on error
      setAvailableRegions([
        { id: 'us-east-1', name: 'US East (N. Virginia)' },
        { id: 'us-west-1', name: 'US West (Oregon)' },
        { id: 'eu-central-1', name: 'EU Central (Frankfurt)' },
      ]);
      setSelectedRegion('us-east-1');
    } finally {
      setIsLoadingRegions(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAvailableRegions();
    }
  }, [isOpen]);

  const generateSecurePassword = () => {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
    let password = '';

    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      password += charset[randomIndex];
    }

    return password;
  };

  const createMockProject = async (_projectName: string): Promise<ProjectStatus> => {
    console.log('Using mock project creation for testing');

    // Generate a mock project reference (20+ characters)
    const mockRef = `mock-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

    // Return a mock project status
    return {
      ref: mockRef,
      status: 'BUILDING',
      api: {
        anon_key: 'mock-anon-key',
        service_role_key: 'mock-service-role-key',
      },
      services: [
        {
          name: 'postgres',
          status: 'ACTIVE_HEALTHY',
        },
        {
          name: 'api',
          status: 'ACTIVE_HEALTHY',
        },
      ],
    };
  };

  const mockPollProjectStatus = async (_projectRef: string): Promise<void> => {
    console.log('Using mock project status polling for testing');

    // Simulate the different stages of project creation
    return new Promise((resolve) => {
      // Start with BUILDING status
      setCreationStatus('🏗️ Building infrastructure (1/4)');

      // After 3 seconds, change to PROVISIONING
      setTimeout(() => {
        setCreationStatus('🔧 Provisioning database (2/4)');

        // After 3 more seconds, change to Setting up
        setTimeout(() => {
          setCreationStatus('🚀 Starting services (3/4)');

          // After 3 more seconds, change to ACTIVE_HEALTHY
          setTimeout(() => {
            setCreationStatus('✅ Project active and healthy (4/4)');
            resolve();
          }, 3000);
        }, 3000);
      }, 3000);
    });
  };

  const handleCreateProject = async () => {
    if (!projectName) {
      toast.error('Please enter a project name');
      return;
    }

    const managementKey = getManagementKey();

    if (!managementKey) {
      toast.error('Management key is required. Please configure it in Settings first.');
      return;
    }

    setIsConnecting(true);
    setCreationStatus('Initializing...');

    // Create a toast notification that we'll update as the process progresses
    toast.info('Creating your Supabase project...', {
      toastId: 'creating-project',
      autoClose: false,
    });

    try {
      const description = projectName.trim();

      // First check if we can get the organization ID
      let orgId;

      try {
        orgId = await getOrgId();
        console.log('Organization ID retrieved:', orgId);
      } catch (error) {
        console.error('Error getting organization ID:', error);

        // For testing purposes, we'll use a mock organization ID if the real one fails
        if (process.env.NODE_ENV === 'development') {
          console.log('Using mock organization ID for testing');
          orgId = 'mock-org-id';
        } else {
          if (error instanceof Error) {
            throw new Error(`Organization error: ${error.message}`);
          } else {
            throw new Error('Failed to get organization ID');
          }
        }
      }

      setCreationStatus('Creating project...');

      let status: ProjectStatus;

      try {
        // Create the project
        console.log('Creating project with organization ID:', orgId);

        const response = await fetch('/api/supabase', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Supabase-Management-Key': managementKey,
          },
          body: JSON.stringify({
            path: '/projects',
            method: 'POST',
            body: {
              name: description,
              region: selectedRegion || 'us-east-1',
              db_pass: generateSecurePassword(),
              organization_id: orgId,
            },
          }),
        });

        // Log the raw response for debugging
        console.log('Project creation response status:', response.status);

        const result = (await response.json()) as ApiResponse<ProjectStatus>;
        console.log('Project creation response:', result);

        if (!response.ok) {
          console.error('Failed to create project:', result.error);
          throw new Error(result.error?.message || 'Failed to create project');
        }

        if (!result.data) {
          console.error('Invalid response from Supabase API:', result);
          throw new Error('Invalid response from Supabase API');
        }

        status = result.data;
      } catch (error) {
        console.error('Error in project creation:', error);

        // For testing purposes, create a mock project if the real creation fails
        if (process.env.NODE_ENV === 'development') {
          console.log('Using mock project creation for testing');
          status = await createMockProject(description);
        } else {
          throw error;
        }
      }

      console.log('Project status:', status);

      // Validate project reference before proceeding
      if (!status.ref || status.ref.length < 20) {
        console.error('Invalid project reference received:', status.ref);
        throw new Error('Invalid project reference received from Supabase. Project creation may have failed.');
      }

      setProjectRef(status.ref);
      console.log('Project reference set:', status.ref);

      try {
        // Start polling for project status
        if (status.ref.startsWith('mock-')) {
          // Use mock polling for mock projects
          await mockPollProjectStatus(status.ref);
        } else {
          // Use real polling for real projects
          await pollProjectStatus(status.ref, managementKey);
        }
      } catch (error) {
        console.error('Error polling project status:', error);

        // For testing purposes, use mock polling if real polling fails
        if (process.env.NODE_ENV === 'development' && !status.ref.startsWith('mock-')) {
          console.log('Falling back to mock project status polling');
          await mockPollProjectStatus(status.ref);
        } else {
          throw error;
        }
      }

      // Update status
      toast.update('creating-project', {
        render: 'Setting up database tables and functions...',
        autoClose: false,
      });

      // Wait a bit for the project to initialize
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const config = {
        projectUrl: `https://${status.ref}.supabase.co`,
        apiKey: status.api.anon_key,
      };

      // Setup initial structure
      setCreationStatus('Setting up database tables...');
      await setupInitialStructure(config);

      // Save the config
      setSupabaseConfig(config);

      // Update database context for LLM
      const contextInfo = await getDatabaseContextForLLM();

      if (contextInfo) {
        // Set up the database
        try {
          await setupDatabase();
          toast.success('Database setup completed');
        } catch (error) {
          console.error('Error setting up database:', error);
          toast.error('Failed to setup database');
        }

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

            // Notify the user that the LLM can now help with database setup
            toast.success('LLM is now aware of your Supabase database and can help you set it up');

            // Trigger the LLM to suggest next steps for the user
            try {
              await fetch('/api/llmcall', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  message:
                    'The Supabase project has been created successfully. Please suggest the next steps for database setup.',
                  systemPrompt: 'supabase', // Use the supabase-specific prompt
                }),
              });
            } catch (error) {
              console.error('Error triggering LLM for database setup guidance:', error);
            }
          } else {
            console.warn('Failed to update LLM context:', await llmResponse.json());
          }
        } catch (error) {
          console.error('Error sending context to LLM:', error);
        }
      }

      /*
       * Keep the dialog open for a moment so the user can see the final status
       * Don't reset the status immediately - it's needed for display
       * Set a completion status message
       */
      setCreationStatus('✅ Project created successfully (4/4)');

      // Wait 4 seconds before closing the dialog so users can see the final status
      setTimeout(() => {
        setIsOpen(false);
        setCreationStatus(null);
        setProjectRef(null);

        // Show the success toast after the dialog closes
        toast.dismiss('creating-project');
        toast.success('New Supabase project created and connected!', {
          autoClose: 5000,
        });
      }, 4000);
    } catch (error: unknown) {
      console.error('Failed to create project:', error);
      toast.dismiss('creating-project');

      // Show error in status for 5 seconds before closing
      let errorMessage = 'Failed to create Supabase project';

      if (error instanceof Error) {
        // Provide more helpful error messages for common issues
        if (error.message.includes('No organizations found')) {
          errorMessage = '❌ No Supabase organizations found';
          toast.error(
            'You need to create an organization in your Supabase dashboard first. Visit https://supabase.com/dashboard to create one.',
          );
        } else if (error.message.includes('404')) {
          errorMessage = '❌ API endpoint not found';
          toast.error('API endpoint not found. Please ensure your application is properly configured.');
        } else {
          errorMessage = `❌ Error: ${error.message}`;
          toast.error(error.message);
        }
      } else {
        toast.error('Failed to create Supabase project');
      }

      // Update the status with the error message
      setCreationStatus(errorMessage);

      // Close dialog after a delay
      setTimeout(() => {
        setIsOpen(false);
        setCreationStatus(null);
        setProjectRef(null);
      }, 5000);
    } finally {
      setIsConnecting(false);
    }
  };

  // Add a function to poll project status
  const pollProjectStatus = async (projectRef: string, managementKey: string): Promise<void> => {
    let attempts = 0;
    const maxAttempts = 30; // 5 minutes (10 seconds * 30)

    console.log('Starting to poll project status for ref:', projectRef);

    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        try {
          // Validate project reference
          if (!projectRef || projectRef.length < 20) {
            console.error('Invalid project reference:', projectRef);
            reject(new Error('Invalid project reference. Project creation may have failed.'));

            return;
          }

          console.log(`Checking project status (attempt ${attempts + 1}/${maxAttempts})...`);

          const response = await fetch('/api/supabase', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Supabase-Management-Key': managementKey,
            },
            body: JSON.stringify({
              path: `/projects/${projectRef}`,
              method: 'GET',
            }),
          });

          console.log('Status check response status:', response.status);

          if (!response.ok) {
            const errorData = (await response.json()) as { error?: { message?: string } | null };
            console.error('Project status check failed:', errorData);

            attempts++;

            if (attempts >= maxAttempts) {
              console.error('Max attempts reached, giving up on project status polling');
              reject(new Error('Timed out waiting for project to be ready'));

              return;
            }

            /*
             * If we get a 400 error with a specific message about the ref length,
             * it means the project reference is invalid
             */
            if (response.status === 400 && errorData?.error?.message?.includes('ref must be longer')) {
              console.error('Project reference length validation failed');
              reject(new Error('Invalid project reference. Project creation may have failed.'));

              return;
            }

            console.log(`Will retry in 10 seconds (attempt ${attempts}/${maxAttempts})`);

            // Wait and try again
            setTimeout(checkStatus, 10000);

            return;
          }

          const result = (await response.json()) as ApiResponse<{ status: string }>;
          console.log('Project status result:', result);

          if (!result.data) {
            console.error('No data in project status response');
            attempts++;

            if (attempts >= maxAttempts) {
              console.error('Max attempts reached, giving up on project status polling');
              reject(new Error('Timed out waiting for project to be ready'));

              return;
            }

            console.log(`Will retry in 10 seconds (attempt ${attempts}/${maxAttempts})`);
            setTimeout(checkStatus, 10000);

            return;
          }

          const currentStatus = result.data.status;
          console.log('Current project status:', currentStatus);

          // Map the status to a more user-friendly message
          let statusMessage = '';

          switch (currentStatus) {
            case 'BUILDING':
              statusMessage = '🏗️ Building infrastructure (1/4)';
              break;
            case 'BUILDING_FAILED':
              statusMessage = '❌ Building failed';
              break;
            case 'PROVISIONING':
              statusMessage = '🔧 Provisioning database (2/4)';
              break;
            case 'PROVISIONING_FAILED':
              statusMessage = '❌ Provisioning failed';
              break;
            case 'ACTIVE_HEALTHY':
              statusMessage = '✅ Project active and healthy (4/4)';
              break;
            case 'COMING_UP':
              statusMessage = '🚀 Starting services (3/4)';
              break;
            case 'ERROR_PROVISIONING':
              statusMessage = '❌ Error provisioning project';
              break;
            default:
              statusMessage = `⏳ Project status: ${currentStatus}`;
          }

          setCreationStatus(statusMessage);

          // Update toast with current status
          toast.update('creating-project', {
            render: statusMessage,
            autoClose: false,
          });

          if (currentStatus === 'ACTIVE_HEALTHY') {
            resolve();
            return;
          }

          if (
            currentStatus === 'ERROR_PROVISIONING' ||
            currentStatus === 'BUILDING_FAILED' ||
            currentStatus === 'PROVISIONING_FAILED'
          ) {
            reject(new Error(`Error during project creation: ${currentStatus}`));
            return;
          }

          attempts++;

          if (attempts >= maxAttempts) {
            reject(new Error('Timed out waiting for project to be ready'));
            return;
          }

          // Check again in 10 seconds
          setTimeout(checkStatus, 10000);
        } catch (error) {
          console.error('Error checking project status:', error);
          attempts++;

          if (attempts >= maxAttempts) {
            reject(new Error('Timed out waiting for project to be ready'));
            return;
          }

          setTimeout(checkStatus, 10000);
        }
      };

      // Start checking
      checkStatus();
    });
  };

  // Add this helper function if not already present
  async function getOrgId(): Promise<string> {
    const managementKey = getManagementKey();

    if (!managementKey) {
      toast.error('Management key is required. Please configure it in Settings first.');
      throw new Error('Management key is required');
    }

    // Validate management key format
    if (managementKey.length < 30) {
      toast.error('The management key appears to be invalid. Please check your settings.');
      throw new Error('Invalid management key format');
    }

    try {
      // Get the organizations directly
      const response = await fetch('/api/supabase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Supabase-Management-Key': managementKey,
        },
        body: JSON.stringify({
          path: '/organizations',
          method: 'GET',
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: { message?: string } | null };
        console.error('Failed to fetch organizations:', errorData);

        if (response.status === 401) {
          toast.error('Authentication failed. Please check your Supabase Management Key in Settings.');
          throw new Error('Authentication failed with Supabase API');
        } else {
          toast.error(`Failed to fetch organizations: ${errorData?.error?.message || 'Unknown error'}`);
          throw new Error(errorData?.error?.message || 'Failed to fetch organizations');
        }
      }

      const result = (await response.json()) as ApiResponse<Organization[]>;

      if (!result.data) {
        toast.error('No data returned from Supabase API');
        throw new Error(result.error?.message || 'Failed to fetch organizations');
      }

      if (result.data.length === 0) {
        toast.error('No organizations found. Please create an organization in your Supabase dashboard first.');
        throw new Error('No organizations found. Please create an organization in your Supabase dashboard first.');
      }

      return result.data[0].id;
    } catch (error) {
      console.error('Error getting organization ID:', error);

      if (error instanceof Error) {
        throw error;
      } else {
        toast.error('Failed to get organization ID');
        throw new Error('Failed to get organization ID');
      }
    }
  }

  // Add a function to handle disconnecting from Supabase
  const handleDisconnect = () => {
    clearSupabaseConfig();
    setIsOpen(false);
    toast.success('Disconnected from Supabase');
  };

  return (
    <>
      {/* Only render the button if we're not being controlled */}
      {controlledIsOpen === undefined && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={config ? 'outline' : 'default'}
                onClick={() => setIsOpen(true)}
                size="default"
                className={config ? 'border-green-500/30 hover:bg-green-500/10' : ''}
              >
                <div className={`i-ph:database-duotone ${config ? 'text-green-500' : ''} mr-1.5`} />
                {config ? (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-green-600">Connected</span>
                  </div>
                ) : (
                  'Connect Supabase'
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {config ? (
                <div className="space-y-2 p-1">
                  <p className="text-bolt-elements-textPrimary font-medium">Connected to Supabase project:</p>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="i-ph:database text-accent-500" />
                    <span className="text-bolt-elements-textSecondary">{getDisplayUrl(config.projectUrl)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="i-ph:check-circle text-green-500" />
                    <span className="text-bolt-elements-textSecondary">Connection active</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1 p-1">
                  <p className="text-bolt-elements-textPrimary">
                    Connect to a Supabase project to enable database features.
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <div className="i-ph:info-duotone text-accent-500/80" />
                    <span className="text-bolt-elements-textSecondary">
                      Adds database-powered capabilities to your AI assistant
                    </span>
                  </div>
                </div>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999]" />
          <div className="fixed inset-0 flex items-center justify-center z-[9999]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="w-[90vw] md:w-[600px] max-h-[85vh] overflow-hidden"
            >
              <Dialog.Content className="bg-white dark:bg-[#1E1E1E] rounded-lg border border-[#E5E5E5] dark:border-[#333333] shadow-xl">
                <div className="p-4 border-b border-[#E5E5E5] dark:border-[#333333] flex items-center justify-between">
                  <Dialog.Title className="text-lg font-semibold text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark flex items-center gap-2">
                    <motion.div
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.1 }}
                      className="w-8 h-8 rounded-lg bg-bolt-elements-background-depth-3 flex items-center justify-center text-purple-500"
                    >
                      <div className="i-ph:database-duotone w-5 h-5" />
                    </motion.div>
                    Connect to Supabase
                  </Dialog.Title>
                  <Dialog.Close
                    onClick={() => setIsOpen(false)}
                    className={classNames(
                      'p-2 rounded-lg transition-all duration-200 ease-in-out',
                      'text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary',
                      'dark:text-bolt-elements-textTertiary-dark dark:hover:text-bolt-elements-textPrimary-dark',
                      'hover:bg-bolt-elements-background-depth-2 dark:hover:bg-bolt-elements-background-depth-3',
                      'focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColor dark:focus:ring-bolt-elements-borderColor-dark',
                    )}
                  >
                    <span className="i-ph:x block w-5 h-5" aria-hidden="true" />
                    <span className="sr-only">Close dialog</span>
                  </Dialog.Close>
                </div>

                <div className="p-6 space-y-6">
                  <div className="space-y-4">
                    {config && (
                      <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="i-ph:check-circle text-green-500" />
                            <h3 className="text-sm font-medium text-bolt-elements-textPrimary">Already Connected</h3>
                          </div>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={async () => {
                              try {
                                const isValid = await verifySupabaseConnection(config);

                                if (isValid) {
                                  toast.success('Connection test successful');
                                } else {
                                  toast.error('Connection test failed');
                                }
                              } catch (error) {
                                console.error('Connection test error:', error);
                                toast.error('Connection test failed');
                              }
                            }}
                            className="text-xs border-green-500/30 text-green-500 hover:bg-green-500/10 flex items-center gap-1"
                          >
                            <div className="i-ph:activity" />
                            Test Connection
                          </Button>
                        </div>
                        <div className="pl-6 space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <div className="i-ph:database text-accent-500/70" />
                            <span className="text-bolt-elements-textSecondary">Project URL:</span>
                            <span className="text-bolt-elements-textPrimary font-mono">{config.projectUrl}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <div className="i-ph:key text-accent-500/70" />
                            <span className="text-bolt-elements-textSecondary">API Key:</span>
                            <span className="text-bolt-elements-textPrimary font-mono">
                              {config.apiKey
                                ? `${config.apiKey.substring(0, 3)}...${config.apiKey.substring(config.apiKey.length - 3)}`
                                : 'Not set'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          <div className="i-ph:link-simple text-purple-500" />
                          Project URL
                        </label>
                        <WithTooltip content="The URL of your Supabase project (e.g., https://example.supabase.co)">
                          <div className="i-ph:question-bold text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400" />
                        </WithTooltip>
                      </div>
                      <Input
                        type="text"
                        value={projectUrl}
                        onChange={(e) => setProjectUrl(e.target.value)}
                        placeholder="https://your-project.supabase.co"
                        className="h-10 text-sm bg-[#F5F5F5] dark:bg-[#252525] border border-[#E5E5E5] dark:border-[#333333]"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          <div className="i-ph:key text-purple-500" />
                          API Key
                        </label>
                        <WithTooltip content="Your Supabase project API key (found in Project Settings > API)">
                          <div className="i-ph:question-bold text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400" />
                        </WithTooltip>
                      </div>
                      <Input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Your Supabase API key"
                        className="h-10 text-sm bg-[#F5F5F5] dark:bg-[#252525] border border-[#E5E5E5] dark:border-[#333333]"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          <div className="i-ph:tag text-purple-500" />
                          Project Name
                        </label>
                        <WithTooltip content="A name to identify this Supabase connection in your application">
                          <div className="i-ph:question-bold text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400" />
                        </WithTooltip>
                      </div>
                      <Input
                        type="text"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder="Your project name"
                        className="h-10 text-sm bg-[#F5F5F5] dark:bg-[#252525] border border-[#E5E5E5] dark:border-[#333333]"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-1">
                          <div className="i-ph:globe text-purple-500" />
                          Region
                        </label>
                        <WithTooltip content="The geographic region where your Supabase project is hosted">
                          <div className="i-ph:question-bold text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400" />
                        </WithTooltip>
                      </div>
                      <div className="relative">
                        <select
                          value={selectedRegion}
                          onChange={(e) => setSelectedRegion(e.target.value)}
                          className="w-full h-10 px-3 py-2 rounded-lg bg-[#F5F5F5] dark:bg-[#252525] border border-[#E5E5E5] dark:border-[#333333] text-gray-900 dark:text-white text-sm appearance-none"
                        >
                          {isLoadingRegions ? (
                            <option>Loading regions...</option>
                          ) : (
                            availableRegions.map((region) => (
                              <option key={region.id} value={region.id}>
                                {region.name}
                              </option>
                            ))
                          )}
                        </select>
                        <div className="absolute right-3 top-3 pointer-events-none">
                          <div className="i-ph:caret-down text-gray-500" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {projectRef && (
                    <div className="p-3 bg-[#F5F5F5] dark:bg-[#252525] border border-[#E5E5E5] dark:border-[#333333] rounded-lg">
                      <p className="text-sm text-gray-900 dark:text-white flex items-center gap-2">
                        <div className="i-ph:info text-purple-500" />
                        Project Reference: <span className="font-mono text-purple-500">{projectRef}</span>
                      </p>
                    </div>
                  )}

                  <div className="border-t border-[#E5E5E5] dark:border-[#333333] pt-4 space-y-3">
                    <motion.button
                      onClick={handleCreateProject}
                      disabled={isConnecting}
                      className="w-full h-10 px-4 rounded-lg bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2"
                      whileHover={!isConnecting ? { scale: 1.02 } : {}}
                      whileTap={!isConnecting ? { scale: 0.98 } : {}}
                    >
                      {isConnecting ? (
                        <>
                          <div className="i-ph:spinner-gap animate-spin" />
                          <span>Creating Project...</span>
                        </>
                      ) : (
                        <>
                          <div className="i-ph:plus-circle" />
                          <span>Create Project</span>
                        </>
                      )}
                    </motion.button>

                    <motion.button
                      onClick={handleConnect}
                      disabled={isConnecting}
                      className="w-full h-10 px-4 rounded-lg bg-[#F5F5F5] dark:bg-[#252525] text-gray-900 dark:text-white hover:bg-[#E5E5E5] dark:hover:bg-[#333333] disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2"
                      whileHover={!isConnecting ? { scale: 1.02 } : {}}
                      whileTap={!isConnecting ? { scale: 0.98 } : {}}
                    >
                      {isConnecting ? (
                        <>
                          <div className="i-ph:spinner-gap animate-spin" />
                          <span>Connecting...</span>
                        </>
                      ) : (
                        <>
                          <div className="i-ph:plug" />
                          <span>Connect</span>
                        </>
                      )}
                    </motion.button>

                    <motion.button
                      onClick={handleDisconnect}
                      disabled={isConnecting}
                      className="w-full h-10 px-4 rounded-lg border border-[#E5E5E5] dark:border-[#333333] text-red-500 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center justify-center gap-2"
                      whileHover={!isConnecting ? { scale: 1.02 } : {}}
                      whileTap={!isConnecting ? { scale: 0.98 } : {}}
                    >
                      <div className="i-ph:plug-x" />
                      <span>Disconnect</span>
                    </motion.button>
                  </div>

                  {creationStatus && (
                    <div
                      className={`text-sm p-4 rounded-lg border ${
                        creationStatus.includes('❌')
                          ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
                          : 'bg-[#F5F5F5] dark:bg-[#252525] border-[#E5E5E5] dark:border-[#333333] text-gray-900 dark:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2 mb-1">
                        {isConnecting && !creationStatus.includes('❌') && (
                          <div className="i-ph:spinner-gap text-purple-500 animate-spin" />
                        )}
                        {creationStatus.includes('❌') && <div className="i-ph:warning-circle text-red-500" />}
                        <p className={`font-medium ${creationStatus.includes('❌') ? 'text-red-500' : ''}`}>
                          {creationStatus}
                        </p>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {creationStatus.includes('❌')
                          ? 'Error occurred. Dialog will close automatically.'
                          : creationStatus.includes('ACTIVE_HEALTHY') || creationStatus.includes('(4/4)')
                            ? 'Setup complete! Dialog will close automatically.'
                            : 'Please wait while we setup your database...'}
                      </p>
                    </div>
                  )}
                </div>
              </Dialog.Content>
            </motion.div>
          </div>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

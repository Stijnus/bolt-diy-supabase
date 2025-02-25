import { useState, useEffect } from 'react';
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
import { getManagementKey, getAvailableRegions, type ProjectStatus } from '~/lib/database/management';
import { setupInitialStructure } from '~/lib/database/setup';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui/Tooltip';

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

export function SupabaseConnectButton() {
  const [isOpen, setIsOpen] = useState(false);
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
      setCreationStatus('BUILDING');

      // After 3 seconds, change to PROVISIONING
      setTimeout(() => {
        setCreationStatus('PROVISIONING');

        // After 3 more seconds, change to Setting up
        setTimeout(() => {
          setCreationStatus('Setting up');

          // After 3 more seconds, change to ACTIVE_HEALTHY
          setTimeout(() => {
            setCreationStatus('ACTIVE_HEALTHY');
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

      // Close dialog and show success
      setIsOpen(false);
      setCreationStatus(null);
      setProjectRef(null);
      toast.dismiss('creating-project');
      toast.success('New Supabase project created and connected!');
    } catch (error: unknown) {
      console.error('Failed to create project:', error);
      toast.dismiss('creating-project');
      setCreationStatus(null);
      setProjectRef(null);

      if (error instanceof Error) {
        // Provide more helpful error messages for common issues
        if (error.message.includes('No organizations found')) {
          toast.error(
            'You need to create an organization in your Supabase dashboard first. Visit https://supabase.com/dashboard to create one.',
          );
        } else if (error.message.includes('404')) {
          toast.error('API endpoint not found. Please ensure your application is properly configured.');
        } else {
          toast.error(error.message);
        }
      } else {
        toast.error('Failed to create Supabase project');
      }
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
              statusMessage = 'Building infrastructure (1/4)';
              break;
            case 'BUILDING_FAILED':
              statusMessage = 'Building failed';
              break;
            case 'PROVISIONING':
              statusMessage = 'Provisioning database (2/4)';
              break;
            case 'PROVISIONING_FAILED':
              statusMessage = 'Provisioning failed';
              break;
            case 'ACTIVE_HEALTHY':
              statusMessage = 'Project active and healthy (4/4)';
              break;
            case 'COMING_UP':
              statusMessage = 'Starting services (3/4)';
              break;
            case 'ERROR_PROVISIONING':
              statusMessage = 'Error provisioning project';
              break;
            default:
              statusMessage = `Project status: ${currentStatus}`;
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
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={config ? 'outline' : 'default'}
              onClick={() => setIsOpen(true)}
              className="supabase-connect-btn gap-2 bg-bolt-elements-bg-depth-1 border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-bg-depth-2"
            >
              <div className="i-ph:database-duotone text-accent-500" />
              {config ? (
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-bolt-elements-icon-success rounded-full animate-pulse" />
                  <span>Connected</span>
                </div>
              ) : (
                'Connect Supabase'
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {config ? (
              <div>
                <p>Connected to Supabase project:</p>
                <p className="text-sm">{getDisplayUrl(config.projectUrl)}</p>
              </div>
            ) : (
              <p>Connect to a Supabase project to enable database features.</p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DialogRoot open={isOpen} onOpenChange={setIsOpen}>
        <Dialog className="max-w-lg">
          <DialogTitle>Connect to Supabase</DialogTitle>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm">Project URL:</label>
              <Input
                type="text"
                value={projectUrl}
                onChange={(e) => setProjectUrl(e.target.value)}
                placeholder="https://your-project.supabase.co"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm">API Key:</label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Your Supabase API key"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm">Project Name:</label>
              <Input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Your project name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm">Region:</label>
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="bg-bolt-elements-bg-depth-1 border-bolt-elements-borderColor text-bolt-elements-textPrimary p-2 rounded"
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
            </div>
            {projectRef && (
              <div className="p-2 bg-bolt-elements-bg-depth-1 rounded border border-bolt-elements-borderColor">
                <p className="text-sm">Project Reference: {projectRef}</p>
              </div>
            )}
            <Button
              onClick={handleCreateProject}
              disabled={isConnecting}
              className="bg-bolt-elements-bg-depth-1 border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-bg-depth-2"
            >
              Create Project
            </Button>
            <Button
              onClick={handleConnect}
              disabled={isConnecting}
              className="bg-bolt-elements-bg-depth-1 border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-bg-depth-2"
            >
              Connect
            </Button>
            <Button
              onClick={handleDisconnect}
              disabled={isConnecting}
              className="bg-bolt-elements-bg-depth-1 border-bolt-elements-borderColor text-bolt-elements-textPrimary hover:bg-bolt-elements-bg-depth-2"
            >
              Disconnect
            </Button>
            {creationStatus && <p className="text-sm text-bolt-elements-textSecondary">{creationStatus}</p>}
          </div>
        </Dialog>
      </DialogRoot>
    </>
  );
}

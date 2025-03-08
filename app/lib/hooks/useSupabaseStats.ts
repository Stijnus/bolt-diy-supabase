import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import { createSupabaseClient, getSupabaseConfig } from '~/lib/database/supabase';

interface TableInfo {
  name: string;
  size: number;
  row_count: number;
}

interface ProjectStats {
  tables: number;
  size: string;
  rows: number;
}

export function useSupabaseStats() {
  const config = getSupabaseConfig();
  const [projectStats, setProjectStats] = useState<ProjectStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const formatBytes = (bytes: number) => {
    if (bytes === 0) {
      return '0 Bytes';
    }

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Use a ref to prevent unnecessary re-renders
  const configRef = useRef(config);

  // Update the ref when config changes
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const loadProjectStats = useCallback(async () => {
    // Use the ref value instead of the dependency
    const currentConfig = configRef.current;

    if (!currentConfig) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setIsError(false);

    try {
      const supabase = createSupabaseClient();

      /*
       * First check if we can get a list of tables from information_schema
       * This is the safest approach that should work on any Supabase project
       */
      try {
        /*
         * Check if this is a new project by checking for tables in pg_catalog
         * This prevents unnecessary 404 requests to non-existent tables
         */
        const { data: tableExists, error: tableCheckError } = await supabase
          .from('pg_catalog.pg_tables')
          .select('schemaname, tablename')
          .eq('schemaname', 'public')
          .limit(1);

        // If we can't access pg_catalog or there are no public tables, it's likely a new project
        if (tableCheckError || !tableExists || tableExists.length === 0) {
          console.log('New project detected, stats will be available later');
          setProjectStats({
            tables: 0,
            size: '0 Bytes',
            rows: 0,
          });
          setIsLoading(false);

          return;
        }

        // Only try to access information_schema if we didn't get a table not found error
        const { data: basicTables, error: basicError } = await supabase
          .from('information_schema.tables')
          .select('table_name')
          .eq('table_schema', 'public')
          .eq('table_type', 'BASE TABLE');

        if (!basicError && basicTables) {
          // We have basic table information, but still try to get detailed stats
          const basicTableCount = basicTables.length;

          try {
            /*
             * Check if the function exists first to avoid 404 errors
             * Try a safer approach first
             */
            try {
              // Check if the function exists by querying the information schema
              const { data: functionExists, error: functionCheckError } = await supabase
                .from('information_schema.routines')
                .select('routine_name')
                .eq('routine_name', 'get_table_info')
                .eq('routine_schema', 'public')
                .limit(1);

              // If we can't check or the function doesn't exist, skip this step
              if (functionCheckError || !functionExists || functionExists.length === 0) {
                console.log('get_table_info function not found, using basic table information');
                setProjectStats({
                  tables: basicTableCount,
                  size: 'Unknown',
                  rows: 0,
                });
                setIsLoading(false);

                return;
              }
            } catch {
              // If we can't even check for the function, just use basic info
              console.log('Unable to check for get_table_info function, using basic table information');
              setProjectStats({
                tables: basicTableCount,
                size: 'Unknown',
                rows: 0,
              });
              setIsLoading(false);

              return;
            }

            // Only call the function if we confirmed it exists
            const { data: tables, error } = await supabase.rpc('get_table_info');

            if (error) {
              // For new projects, the function might not exist yet, but we have basic info
              if (error.code === 'PGRST202') {
                // Show basic stats with placeholders
                console.log('New project detected, using basic table information');
                setProjectStats({
                  tables: basicTableCount,
                  size: 'Unknown',
                  rows: 0,
                });
                setIsLoading(false);

                return;
              }

              // If any other error, we still have basic table count
              setProjectStats({
                tables: basicTableCount,
                size: 'Unknown',
                rows: 0,
              });
              console.warn('Using basic stats due to error:', error);
              setIsLoading(false);

              return;
            }

            // We have detailed stats!
            if (tables) {
              setProjectStats({
                tables: tables.length,
                size: formatBytes(tables.reduce((acc: number, table: TableInfo) => acc + table.size, 0)),
                rows: tables.reduce((acc: number, table: TableInfo) => acc + table.row_count, 0),
              });
            }
          } catch (detailedError) {
            // Just use basic info
            console.warn('Failed to get detailed stats, using basic table count:', detailedError);
            setProjectStats({
              tables: basicTableCount,
              size: 'Unknown',
              rows: 0,
            });
          }
        } else {
          /*
           * If we can't even get basic table info, we should be very cautious
           * For new projects, it's better to just show empty stats than to make requests that will 404
           */
          console.log('Basic table info not available, likely a new project');
          setProjectStats({
            tables: 0,
            size: '0 Bytes',
            rows: 0,
          });
          setIsLoading(false);

          return;
        }
      } catch (statsError) {
        console.warn('Failed to get any table stats, using fallback:', statsError);

        // Complete fallback for new projects
        setProjectStats({
          tables: 0,
          size: '0 Bytes',
          rows: 0,
        });
      }
    } catch (error) {
      console.error('Failed to load project stats:', error);
      setIsError(true);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load project statistics');

      // Don't show error toast for new projects
      if (error instanceof Error && error.message.includes('PGRST202')) {
        console.log('New project detected, stats will be available later');
      } else {
        toast.error('Failed to load project statistics');
      }
    } finally {
      setIsLoading(false);
    }

    // Remove config from dependencies since we use the ref
  }, []);

  useEffect(() => {
    if (config) {
      loadProjectStats();
    }
  }, [config, loadProjectStats]);

  return {
    projectStats,
    isLoading,
    isError,
    errorMessage,
    refreshStats: loadProjectStats,
  };
}

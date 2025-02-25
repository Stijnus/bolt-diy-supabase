import { useState, useEffect } from 'react';
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
  const [isLoading, setIsLoading] = useState(true);
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

  const loadProjectStats = async () => {
    if (!config) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setIsError(false);

    try {
      const supabase = createSupabaseClient();

      // Try to get table info
      try {
        const { data: tables, error } = await supabase.rpc('get_table_info');

        if (error) {
          // For new projects, the function might not exist yet
          if (error.code === 'PGRST202') {
            // For new projects, just show placeholder stats
            console.log('New project detected, stats will be available later');
            setProjectStats({
              tables: 0,
              size: '0 Bytes',
              rows: 0,
            });

            return;
          }

          throw error;
        }

        if (tables) {
          setProjectStats({
            tables: tables.length,
            size: formatBytes(tables.reduce((acc: number, table: TableInfo) => acc + table.size, 0)),
            rows: tables.reduce((acc: number, table: TableInfo) => acc + table.row_count, 0),
          });
        }
      } catch (statsError) {
        console.warn('Failed to get table stats, using fallback:', statsError);

        // For new projects, just show placeholder stats
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
  };

  useEffect(() => {
    loadProjectStats();
  }, [config]);

  return {
    projectStats,
    isLoading,
    isError,
    errorMessage,
    refreshStats: loadProjectStats,
  };
}

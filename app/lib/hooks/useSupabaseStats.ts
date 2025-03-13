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

export const useSupabaseStats = () => {
  const [projectStats, setProjectStats] = useState<ProjectStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
  const configRef = useRef(getSupabaseConfig());

  // Update the ref when config changes
  useEffect(() => {
    configRef.current = getSupabaseConfig();
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true);
      setIsError(false);
      setErrorMessage(null);

      const supabase = createSupabaseClient();

      // Try to get stats from the stats endpoint first
      try {
        const { data: stats, error } = await supabase.rpc('get_project_stats');
        if (!error && stats) {
          setProjectStats(stats);
          return;
        }
      } catch (error) {
        console.warn('Failed to fetch stats from RPC:', error);
      }

      // Fallback to direct table queries
      const stats: ProjectStats = {
        total_tables: 0,
        total_rows: 0,
        total_size: '0 MB',
        total_functions: 0,
      };

      try {
        // Get table count
        const { data: tables, error: tablesError } = await supabase
          .from('information_schema.tables')
          .select('count')
          .eq('table_schema', 'public');

        if (!tablesError && tables) {
          stats.total_tables = parseInt(tables[0].count);
        }
      } catch (error) {
        console.warn('Failed to get table count:', error);
      }

      try {
        // Get row count
        const { data: rows, error: rowsError } = await supabase.rpc('get_total_rows');

        if (!rowsError && rows) {
          stats.total_rows = parseInt(rows);
        }
      } catch (error) {
        console.warn('Failed to get row count:', error);
      }

      try {
        // Get database size
        const { data: size, error: sizeError } = await supabase.rpc('get_database_size');

        if (!sizeError && size) {
          stats.total_size = size;
        }
      } catch (error) {
        console.warn('Failed to get database size:', error);
      }

      try {
        // Get function count
        const { data: functions, error: functionsError } = await supabase
          .from('information_schema.routines')
          .select('count')
          .eq('routine_schema', 'public');

        if (!functionsError && functions) {
          stats.total_functions = parseInt(functions[0].count);
        }
      } catch (error) {
        console.warn('Failed to get function count:', error);
      }

      setProjectStats(stats);
    } catch (error) {
      console.error('Failed to fetch project stats:', error);
      setIsError(true);
      setErrorMessage('Failed to load project statistics. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    projectStats,
    isLoading,
    isError,
    errorMessage,
    refreshStats: fetchStats,
  };
};

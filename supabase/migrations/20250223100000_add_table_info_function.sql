-- Create function to get table information
CREATE OR REPLACE FUNCTION public.get_table_info()
RETURNS TABLE (
  table_name text,
  row_count bigint,
  size bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tables.table_name::text,
    (xpath('/row/c/text()', query_to_xml(format('SELECT COUNT(*) AS c FROM %I.%I', table_schema, table_name), FALSE, TRUE, '')))[1]::text::bigint AS row_count,
    pg_total_relation_size(format('%I.%I', table_schema, table_name)::regclass) AS size
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_table_info() TO authenticated; 
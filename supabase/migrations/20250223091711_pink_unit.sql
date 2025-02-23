/*
  # Initial Schema Setup
  
  1. New Tables
    - projects
      - id (uuid, primary key)
      - name (text)
      - description (text)
      - user_id (uuid, references auth.users)
      - created_at (timestamptz)
      - updated_at (timestamptz)
    
    - migrations
      - id (uuid, primary key)
      - name (text)
      - description (text)
      - project_id (uuid, references projects)
      - executed_at (timestamptz)
      - status (text)
      - sql_content (text)
  
  2. Security
    - Enable RLS on all tables
    - Add policies for user data access
*/

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own projects"
  ON projects
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own projects"
  ON projects
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON projects
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create migrations table
CREATE TABLE IF NOT EXISTS migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  project_id uuid NOT NULL REFERENCES projects(id),
  executed_at timestamptz DEFAULT now(),
  status text NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  sql_content text NOT NULL
);

ALTER TABLE migrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read migrations for own projects"
  ON migrations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = migrations.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create migrations for own projects"
  ON migrations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = migrations.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- Create function to get table information
CREATE OR REPLACE FUNCTION get_table_info()
RETURNS TABLE (
  table_name text,
  row_count bigint,
  size bigint
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    tables.table_name::text,
    (xpath('/row/c/text()', query_to_xml(format('SELECT COUNT(*) AS c FROM %I.%I', tables.table_schema, tables.table_name), FALSE, TRUE, '')))[1]::text::bigint AS row_count,
    pg_total_relation_size(format('%I.%I', tables.table_schema, tables.table_name)::regclass) AS size
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';
END;
$$;
export const SQL_MIGRATION_GUIDELINES = `
# SQL Migration Guidelines

1. File Naming
   - Use descriptive names: create_users.sql, add_posts_table.sql
   - No number prefixes (handled automatically)

2. Content Structure
   - Start with markdown summary block
   - List all changes and their purpose
   - Include RLS policies
   - Document constraints and indexes

3. Safety Requirements
   - NEVER use DROP operations
   - ALWAYS use IF EXISTS/IF NOT EXISTS
   - NO destructive column changes
   - NO renaming tables/columns
   - NO explicit transaction control

4. Required Elements
   - Enable RLS for all tables
   - Add appropriate RLS policies
   - Set default values where appropriate
   - Use UUID primary keys

5. Best Practices
   - One migration per logical change
   - Add proper foreign key constraints
   - Include helpful comments
   - Use consistent naming conventions

Example Migration:
/*
  # Create users table
  
  1. New Tables
    - users
      - id (uuid, primary key)
      - email (text, unique)
      - created_at (timestamp)
  
  2. Security
    - Enable RLS
    - Add policy for user data access
*/

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data" 
  ON users
  FOR SELECT 
  TO authenticated
  USING (auth.uid() = id);
`;

export const RLS_POLICY_TEMPLATE = `
-- Enable RLS
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own data
CREATE POLICY "{table_name}_read_own"
ON {table_name}
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to insert their own data
CREATE POLICY "{table_name}_insert_own"
ON {table_name}
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own data
CREATE POLICY "{table_name}_update_own"
ON {table_name}
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own data
CREATE POLICY "{table_name}_delete_own"
ON {table_name}
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
`;

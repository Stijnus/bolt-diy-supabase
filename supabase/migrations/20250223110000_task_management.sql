/*
  # Task Management System Schema
  
  1. New Tables
    - users
      - id (uuid, primary key)
      - email (text, unique)
      - name (text)
      - created_at (timestamptz)
    
    - tasks
      - id (uuid, primary key)
      - title (text)
      - description (text)
      - status (text: pending, in_progress, completed)
      - due_date (timestamptz)
      - user_id (uuid, references users)
      - created_at (timestamptz)
    
    - task_tags
      - id (uuid, primary key)
      - task_id (uuid, references tasks)
      - tag_name (text)
      - created_at (timestamptz)
  
  2. Security
    - Enable RLS on all tables
    - Add policies for user data access
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "users_update_own"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  due_date timestamptz,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_read_own"
  ON tasks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "tasks_insert_own"
  ON tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tasks_update_own"
  ON tasks
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tasks_delete_own"
  ON tasks
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create task_tags table
CREATE TABLE IF NOT EXISTS task_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  tag_name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE task_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_tags_read_own"
  ON task_tags
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.id = task_tags.task_id
    AND tasks.user_id = auth.uid()
  ));

CREATE POLICY "task_tags_insert_own"
  ON task_tags
  FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.id = task_tags.task_id
    AND tasks.user_id = auth.uid()
  ));

CREATE POLICY "task_tags_delete_own"
  ON task_tags
  FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.id = task_tags.task_id
    AND tasks.user_id = auth.uid()
  )); 
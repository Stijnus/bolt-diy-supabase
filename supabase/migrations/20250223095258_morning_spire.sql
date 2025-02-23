/*
  # Add test connection table and function
  
  1. New Tables
    - _test_connection
      - id (uuid, primary key)
      - created_at (timestamp)
  
  2. Security
    - Enable RLS
    - Add policy for connection testing
*/

-- Create test connection table
CREATE TABLE IF NOT EXISTS _test_connection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE _test_connection ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read for connection testing
CREATE POLICY "Allow connection testing"
  ON _test_connection
  FOR SELECT
  TO authenticated
  USING (true);
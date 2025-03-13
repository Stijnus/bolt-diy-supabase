-- Create auth schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS auth;

-- Create users table in auth schema
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    encrypted_password TEXT NOT NULL,
    email_confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create function to get database size
CREATE OR REPLACE FUNCTION get_database_size()
RETURNS TABLE (
    total_size BIGINT,
    table_size BIGINT,
    index_size BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        pg_database_size(current_database()) as total_size,
        COALESCE(SUM(pg_total_relation_size(quote_ident(table_name))), 0) as table_size,
        COALESCE(SUM(pg_indexes_size(quote_ident(table_name))), 0) as index_size
    FROM information_schema.tables
    WHERE table_schema = 'public';
END;
$$;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updating updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

-- Create policy for users to view their own data
CREATE POLICY "Users can view own data" ON auth.users
    FOR SELECT USING (auth.uid() = id);

-- Create policy for users to update their own data
CREATE POLICY "Users can update own data" ON auth.users
    FOR UPDATE USING (auth.uid() = id);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA auth TO postgres, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO postgres;
GRANT SELECT ON auth.users TO anon, authenticated;
GRANT UPDATE ON auth.users TO authenticated;
GRANT EXECUTE ON FUNCTION get_database_size() TO postgres, anon, authenticated; 
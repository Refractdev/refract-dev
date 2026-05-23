-- Refract Supabase Schema
-- Migration from SQLite to PostgreSQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  auth_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'team', 'enterprise')),
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  language TEXT NOT NULL DEFAULT 'en',
  avatar_url TEXT,
  github_installation_id BIGINT,
  github_token TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  storage_id TEXT,
  path TEXT,
  repo TEXT,
  branch TEXT DEFAULT 'main',
  status TEXT DEFAULT 'Not analysed',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_run TIMESTAMPTZ
);

-- Health snapshots
CREATE TABLE IF NOT EXISTS health_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  issue_count INTEGER NOT NULL,
  high INTEGER NOT NULL,
  medium INTEGER NOT NULL,
  low INTEGER NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL
);

-- Project decisions
CREATE TABLE IF NOT EXISTS project_decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  issue_signature TEXT NOT NULL,
  category TEXT NOT NULL,
  file TEXT NOT NULL,
  problem TEXT NOT NULL,
  decision TEXT NOT NULL,
  applied INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL
);

-- Settings (global guidelines)
CREATE TABLE IF NOT EXISTS settings (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- Activity log
CREATE TABLE IF NOT EXISTS activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_project_id ON health_snapshots(project_id);
CREATE INDEX IF NOT EXISTS idx_health_snapshots_timestamp ON health_snapshots(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_project_sig ON project_decisions(project_id, issue_signature);
CREATE INDEX IF NOT EXISTS idx_activity_project_id ON activity(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for projects
CREATE POLICY "Users can view own projects" ON projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" ON projects
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects" ON projects
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for health_snapshots
CREATE POLICY "Users can view own health snapshots" ON health_snapshots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects WHERE projects.id = health_snapshots.project_id AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own health snapshots" ON health_snapshots
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects WHERE projects.id = health_snapshots.project_id AND projects.user_id = auth.uid()
    )
  );

-- RLS Policies for project_decisions
CREATE POLICY "Users can view own decisions" ON project_decisions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects WHERE projects.id = project_decisions.project_id AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own decisions" ON project_decisions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects WHERE projects.id = project_decisions.project_id AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own decisions" ON project_decisions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM projects WHERE projects.id = project_decisions.project_id AND projects.user_id = auth.uid()
    )
  );

-- RLS Policies for settings
CREATE POLICY "Users can view own settings" ON settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can upsert own settings" ON settings
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for activity
CREATE POLICY "Users can view own activity" ON activity
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects WHERE projects.id = activity.project_id AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own activity" ON activity
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects WHERE projects.id = activity.project_id AND projects.user_id = auth.uid()
    )
  );

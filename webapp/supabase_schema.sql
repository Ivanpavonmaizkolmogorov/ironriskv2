-- IronRisk V2 — Supabase Waitlist Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

CREATE TABLE IF NOT EXISTS waitlist (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  source      TEXT DEFAULT 'landing',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (keeps data safe)
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Policy: allow inserts from anon key (the landing page uses this)
CREATE POLICY "Allow anonymous inserts" ON waitlist
  FOR INSERT
  WITH CHECK (true);

-- Policy: allow reading own rows (for duplicate check)
CREATE POLICY "Allow anonymous select" ON waitlist
  FOR SELECT
  USING (true);

-- Index for fast duplicate checks
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);

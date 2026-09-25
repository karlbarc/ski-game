import { createClient } from '../vendor/supabase.js';

export const SUPABASE_URL = 'https://mvhsepsnncfviwizxmcy.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12aHNlcHNubmNmdml3aXp4bWN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MzMyMzgsImV4cCI6MjEwMDAwOTIzOH0.5uU25WrijknHoqNO8O52fh6dEpVL7ETP8yGHDkQbHrc';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
});

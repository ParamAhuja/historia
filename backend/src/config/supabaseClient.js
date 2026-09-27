const { createClient } = require('@supabase/supabase-js');
const env = require('./env');

// Server-side client using the service role key. This bypasses RLS, so this
// key must NEVER be sent to the frontend or committed to source control.
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

module.exports = supabase;

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[WARN] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. Set these in your .env or Render environment.');
}

// Service role key is used because this is a trusted backend (never expose this key to the frontend).
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = supabase;

import { createClient } from '@supabase/supabase-js';

// Este cliente solo debe usarse en el servidor (Server Components o API Routes)
// NUNCA exponer la service role key en el cliente
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseServer = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

if (!supabaseConfigured) {
  // createClient("", "") throws synchronously and takes down the whole
  // import graph before React mounts — even for pages that need no auth,
  // like the marketing homepage. Warn instead of constructing a client;
  // auth.jsx checks supabaseConfigured before touching `supabase`.
  console.error(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. " +
    "Copy .env.example to .env.local and fill in the same Supabase project the MCP server uses. " +
    "Auth is disabled until then."
  );
}

export const supabase = supabaseConfigured ? createClient(url, anonKey) : null;

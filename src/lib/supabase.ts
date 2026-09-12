import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when the build carries a Supabase project, i.e. cloud sync is possible. */
export const cloudEnabled = Boolean(supabaseUrl && supabaseKey);

const flagEnabled = (value: unknown) => value === "1" || value === "true";

/**
 * Sign-in providers and paid plans are only real once the project behind this
 * build has them configured: SMS needs a paid gateway, Apple needs Developer
 * credentials, and plans need a payment channel. An entry point that leads to a
 * provider the project cannot serve is a dead end, so each one stays hidden
 * until its flag is switched on for that deployment.
 */
export const phoneAuthEnabled = cloudEnabled && flagEnabled(import.meta.env.VITE_AUTH_PHONE_ENABLED);
export const appleAuthEnabled = cloudEnabled && flagEnabled(import.meta.env.VITE_AUTH_APPLE_ENABLED);
export const membershipEnabled = cloudEnabled && flagEnabled(import.meta.env.VITE_MEMBERSHIP_ENABLED);

let clientPromise: Promise<SupabaseClient> | null = null;

/**
 * Loads `@supabase/supabase-js` on demand. Local-mode installs never configure a
 * project, so they should not pay ~200 kB for a client they will never call.
 */
export function getSupabase(): Promise<SupabaseClient> | null {
  if (!cloudEnabled) return null;
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(supabaseUrl!, supabaseKey!),
    );
  }
  return clientPromise;
}

export type { SupabaseClient };

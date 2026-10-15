// Supabase configuration (ported 1:1 from legacy app.js)
export const SUPABASE_BASE = 'https://qrzpsvyqiozhygtoklhv.supabase.co';
export const SUPABASE_URL = `${SUPABASE_BASE}/rest/v1`;
export const SUPABASE_AUTH = `${SUPABASE_BASE}/auth/v1`;
export const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyenBzdnlxaW96aHlndG9rbGh2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDQ1MTY4MSwiZXhwIjoyMDkwMDI3NjgxfQ.UNxy_PaglB-lVmOP6Ngl1jtVrkQNJ2My5-JL_VV-Agk';

export const HEADERS: Record<string, string> = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export const AUTH_HEADERS: Record<string, string> = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

/** GET a PostgREST path (e.g. "locations?select=*") and return parsed JSON. */
export async function restGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${path}`);
  return (await res.json()) as T;
}

/** Generic PostgREST write (POST / PATCH / DELETE). */
export async function restWrite<T = any>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/${path}`, {
    method,
    headers: HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      msg = j.message || j.error_description || msg;
    } catch {}
    throw new Error(msg);
  }
  try {
    return (await res.json()) as T;
  } catch {
    return undefined as T;
  }
}

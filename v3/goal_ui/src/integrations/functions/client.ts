/**
 * Browser-side fetch client for the LOCAL_FN / GCF stack.
 *
 * Steps 19 + 21a/b (ADR-093). All goal_ui workflows route through
 * here — fetches the Hono dev server (port 8787) or the GCF
 * deployment, URL set via `VITE_FUNCTIONS_BASE_URL`. Returns a
 * `{data, error}` envelope.
 */

import { FUNCTIONS_BASE_URL, FUNCTIONS_PUBLIC_TOKEN } from '@/lib/featureFlags';

export interface FunctionResult<T> {
  data: T | null;
  error: { message: string; status: number } | null;
}

export async function invokeFunction<T = unknown>(
  name: string,
  body: unknown,
): Promise<FunctionResult<T>> {
  const url = `${FUNCTIONS_BASE_URL}/functions/v1/${name}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RuFlo-Token': FUNCTIONS_PUBLIC_TOKEN,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'network error', status: 0 },
    };
  }

  let parsed: unknown = null;
  try {
    parsed = await resp.json();
  } catch {
    // Non-JSON response — treat as transport error
    return {
      data: null,
      error: { message: `unparseable response (status ${resp.status})`, status: resp.status },
    };
  }

  if (!resp.ok) {
    const msg = (parsed && typeof parsed === 'object' && 'error' in parsed)
      ? String((parsed as { error: unknown }).error)
      : `function error (status ${resp.status})`;
    return { data: null, error: { message: msg, status: resp.status } };
  }

  return { data: parsed as T, error: null };
}

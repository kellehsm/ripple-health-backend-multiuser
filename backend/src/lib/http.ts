const DEFAULT_TIMEOUT_MS = 8000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const signal = init.signal
    ? AbortSignal.any([init.signal as AbortSignal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);
  return fetch(url, { ...init, signal });
}

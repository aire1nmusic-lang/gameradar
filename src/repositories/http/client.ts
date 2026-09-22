/** Minimal JSON client for /api/v1 — the same rules as the HTTP repositories. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body?: unknown,
  ) {
    super(message)
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch('/api/v1' + path, {
      credentials: 'same-origin',
      ...init,
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    })
  } catch {
    throw new ApiRequestError(0, 'network', 'API недоступен. Проверьте подключение.')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiRequestError(response.status, body?.error?.code ?? 'http_error', body?.error?.message ?? 'Не удалось выполнить запрос', body)
  }
  return body as T
}

export const apiSend = <T>(path: string, input: unknown, method = 'POST') => apiRequest<T>(path, { method, body: JSON.stringify(input) })

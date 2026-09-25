/**
 * API errors carry a Russian `message` ready to show and a stable `code`
 * (`email_unverified`, `last_login_method`, …) the UI may branch on.
 */
export function errorMessage(error: unknown, fallback = 'Не удалось выполнить запрос'): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : undefined
}

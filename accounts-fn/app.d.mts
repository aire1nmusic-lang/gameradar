import type { Hono } from 'hono'
export function createAccountsApp(options: {
  store: unknown
  config: { origin: string; environment: string; rateKey: string; mailEnabled: boolean; registrationOpen: boolean; emergencyMode?: boolean; oauth?: Record<string, string | undefined> }
  passwords: { hash(password: string): Promise<string>; verify(password: string, stored: string): Promise<boolean> }
  sendLinkMail(to: string, purpose: string, link: string): Promise<void>
  sendNotice?(to: string, kind: 'EXISTS' | 'NO_ACCOUNT', accountUrl: string): Promise<void>
  clock?: () => Date
}): Hono

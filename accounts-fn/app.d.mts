import type { Hono } from 'hono'
export function createAccountsApp(options: {
  store: unknown
  config: { origin: string; environment: string; rateKey: string; mailEnabled: boolean; registrationOpen: boolean; emergencyMode?: boolean; oauth?: Record<string, string | undefined>; adminEmails?: string
    turnstileSecret?: string; turnstileSiteKey?: string; contactEmail?: string }
  passwords: { hash(password: string): Promise<string>; verify(password: string, stored: string): Promise<boolean> }
  sendLinkMail(to: string, purpose: string, link: string): Promise<void>
  sendNotice?(to: string, kind: 'EXISTS' | 'NO_ACCOUNT', accountUrl: string): Promise<void>
  clock?: () => Date
  /** D1 binding for votes, Claims, owner edits and moderation (community.mjs); omitted = accounts only. */
  community?: { db: unknown; captchaVerify?(token: string, ip: string): Promise<unknown>; proofCheck?(proof: unknown): Promise<boolean> } | null
}): Hono

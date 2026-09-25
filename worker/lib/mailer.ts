/**
 * Transactional mail (confirmation and sign-in codes).
 *
 * MAIL_DRIVER picks the service; each needs its API key and MAIL_FROM
 * ("GameScout <no-reply@gamescout.online>", a domain verified at the service):
 *   resend     — RESEND_API_KEY      (https://resend.com)
 *   unisender  — UNISENDER_API_KEY   (Unisender Go, https://go.unisender.ru)
 *   log        — development only: the message goes to the Worker log and to
 *                an in-memory outbox tests can read; never sends anything.
 * Without a configured driver, email sign-in is off (`emailLogin: false`).
 */
import type { Env } from './core.ts'

export type Mail = { to: string; subject: string; text: string; html: string }

/** Last messages of the log driver, newest first (development and tests). */
export const devOutbox: Array<Mail & { at: string }> = []

export function mailEnabled(env: Env): boolean {
  switch (env.MAIL_DRIVER) {
    case 'resend': return !!env.RESEND_API_KEY && !!env.MAIL_FROM
    case 'unisender': return !!env.UNISENDER_API_KEY && !!env.MAIL_FROM
    case 'log': return env.ENVIRONMENT === 'development'
    default: return false
  }
}

function parseFrom(from: string): { email: string; name?: string } {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  return match ? { name: match[1] || undefined, email: match[2] } : { email: from.trim() }
}

export async function sendMail(env: Env, mail: Mail): Promise<void> {
  if (!mailEnabled(env)) throw new Error('mail_not_configured')
  if (env.MAIL_DRIVER === 'log') {
    devOutbox.unshift({ ...mail, at: new Date().toISOString() })
    devOutbox.length = Math.min(devOutbox.length, 50)
    console.log('dev_mail', mail.to, mail.subject, mail.text)
    return
  }
  let response: Response
  if (env.MAIL_DRIVER === 'resend') {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
      signal: AbortSignal.timeout(10_000),
    })
  } else {
    const from = parseFrom(env.MAIL_FROM!)
    response = await fetch('https://go1.unisender.ru/ru/transactional/api/v1/email/send.json', {
      method: 'POST',
      headers: { 'X-API-KEY': env.UNISENDER_API_KEY!, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        message: {
          recipients: [{ email: mail.to }],
          subject: mail.subject,
          from_email: from.email,
          from_name: from.name ?? 'GameScout',
          body: { html: mail.html, plaintext: mail.text },
          track_links: 0,
          track_read: 0,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    })
  }
  if (!response.ok) {
    // The provider's answer stays in the log; the person sees a generic error.
    console.error('mail_send_failed', env.MAIL_DRIVER, response.status, (await response.text()).slice(0, 300))
    throw new Error('mail_send_failed')
  }
}

const PURPOSE_TEXT: Record<string, { subject: string; lead: string }> = {
  REGISTER: { subject: 'Код подтверждения регистрации', lead: 'Чтобы закончить регистрацию на GameScout, введите этот код:' },
  LOGIN: { subject: 'Код для входа', lead: 'Код для входа в GameScout:' },
  RESET: { subject: 'Код для смены пароля', lead: 'Чтобы задать новый пароль на GameScout, введите этот код:' },
  VERIFY: { subject: 'Подтверждение почты', lead: 'Чтобы подтвердить почту на GameScout, введите этот код:' },
}

/** The one letter GameScout sends: a 6-digit code, plain and readable in any client. */
export function codeMail(to: string, purpose: string, code: string, minutes: number): Mail {
  const t = PURPOSE_TEXT[purpose] ?? PURPOSE_TEXT.LOGIN
  const text = `${t.lead}\n\n${code}\n\nКод действует ${minutes} минут. Если вы ничего не запрашивали, просто удалите это письмо.\n\nGameScout — gamescout.online`
  const html = `<!doctype html><html lang="ru"><body style="margin:0;background:#0d1520;font-family:Arial,Helvetica,sans-serif;color:#e8eaf0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d1520;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#141a24;border-radius:14px;padding:28px">
<tr><td style="font-size:20px;font-weight:bold;color:#ffffff">Game<span style="color:#34e6f5">Scout</span></td></tr>
<tr><td style="padding-top:18px;font-size:15px;line-height:22px;color:#c9ced8">${t.lead}</td></tr>
<tr><td style="padding:18px 0;font-size:34px;letter-spacing:8px;font-weight:bold;color:#ffffff">${code}</td></tr>
<tr><td style="font-size:13px;line-height:20px;color:#8a93a3">Код действует ${minutes} минут. Если вы ничего не запрашивали, просто удалите это письмо.</td></tr>
</table></td></tr></table></body></html>`
  return { to, subject: `${t.subject}: ${code}`, text, html }
}

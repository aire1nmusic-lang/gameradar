export const CRLF: string
export function buildMessage(mail: { from: string; to: string; subject: string; text: string; html: string }, now?: Date): { sender: string; data: string }

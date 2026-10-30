// Minimal typing of the Workers TCP sockets module used by lib/smtp-socket.ts.
declare module 'cloudflare:sockets' {
  export interface Socket {
    readable: ReadableStream<Uint8Array>
    writable: WritableStream<Uint8Array>
    closed: Promise<void>
    close(): Promise<void>
  }
  export function connect(address: { hostname: string; port: number }, options?: { secureTransport?: 'off' | 'on' | 'starttls'; allowHalfOpen?: boolean }): Socket
}

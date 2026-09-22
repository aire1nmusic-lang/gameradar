/**
 * Minimal ambient declarations for the Workers runtime.
 *
 * Declared locally instead of pulling @cloudflare/workers-types so the worker
 * build stays independent of the frontend's DOM lib and of a heavy dependency
 * we only need for two interfaces.
 */

interface D1Meta {
  duration: number
  rows_read: number
  rows_written: number
  last_row_id: number
  changes: number
}

interface D1Result<T = unknown> {
  results: T[]
  success: boolean
  meta: D1Meta
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(column?: string): Promise<T | null>
  run<T = unknown>(): Promise<D1Result<T>>
  all<T = unknown>(): Promise<D1Result<T>>
}

interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
  exec(query: string): Promise<{ count: number; duration: number }>
}

declare module 'cloudflare:sockets' {
  export interface Socket {
    readable: ReadableStream<Uint8Array>
    writable: WritableStream<Uint8Array>
    closed: Promise<void>
    close(): Promise<void>
    startTls(): Socket
  }
  export function connect(
    address: string | { hostname: string; port: number },
    options?: { secureTransport?: 'off' | 'on' | 'starttls'; allowHalfOpen?: boolean },
  ): Socket
}

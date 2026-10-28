export interface D1AccountsStore {
  dailyCount(day: string): Promise<number>
  dailyHit(day: string): Promise<number>
  cleanup(now: Date): Promise<void>
  [method: string]: unknown
}
export function d1Store(db: unknown): D1AccountsStore

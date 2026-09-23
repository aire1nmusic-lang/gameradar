/**
 * Outbound network for one invocation: every fetch()/connect() is counted
 * against one SubrequestBudget, and DNS/SRV answers are cached for the whole
 * invocation so repeated hosts cost nothing.
 */
import { resolveMinecraftSrv, resolvePublicHost } from '../adapters/network.ts'
import { cloudflareConnect, type TcpConnector } from '../adapters/tcp.ts'
import { SubrequestBudget } from './budget.ts'
import type { Env } from './core.ts'

/** Subrequests one invocation may spend (Cloudflare free plan caps at 50). */
export function subrequestBudget(env: Env): number {
  const value = Number(env.MONITOR_SUBREQUESTS ?? 45)
  return Number.isInteger(value) && value >= 10 && value <= 950 ? value : 45
}

export function budgetedNetwork(budget: SubrequestBudget) {
  const fetcher: typeof fetch = (input, init) => {
    budget.take()
    return fetch(input, init)
  }
  const connect: TcpConnector = (host, port) => {
    budget.take()
    return cloudflareConnect(host, port)
  }
  const dns = new Map<string, Promise<string[]>>()
  const srv = new Map<string, Promise<{ host: string; port: number } | undefined>>()
  return {
    fetcher,
    connect,
    resolveHost: (host: string) => {
      if (!dns.has(host)) dns.set(host, resolvePublicHost(host, { fetcher }).then(address => [address]))
      return dns.get(host)!
    },
    resolveSrv: (host: string) => {
      if (!srv.has(host)) srv.set(host, resolveMinecraftSrv(host, { fetcher }))
      return srv.get(host)!
    },
  }
}

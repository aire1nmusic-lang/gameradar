/**
 * Votifier delivery — Minecraft only.
 *
 * A vote whose server chose VOTIFIER is sent to the owner's NuVotifier (v2,
 * HMAC token) right after it is cast, and retried by the cron a few times
 * within a day when the server was unreachable. Each send is leased first, so
 * two senders never race on one vote; a vote is marked delivered only after
 * NuVotifier acknowledged it.
 *
 * Delivery is at-least-once: if the acknowledgement is lost after NuVotifier
 * accepted the vote, a retry may reach the server again. Pull API votes are a
 * separate queue and never take this path.
 */
import { deliverVotifierV2 } from '../delivery/votifier-v2.ts'
import { AdapterError } from '../adapters/network.ts'
import type { TcpOptions } from '../adapters/tcp.ts'
import type { Store } from './store.ts'
import { SubrequestBudget } from './budget.ts'
import { budgetedNetwork } from './network.ts'

export const VOTIFIER_MAX_ATTEMPTS = 3
/** DNS (A + AAAA) + one TCP connection. */
const DELIVERY_RESERVE = 3

export async function deliverVotifierVotes(
  s: Store,
  budget: SubrequestBudget,
  options: { limit: number; voteId?: string; loopbackHosts?: string[] },
): Promise<{ delivered: number; failed: number }> {
  const due = await s.votifierDue(options.limit, options.voteId)
  const network = budgetedNetwork(budget)
  let delivered = 0
  let failed = 0
  for (const vote of due) {
    if (!budget.reserve(DELIVERY_RESERVE)) break
    try {
      // The lease is the concurrency guard: only one sender gets the row.
      if (!(await s.leaseVoteDelivery(vote.id))) continue
      const tcp: TcpOptions = { ...network, timeoutMs: 6000, allowLoopback: (options.loopbackHosts ?? []).includes(String(vote.votifier_host)) }
      await deliverVotifierV2(
        { host: vote.votifier_host, port: Number(vote.votifier_port), token: vote.votifier_token },
        // The voter's address is never shared with game servers.
        { username: vote.nickname, address: '0.0.0.0', timestamp: Date.parse(vote.created_at), serviceName: 'GameScout' },
        tcp,
      )
      await s.markVoteDelivered(vote.id)
      delivered++
    } catch (error) {
      await s.markVoteDeliveryFailed(vote.id, error instanceof AdapterError ? error.code : 'delivery_failed')
      failed++
    } finally {
      budget.release(DELIVERY_RESERVE)
    }
  }
  return { delivered, failed }
}

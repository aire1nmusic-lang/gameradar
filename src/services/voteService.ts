import { repo } from '@/repositories'
import { VoteDelivery } from '@/models'

/**
 * Voting — the growth engine.
 *
 * A vote is worth something only if the player is rewarded in game, so the
 * delivery contract matters as much as the vote itself:
 *
 *   PULL_API  — the server polls GET /api/v1/votes/pending with its API key.
 *               Works for every game, needs no open ports. Default.
 *   VOTIFIER  — Minecraft de-facto standard; owners already run the plugin.
 *   WEBHOOK   — signed POST to an endpoint the owner provides.
 */

export function castVote(serverId: string, nickname: string, userId?: string) {
  return repo.votes.cast({ serverId, nickname, userId })
}

export function voteEligibility(serverId: string, voterKey: string) {
  return repo.votes.eligibility(serverId, voterKey)
}

export function recentVotes(serverId: string, limit = 10) {
  return repo.votes.recent(serverId, limit)
}

export function voteIntegration(serverId: string) {
  return repo.votes.integration(serverId)
}

export const DELIVERY_LABEL: Record<VoteDelivery, string> = {
  [VoteDelivery.Pull]: 'Pull API (рекомендуется)',
  [VoteDelivery.Votifier]: 'Votifier / NuVotifier',
  [VoteDelivery.Webhook]: 'Webhook',
}

/** Games where a ready-made integration already exists on the server side. */
export const NATIVE_DELIVERY: Record<string, VoteDelivery> = {
  minecraft: VoteDelivery.Votifier,
  gtarp: VoteDelivery.Pull,
  lineage2: VoteDelivery.Pull,
}

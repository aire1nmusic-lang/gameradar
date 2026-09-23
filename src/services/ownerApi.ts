/**
 * Owner-side use-cases on top of the real API: claims, card statistics,
 * votes, vote delivery settings and monitoring.
 *
 * Every number here is stored by the backend; nothing is simulated.
 */
import { apiRequest, apiSend } from '@/repositories/http/client'
import type { ServerClaim, VoteIntegration } from '@/models'

export interface ServerStats {
  since: string
  views: { day: string; value: number }[]
  totals: { views: number; websiteClicks: number; playClicks: number; voteClicks: number; claimStarts: number }
  votes: { total: number; pending: number; claimed: number; inRange: number }
  sources: { source: string; count: number }[]
}

export interface OwnerVote {
  id: string
  nickname: string
  status: 'PENDING' | 'CLAIMED' | 'REJECTED'
  delivery: string
  createdAt: string
  claimedAt?: string
}

export interface MonitoringSettings {
  serverId: string
  method: 'GAME_PROTOCOL' | 'SERVER_API' | 'LOGIN_SERVER' | 'AGENT' | 'OWNER_SUBMITTED'
  host?: string
  port?: number
  apiUrl?: string
  enabled: boolean
}

const id = (value: string) => encodeURIComponent(value)

export const ownerApi = {
  claims: () => apiRequest<ServerClaim[]>('/owners/me/claims'),
  createClaim: (serverId: string) => apiSend<ServerClaim>('/claims', { serverId, method: 'SITE_FILE' }),
  claim: (claimId: string) => apiRequest<ServerClaim>('/claims/' + id(claimId)),
  verifyClaim: (claimId: string) => apiSend<ServerClaim>('/claims/' + id(claimId) + '/verify', {}),

  stats: (serverId: string, range: '7d' | '30d' = '30d') => apiRequest<ServerStats>(`/servers/${id(serverId)}/stats?range=${range}`),
  votes: (serverId: string) => apiRequest<OwnerVote[]>(`/servers/${id(serverId)}/votes`),

  integration: (serverId: string) => apiRequest<VoteIntegration>(`/servers/${id(serverId)}/vote-integration`),
  updateIntegration: (
    serverId: string,
    input: { rewardTitle?: string; rewardDescription?: string; cooldownHours?: number; delivery?: string; votifierHost?: string; votifierPort?: number; votifierToken?: string },
  ) =>
    apiSend<VoteIntegration>(`/servers/${id(serverId)}/vote-integration`, input, 'PATCH'),
  rotateApiKey: (serverId: string) => apiSend<{ apiKey: string }>(`/servers/${id(serverId)}/api-key`, {}),

  monitoring: (serverId: string) => apiRequest<MonitoringSettings>(`/servers/${id(serverId)}/monitoring`),
  updateMonitoring: (serverId: string, input: { method: string; host?: string; port?: number; apiUrl?: string; enabled?: boolean }) =>
    apiSend<MonitoringSettings>(`/servers/${id(serverId)}/monitoring`, input, 'PATCH'),
}

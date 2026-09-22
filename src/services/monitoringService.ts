import { OnlineStatus, ProbeMethod, type GameServer, type OnlineData } from '@/models'

/**
 * What a status means, in one place.
 *
 * The whole product promise lives here: which numbers we stand behind, which
 * ones we only pass through, and which ones we refuse to rank.
 */

/** GameScout measured this itself. */
export function isTrusted(status: OnlineStatus): boolean {
  return status === OnlineStatus.Verified
}

/** The server answered us, even if the number is its own. */
export function isReachable(status: OnlineStatus): boolean {
  return status === OnlineStatus.Verified || status === OnlineStatus.Live
}

/** Counted in ratings and totals at all. */
export function isRankable(status: OnlineStatus): boolean {
  return status !== OnlineStatus.Pending && status !== OnlineStatus.Anomaly
}

/** Whether a player count should be printed as a number. */
export function hasNumber(status: OnlineStatus): boolean {
  return status !== OnlineStatus.Pending
}

/** How much a status is worth when scoring a server. */
export const TRUST_WEIGHT: Record<OnlineStatus, number> = {
  [OnlineStatus.Verified]: 1,
  [OnlineStatus.Live]: 0.6,
  [OnlineStatus.OwnerReported]: 0.25,
  [OnlineStatus.Checking]: 0.25,
  [OnlineStatus.Pending]: 0,
  [OnlineStatus.Anomaly]: 0,
  [OnlineStatus.Offline]: 0,
}

/** Which probe each game supports today — drives the /add-server wizard. */
export const GAME_PROBES: Record<string, { method: ProbeMethod; label: string; best: OnlineStatus }[]> = {
  minecraft: [
    { method: ProbeMethod.GameProtocol, label: 'Server List Ping (порт 25565)', best: OnlineStatus.Verified },
    { method: ProbeMethod.Agent, label: 'Плагин GameScout Agent', best: OnlineStatus.Verified },
  ],
  gtarp: [
    { method: ProbeMethod.ServerApi, label: 'FiveM /players.json', best: OnlineStatus.Verified },
    { method: ProbeMethod.Agent, label: 'Resource GameScout Agent', best: OnlineStatus.Verified },
  ],
  lineage2: [
    // L2 exposes server load, not an exact player count — Verified needs the agent.
    { method: ProbeMethod.LoginServer, label: 'Логин-сервер (статус и загрузка)', best: OnlineStatus.Live },
    { method: ProbeMethod.Agent, label: 'GameScout Agent на сервере', best: OnlineStatus.Verified },
  ],
  rust: [{ method: ProbeMethod.GameProtocol, label: 'Server query (A2S)', best: OnlineStatus.Verified }],
  cs2: [{ method: ProbeMethod.GameProtocol, label: 'Server query (A2S)', best: OnlineStatus.Verified }],
  dayz: [{ method: ProbeMethod.GameProtocol, label: 'Server query (A2S)', best: OnlineStatus.Verified }],
}

/** Best status a game can reach without owner cooperation. */
export function bestAutomaticStatus(gameId: string): OnlineStatus {
  const probes = GAME_PROBES[gameId]
  if (!probes?.length) return OnlineStatus.OwnerReported
  return probes.some((probe) => probe.method !== ProbeMethod.Agent && probe.best === OnlineStatus.Verified)
    ? OnlineStatus.Verified
    : OnlineStatus.Live
}

export const PROBE_LABEL: Record<ProbeMethod, string> = {
  [ProbeMethod.GameProtocol]: 'Прямой игровой протокол',
  [ProbeMethod.ServerApi]: 'Официальный API платформы',
  [ProbeMethod.Agent]: 'GameScout Agent',
  [ProbeMethod.LoginServer]: 'Логин-сервер игры',
  [ProbeMethod.OwnerSubmitted]: 'Данные владельца',
}

export function probeLabel(online: OnlineData): string {
  return PROBE_LABEL[online.method] ?? online.source
}

/** Fill ratio, guarded against servers that never published a cap. */
export function capacityOf(server: GameServer): number {
  if (!server.online.max) return 0
  return Math.min(100, (server.online.current / server.online.max) * 100)
}

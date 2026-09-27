import type {
  AdProduct,
  Advertisement,
  AdSlot,
  BoostOrder,
  BoostPackage,
  Chronicle,
  Game,
  GameServer,
  Owner,
  OwnerProject,
  OnlineSample,
  Page,
  RankedServer,
  ServerClaim,
  ServerQuery,
  User,
  Vote,
  VoteIntegration,
} from '@/models'

/**
 * Repository contracts — the only way the app reaches data.
 *
 * Every method is async on purpose: today they resolve from in-memory
 * fixtures, tomorrow from `fetch('/api/v1/...')` against Workers + Postgres.
 * Swapping one for the other must not touch a single component.
 */

export interface GameRepository {
  list(): Promise<Game[]>
  byId(id: string): Promise<Game | undefined>
  bySlug(slug: string): Promise<Game | undefined>
  chronicles(gameId: string): Promise<Chronicle[]>
}

export interface ServerRepository {
  query(query: ServerQuery): Promise<Page<GameServer>>
  byId(id: string): Promise<GameServer | undefined>
  bySlug(slug: string): Promise<GameServer | undefined>
  similar(slug: string, limit?: number): Promise<GameServer[]>
  /** distinct filter values, computed over the whole catalogue */
  facets(gameId?: string): Promise<{
    versions: string[]
    modes: string[]
    regions: string[]
    languages: string[]
  }>
  /** submits a new card; it lands in PENDING_MODERATION */
  submit(input: Partial<GameServer>): Promise<GameServer>
  /** headline counters for the home page */
  platformStats(): Promise<PlatformStats>
  onlineHistory(serverId: string, range?: string): Promise<OnlineSample[]>
}

export interface PlatformStats {
  servers: number
  playersOnline: number
  verifiedServers: number
  checksPerMinute: number
  /** servers whose online was observed within the freshness window, from any source */
  measuredServers?: number
  games: number
}

export interface RatingRepository {
  /** sponsored-aware order — boosts included, always labelled in the UI */
  leaderboard(gameId?: string, chronicleId?: string): Promise<RankedServer[]>
  /** independent order — boosts excluded, anomalies held out */
  organic(gameId?: string, chronicleId?: string): Promise<RankedServer[]>
  positionOf(slug: string, gameId?: string): Promise<RankedServer | undefined>
}

export interface VoteRepository {
  /** records a vote; anti-fraud and cooldown live behind this call */
  cast(input: { serverId: string; nickname: string; userId?: string }): Promise<Vote>
  /** whether this voter may vote for this server right now */
  eligibility(serverId: string, voterKey: string): Promise<{ allowed: boolean; nextAllowedAt?: string }>
  recent(serverId: string, limit?: number): Promise<Vote[]>
  countFor(serverId: string, sinceDays?: number): Promise<number>
  /** owner-side integration settings (pull API key, Votifier, webhook) */
  integration(serverId: string): Promise<VoteIntegration | undefined>
  reward(serverId: string): Promise<VoteIntegration>
}

export interface BoostRepository {
  packages(): Promise<BoostPackage[]>
  activeFor(serverId: string): Promise<number>
  forecast(
    slug: string,
    extraBoosts: number,
    gameId?: string,
  ): Promise<{
    currentRank: number
    projectedRank: number
    currentTotal: number
    projectedTotal: number
    toNext: number
    toTop10: number
    toTop3: number
    toTop1: number
    overtakes: number
  }>
  createOrder(input: { serverId: string; packageId: string; ownerId: string }): Promise<BoostOrder>
}

export interface AdRepository {
  forSlot(slot: AdSlot, gameId?: string): Promise<Advertisement | undefined>
  products(): Promise<AdProduct[]>
}

export interface OwnerRepository {
  verifyClaim(id: string): Promise<ServerClaim>
  claimById(id: string): Promise<ServerClaim>
  updateServer(id: string, input: Partial<GameServer>): Promise<GameServer>
  updateIntegration(id: string, input: Partial<VoteIntegration>): Promise<VoteIntegration>
  rotateApiKey(id: string): Promise<{ apiKey: string }>

  current(): Promise<Owner | undefined>
  serversOf(ownerId: string): Promise<GameServer[]>
  /** per-card analytics shown in the dashboard */
  analytics(ownerId: string): Promise<OwnerProject[]>
  claim(input: { serverId: string; userId: string; method: ServerClaim['method'] }): Promise<ServerClaim>
  claims(userId: string): Promise<ServerClaim[]>
}

export interface UserRepository {
  session(): Promise<{ user: User | null; devAuthEnabled: boolean; providers?: string[]; privateCore?: boolean }>
  login(input: { displayName: string; secret: string }): Promise<unknown>
  logout(): Promise<unknown>

  current(): Promise<User | undefined>
}

/** Everything the app can reach, resolved once at boot. */
export interface Repositories {
  games: GameRepository
  servers: ServerRepository
  rating: RatingRepository
  votes: VoteRepository
  boosts: BoostRepository
  ads: AdRepository
  owners: OwnerRepository
  users: UserRepository
}

import type {
  AdminClaim,
  AdminLogo,
  AdminOverview,
  AdminServerItem,
  AdminUser,
  AdProduct,
  Advertisement,
  AdSlot,
  BoostOrder,
  BoostPackage,
  Chronicle,
  Game,
  GameServer,
  LoginProvider,
  LogoStatus,
  Owner,
  OwnerProject,
  OnlineSample,
  Page,
  RankedServer,
  ServerClaim,
  ServerLogoState,
  ServerQuery,
  User,
  UserRole,
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

/** `/auth/me`: who is signed in and which ways to sign in this environment offers. */
export interface AuthSession {
  user: User | null
  /** only the configured providers */
  providers: LoginProvider[]
  /** false until mail delivery is configured */
  emailLogin: boolean
  devAuthEnabled: boolean
}

/** A 6-digit code was mailed. */
export interface CodeSent {
  sent: true
  email?: string
  expiresInSec?: number
}

export interface UserRepository {
  session(): Promise<AuthSession>
  /** local development sign-in (POST /auth/dev) */
  login(input: { displayName: string; secret: string }): Promise<unknown>
  logout(): Promise<unknown>

  current(): Promise<User | undefined>
}

/** Sign-in and registration (docs/accounts-api.md → Session and sign-in). */
export interface AuthRepository {
  me(): Promise<AuthSession>
  register(input: { email: string; password: string; displayName: string }): Promise<CodeSent>
  confirmRegistration(input: { email: string; code: string }): Promise<{ user: User }>
  /** 403 `email_unverified` means a confirmation code was mailed */
  login(input: { email: string; password: string }): Promise<{ user: User }>
  requestCode(input: { email: string; purpose: 'login' | 'reset' }): Promise<CodeSent>
  verifyCode(input: { email: string; code: string }): Promise<{ user: User }>
  resetPassword(input: { email: string; code: string; password: string }): Promise<{ user: User }>
  logout(): Promise<unknown>
  /** full-page URL that starts the provider flow; `link` attaches it to the signed-in user */
  providerUrl(provider: LoginProvider, options?: { next?: string; link?: boolean }): string
}

/** The signed-in person's own account (docs/accounts-api.md → Account). */
export interface AccountRepository {
  updateProfile(input: { displayName: string }): Promise<{ user: User }>
  changePassword(input: { currentPassword?: string; newPassword: string }): Promise<{ user: User }>
  /** 409 `last_login_method` when it is the only way to sign in */
  unlinkIdentity(provider: LoginProvider): Promise<{ user: User }>
}

/** Server logos uploaded by verified owners; shown after an admin approves them. */
export interface LogoRepository {
  upload(serverId: string, image: Blob): Promise<{ logo: { id: string; status: LogoStatus; createdAt: string } }>
  status(serverId: string): Promise<ServerLogoState>
}

/** Moderation for accounts with the ADMIN role. */
export interface AdminRepository {
  overview(): Promise<AdminOverview>
  logos(status?: LogoStatus): Promise<AdminLogo[]>
  /** image bytes of a logo in any status */
  logoImageUrl(id: string): string
  approveLogo(id: string): Promise<{ ok: true }>
  rejectLogo(id: string, reason: string): Promise<{ ok: true }>
  /** `PENDING` (the default) lists cards waiting for moderation */
  servers(status?: 'PENDING'): Promise<AdminServerItem[]>
  publishServer(id: string): Promise<GameServer>
  rejectServer(id: string, reason: string): Promise<{ ok: true }>
  claims(status?: ServerClaim['status']): Promise<AdminClaim[]>
  users(query?: string): Promise<AdminUser[]>
  setRoles(userId: string, roles: UserRole[]): Promise<{ ok: true }>
  ban(userId: string, banned: boolean): Promise<{ ok: true }>
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
  auth: AuthRepository
  account: AccountRepository
  logos: LogoRepository
  admin: AdminRepository
}

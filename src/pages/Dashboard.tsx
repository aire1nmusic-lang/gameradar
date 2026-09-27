import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Bell, CheckCircle2, Copy, ExternalLink, Info, KeyRound, LogIn, Plus, Radar, RefreshCw, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate, formatNumber, formatPlayers, formatRelativeDays, formatSlots, formatTime } from '@/lib/format'
import type { GameServer, ServerClaim } from '@/models'
import { alertsFor } from '@/services/ownerAlerts'
import { ownerApi, type MonitoringSettings } from '@/services/ownerApi'
import { useAsync } from '@/hooks/data'
import { useAuth } from '@/hooks/useAuth'
import { repo } from '@/repositories'
import { getGame } from '@/data/games'
import { Container } from '@/components/layout/Container'
import { AuthModal } from '@/components/layout/AuthModal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ServerLogo } from '@/components/ui/ServerLogo'
import { Field, Input, Segmented, Select, Textarea } from '@/components/ui/controls'
import { EmptyState, Notice, Skeleton } from '@/components/ui/feedback'
import { StatusBadge, VerifiedLine } from '@/components/trust/status'
import { BarSeries } from '@/components/charts/AreaChart'
import { TrustPanel } from '@/components/profile/TrustPanel'
import { useSeo } from '@/lib/seo'

const MODERATION_LABEL: Record<string, string> = {
  PUBLISHED: 'Опубликована',
  PENDING_MODERATION: 'На модерации',
  DRAFT: 'Черновик',
  REJECTED: 'Отклонена',
  ARCHIVED: 'Скрыта',
}

const CLAIM_LABEL: Record<string, [string, 'signal' | 'warn' | 'danger']> = {
  VERIFIED: ['подтверждено', 'signal'],
  PENDING: ['ждёт проверки файла', 'warn'],
  REJECTED: ['отклонено', 'danger'],
}

/**
 * Owner dashboard — every number is stored by the backend: card events,
 * votes, delivery settings and monitoring. Nothing is simulated; a metric that
 * is not collected is not shown.
 */
export default function Dashboard() {
  useSeo({ title: 'Кабинет владельца', noindex: true })
  const auth = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const servers = useAsync(() => (auth.user && !auth.privateCore ? repo.owners.serversOf(auth.user.id) : Promise.resolve([] as GameServer[])), [auth.user?.id,auth.privateCore])
  const claims = useAsync(() => (auth.user && !auth.privateCore ? ownerApi.claims() : Promise.resolve([] as ServerClaim[])), [auth.user?.id,auth.privateCore])
  const [selected, setSelected] = useState<string | undefined>()

  if(auth.privateCore) return <Navigate to="/account" replace />

  if (auth.loading || (auth.user && servers.loading && !servers.data)) {
    return (
      <Container className="py-24">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64 rounded" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 rounded-xl" />
            ))}
          </div>
        </div>
      </Container>
    )
  }

  if (!auth.user) {
    return (
      <Container className="py-24">
        <EmptyState
          title="Кабинет владельца"
          description="Войдите, чтобы увидеть свои серверы, подтверждения владения, голоса и мониторинг."
        />
        <div className="mt-6 flex justify-center">
          <Button variant="primary" icon={<LogIn size={15} />} onClick={() => setAuthOpen(true)}>
            Войти
          </Button>
        </div>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      </Container>
    )
  }

  const list = servers.data ?? []
  const server = list.find(item => item.id === selected) ?? list[0]
  const pendingClaims = (claims.data ?? []).filter(claim => claim.status === 'PENDING')

  return (
    <div className="pb-16">
      <Container className="pt-8 lg:pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 text-[11px] font-medium tracking-[0.14em] text-ink-400 uppercase">Кабинет владельца</div>
            <h1 className="text-[26px] leading-tight sm:text-[32px]">Ваши серверы</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button to="/add-server" variant="outline" icon={<Plus size={15} />}>
              Добавить сервер
            </Button>
            {server && (
              <Button to={`/server/${server.slug}`} variant="secondary" icon={<ExternalLink size={15} />}>
                Открыть карточку
              </Button>
            )}
          </div>
        </div>

        {pendingClaims.length > 0 && (
          <Notice tone="warn" className="mt-5" title="Незавершённые подтверждения">
            {pendingClaims.length === 1 ? 'Одна заявка ждёт' : `${pendingClaims.length} заявки ждут`} файла на сайте проекта.
            Откройте карточку сервера и нажмите «Это мой сервер», чтобы продолжить.
          </Notice>
        )}

        {!server ? (
          <div className="mt-10">
            <EmptyState
              title="Пока нет серверов"
              description="Найдите свой сервер в каталоге и нажмите «Это мой сервер» — или добавьте новую карточку."
              action="Открыть каталог"
              actionTo="/catalog"
            />
          </div>
        ) : (
          <>
            <div className="mt-6 flex gap-2 overflow-x-auto no-scrollbar">
              {list.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSelected(item.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors',
                    item.id === server.id ? 'border-white/18 bg-white/[0.06]' : 'border-white/7 bg-white/[0.02] hover:border-white/14',
                  )}
                >
                  <ServerLogo name={item.name} hue={item.hue} size="xs" />
                  <span className="text-left">
                    <span className="block text-[13.5px] font-medium text-ink-50">{item.name}</span>
                    <span className="block text-[11.5px] text-ink-400">
                      {getGame(item.gameId).shortName} · {item.ownerId ? 'владелец' : 'заявка'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <ServerPanel key={server.id} server={server} claims={(claims.data ?? []).filter(claim => claim.serverId === server.id)} />
          </>
        )}
      </Container>
    </div>
  )
}

function ServerPanel({ server, claims }: { server: GameServer; claims: ServerClaim[] }) {
  const [range, setRange] = useState<'7d' | '30d'>('30d')
  const owned = !!server.ownerId
  const stats = useAsync(() => ownerApi.stats(server.id, range), [server.id, range], true)
  const votes = useAsync(() => ownerApi.votes(server.id), [server.id])
  const alerts = alertsFor(server)
  const game = getGame(server.gameId)
  const totals = stats.data?.totals
  const claim = claims[0]

  return (
    <>
      <div className="surface mt-4 rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <ServerLogo name={server.name} hue={server.hue} gameId={server.gameId} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[20px]">{server.name}</h2>
                <StatusBadge status={server.online.status} size="sm" launching={!!server.launch} />
              </div>
              <div className="mt-1.5 text-[13px] text-ink-400">
                {[game.name, server.version, server.region].filter(Boolean).join(' · ')}
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-3">
                <span className="num text-[15px] font-medium text-ink-50">
                  {formatPlayers(server.online)}
                  <span className="text-[12.5px] text-ink-500"> / {formatSlots(server.online)}</span>
                </span>
                <VerifiedLine online={server.online} launching={!!server.launch} />
              </div>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 text-[12.5px] sm:items-end">
            <Badge tone={server.moderation === 'PUBLISHED' ? 'signal' : 'warn'}>{MODERATION_LABEL[server.moderation] ?? server.moderation}</Badge>
            <Badge tone={owned ? 'signal' : 'warn'}>
              {owned ? 'Владение подтверждено' : claim ? `Владение: ${CLAIM_LABEL[claim.status]?.[0] ?? claim.status}` : 'Владение не подтверждено'}
            </Badge>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Просмотры карточки" value={totals?.views} hint="Уникальные открытия карточки за период (1 в 30 мин на посетителя)" />
        <Metric label="Переходы на сайт" value={totals ? totals.websiteClicks + totals.playClicks : undefined} hint="Клики «Играть» и по ссылке сайта проекта" />
        <Metric label="Голоса за период" value={stats.data?.votes.inRange} hint={stats.data ? `Всего голосов: ${formatNumber(stats.data.votes.total)}` : undefined} />
        <Metric label="Голоса ждут выдачи" value={stats.data?.votes.pending} hint="Сервер ещё не забрал их через Pull API" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <section className="surface rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-[16px]">Просмотры карточки</h3>
                <p className="mt-1 text-[12.5px] text-ink-400">По дням, данные GameScout</p>
              </div>
              <Segmented
                value={range}
                onChange={setRange}
                size="sm"
                options={[
                  { value: '7d', label: '7 дней' },
                  { value: '30d', label: '30 дней' },
                ]}
              />
            </div>
            <div className="mt-5">
              {stats.data && stats.data.views.some(day => day.value > 0) ? (
                <>
                  <BarSeries data={stats.data.views.map(day => day.value)} height={150} accent="var(--color-signal-400)" />
                  <div className="mt-2 flex justify-between font-mono text-[10.5px] text-ink-500">
                    <span>{formatDate(stats.data.views[0].day)}</span>
                    <span>сегодня</span>
                  </div>
                </>
              ) : (
                <p className="text-[13px] text-ink-500">{stats.loading ? 'Загружаем…' : 'Просмотров за период пока нет.'}</p>
              )}
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <section className="surface rounded-xl p-5">
              <h3 className="text-[15px]">Откуда приходят игроки</h3>
              <div className="mt-4 space-y-2.5">
                {stats.data?.sources.length ? (
                  stats.data.sources.map(item => (
                    <div key={item.source} className="flex items-center justify-between text-[13px]">
                      <span className="text-ink-300">{SOURCE_LABEL[item.source] ?? item.source}</span>
                      <span className="num text-ink-100">{formatNumber(item.count)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-[12.5px] text-ink-500">Данных пока нет.</p>
                )}
              </div>
            </section>

            <section className="surface rounded-xl p-5">
              <h3 className="text-[15px]">Последние голоса</h3>
              <div className="mt-4 space-y-2">
                {votes.data?.length ? (
                  votes.data.slice(0, 8).map(vote => (
                    <div key={vote.id} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="min-w-0 truncate text-ink-100">{vote.nickname}</span>
                      <span className="shrink-0 font-mono text-[11px] text-ink-500">
                        {vote.status === 'CLAIMED' ? 'выдан' : 'ждёт'} · {formatRelativeDays(vote.createdAt)} {formatTime(vote.createdAt)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[12.5px] text-ink-500">{votes.loading ? 'Загружаем…' : 'Голосов пока нет.'}</p>
                )}
              </div>
            </section>
          </div>

          {alerts.length > 0 && (
            <section className="surface rounded-xl p-5">
              <h3 className="text-[15px]">Уведомления</h3>
              <div className="mt-4 space-y-3">
                {alerts.map(alert => (
                  <div key={alert.id} className="flex items-start gap-3 rounded-lg border border-white/6 bg-white/[0.02] p-3.5">
                    <span className={cn('mt-0.5 shrink-0', alert.kind === 'ok' ? 'text-signal-400' : alert.kind === 'warn' ? 'text-warn-400' : 'text-ink-300')}>
                      {alert.kind === 'ok' ? <CheckCircle2 size={15} /> : alert.kind === 'warn' ? <Bell size={15} /> : <TrendingUp size={15} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-[13.5px] font-medium text-ink-50">{alert.title}</span>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-400">{alert.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {owned ? (
            <>
              <IntegrationCard serverId={server.id} minecraft={server.gameId === 'minecraft'} />
              <MonitoringCard server={server} />
            </>
          ) : (
            <Notice tone="info" title="Настройки доступны после подтверждения владения">
              Награда за голос, ключ Pull API и мониторинг открываются, когда владение подтверждено файлом на сайте проекта.{' '}
              <Link to={`/server/${server.slug}`} className="underline underline-offset-2">
                Перейти к карточке
              </Link>
            </Notice>
          )}
        </div>

        <aside className="space-y-4">
          <TrustPanel online={server.online} />
          <div className="rounded-xl border border-white/7 bg-ink-900/60 p-5">
            <h3 className="flex items-center gap-2 text-[14px] font-medium text-ink-50">
              <Info size={14} className="text-ink-400" />
              Что считается
            </h3>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-400">
              Просмотры и переходы — события на GameScout, один посетитель учитывается не чаще раза в 30 минут. Голоса —
              записи в базе GameScout. Онлайн — последняя проверка мониторинга с указанием источника.
            </p>
          </div>
        </aside>
      </div>
    </>
  )
}

const SOURCE_LABEL: Record<string, string> = { direct: 'Прямые заходы', gamescout: 'Внутри GameScout', search: 'Поисковые системы' }

function Metric({ label, value, hint }: { label: string; value?: number; hint?: string }) {
  return (
    <div className="surface rounded-xl p-5">
      <span className="text-[12.5px] text-ink-400">{label}</span>
      <div className="num mt-3 font-display text-[26px] leading-none font-semibold text-ink-50">{value === undefined ? '—' : formatNumber(value)}</div>
      {hint && <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-500">{hint}</p>}
    </div>
  )
}

/** Vote reward shown to players, cooldown and the Pull API key (shown once). */
function IntegrationCard({ serverId, minecraft }: { serverId: string; minecraft: boolean }) {
  const integration = useAsync(() => ownerApi.integration(serverId), [serverId])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [cooldown, setCooldown] = useState('12')
  // Votifier is Minecraft's own delivery protocol; other games use the Pull API.
  const [delivery, setDelivery] = useState('PULL_API')
  const [votifierHost, setVotifierHost] = useState('')
  const [votifierPort, setVotifierPort] = useState('8192')
  const [votifierToken, setVotifierToken] = useState('')
  const [message, setMessage] = useState<{ tone: 'signal' | 'danger'; text: string } | undefined>()
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!integration.data) return
    setTitle(integration.data.rewardTitle ?? '')
    setDescription(integration.data.rewardDescription ?? '')
    setCooldown(String(integration.data.cooldownHours ?? 12))
    setDelivery(integration.data.delivery ?? 'PULL_API')
    setVotifierHost(integration.data.votifierHost ?? '')
    setVotifierPort(String(integration.data.votifierPort ?? 8192))
  }, [integration.data])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(undefined)
    try {
      await ownerApi.updateIntegration(serverId, {
        rewardTitle: title,
        rewardDescription: description,
        cooldownHours: Number(cooldown),
        ...(minecraft && votifierHost.trim()
          ? { votifierHost: votifierHost.trim(), votifierPort: Number(votifierPort), ...(votifierToken ? { votifierToken } : {}) }
          : {}),
        ...(minecraft ? { delivery } : {}),
      })
      setVotifierToken('')
      setMessage({ tone: 'signal', text: 'Сохранено. Игроки видят награду рядом с кнопкой голосования.' })
      integration.reload()
    } catch (error) {
      setMessage({ tone: 'danger', text: error instanceof Error ? error.message : 'Не удалось сохранить' })
    } finally {
      setBusy(false)
    }
  }

  async function rotate() {
    if (integration.data?.hasApiKey && !window.confirm('Выпустить новый ключ? Старый перестанет работать сразу.')) return
    setBusy(true)
    try {
      setApiKey((await ownerApi.rotateApiKey(serverId)).apiKey)
      integration.reload()
    } catch (error) {
      setMessage({ tone: 'danger', text: error instanceof Error ? error.message : 'Не удалось выпустить ключ' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="surface rounded-xl p-5">
      <h3 className="flex items-center gap-2 text-[15px]">
        <KeyRound size={15} className="text-ink-400" />
        Голоса и награды
      </h3>
      <form onSubmit={save} className="mt-4 space-y-3">
        <Field label="Награда за голос" hint="Коротко: что игрок получит в игре">
          <Input value={title} onChange={event => setTitle(event.target.value)} maxLength={80} placeholder="Например: 3 алмаза" />
        </Field>
        <Field label="Описание награды">
          <Textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={500} />
        </Field>
        <Field label="Интервал между голосами одного игрока">
          <Select
            value={cooldown}
            onChange={setCooldown}
            options={[1, 6, 12, 24].map(hours => ({ value: String(hours), label: `${hours} ч` }))}
          />
        </Field>
        {minecraft && (
          <>
            <Field label="Как сервер получает голоса">
              <Select
                value={delivery}
                onChange={setDelivery}
                options={[
                  { value: 'PULL_API', label: 'Pull API — сервер сам забирает голоса' },
                  { value: 'VOTIFIER', label: 'NuVotifier v2 — GameScout отправляет голос на сервер' },
                ]}
              />
            </Field>
            {delivery === 'VOTIFIER' && (
              <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
                <Field label="Адрес NuVotifier">
                  <Input value={votifierHost} onChange={event => setVotifierHost(event.target.value)} placeholder="play.example.com" />
                </Field>
                <Field label="Порт">
                  <Input value={votifierPort} onChange={event => setVotifierPort(event.target.value.replace(/\D/g, ''))} inputMode="numeric" />
                </Field>
                <Field
                  label="Токен NuVotifier"
                  hint={integration.data?.hasVotifierToken ? 'Токен сохранён. Введите новый, чтобы заменить.' : 'Из config.yml плагина NuVotifier (tokens → default)'}
                  className="sm:col-span-2"
                >
                  <Input type="password" autoComplete="off" value={votifierToken} onChange={event => setVotifierToken(event.target.value)} />
                </Field>
              </div>
            )}
          </>
        )}
        <Button type="submit" variant="primary" disabled={busy}>
          Сохранить
        </Button>
      </form>

      <div className="mt-5 border-t border-white/6 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[13.5px] font-medium text-ink-50">Ключ Pull API</div>
            <p className="mt-1 text-[12.5px] text-ink-400">
              {integration.data?.hasApiKey ? 'Ключ выпущен. GameScout хранит только его хэш.' : 'Ключ ещё не выпущен — сервер не может забирать голоса.'}
            </p>
          </div>
          <Button variant="outline" disabled={busy} onClick={rotate} icon={<RefreshCw size={14} />}>
            {integration.data?.hasApiKey ? 'Выпустить новый' : 'Выпустить ключ'}
          </Button>
        </div>
        {apiKey && (
          <Notice tone="warn" className="mt-3" title="Сохраните ключ сейчас — он показывается один раз">
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-50">{apiKey}</code>
              <button type="button" aria-label="Скопировать ключ" onClick={() => void navigator.clipboard?.writeText(apiKey)} className="text-ink-300 hover:text-ink-50">
                <Copy size={14} />
              </button>
            </div>
            <p className="mt-2 text-[12px]">
              Сервер забирает голоса запросом <code>GET /api/v1/votes/pending</code> с заголовком <code>Authorization: Bearer …</code> и подтверждает выдачу через{' '}
              <code>POST /api/v1/votes/claim</code>.
            </p>
          </Notice>
        )}
      </div>

      {message && (
        <Notice tone={message.tone} className="mt-4">
          {message.text}
        </Notice>
      )}
    </section>
  )
}

const METHOD_OPTIONS: Record<string, { value: string; label: string }[]> = {
  minecraft: [{ value: 'GAME_PROTOCOL', label: 'Server List Ping (адрес и порт)' }],
  gtarp: [{ value: 'SERVER_API', label: 'FiveM: адрес http(s)://host:port' }],
  lineage2: [{ value: 'LOGIN_SERVER', label: 'Логин-сервер (без числа игроков)' }],
}

/** Direct monitoring settings — the only way to reach VERIFIED/LIVE. */
function MonitoringCard({ server }: { server: GameServer }) {
  const current = useAsync(() => ownerApi.monitoring(server.id), [server.id])
  const options = METHOD_OPTIONS[server.gameId]
  const [method, setMethod] = useState(options?.[0]?.value ?? '')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [message, setMessage] = useState<{ tone: 'signal' | 'danger'; text: string } | undefined>()

  useEffect(() => {
    const data: MonitoringSettings | undefined = current.data
    if (!data || data.method === 'OWNER_SUBMITTED') return
    setMethod(data.method)
    setHost(data.host ?? '')
    setPort(data.port ? String(data.port) : '')
    setApiUrl(data.apiUrl ?? '')
  }, [current.data])

  if (!options) {
    return (
      <section className="surface rounded-xl p-5">
        <h3 className="flex items-center gap-2 text-[15px]">
          <Radar size={15} className="text-ink-400" />
          Мониторинг
        </h3>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-400">
          Прямая проверка для этой игры пока недоступна: сервер отвечает по UDP (A2S), а мониторинг GameScout работает поверх TCP/HTTP.
          Онлайн показывается по данным стороннего мониторинга с указанием источника.
        </p>
      </section>
    )
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setMessage(undefined)
    try {
      const input = method === 'SERVER_API' ? { method, apiUrl } : { method, host, ...(port ? { port: Number(port) } : {}) }
      await ownerApi.updateMonitoring(server.id, input)
      setMessage({ tone: 'signal', text: 'Сохранено. Следующий проход мониторинга проверит сервер по новым настройкам.' })
      current.reload()
    } catch (error) {
      setMessage({ tone: 'danger', text: error instanceof Error ? error.message : 'Не удалось сохранить' })
    }
  }

  const configured = current.data && current.data.method !== 'OWNER_SUBMITTED' && current.data.enabled
  return (
    <section className="surface rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[15px]">
          <Radar size={15} className="text-ink-400" />
          Мониторинг
        </h3>
        <Badge tone={configured ? 'signal' : 'neutral'}>{configured ? 'подключён' : 'не настроен'}</Badge>
      </div>
      <form onSubmit={save} className="mt-4 space-y-3">
        {options.length > 1 && <Select value={method} onChange={setMethod} options={options} />}
        <p className="text-[12.5px] text-ink-400">{options.find(option => option.value === method)?.label}</p>
        {method === 'SERVER_API' ? (
          <Field label="Адрес сервера FiveM" hint="Например: http://play.example.com:30120 — GameScout читает info.json, dynamic.json и players.json">
            <Input value={apiUrl} onChange={event => setApiUrl(event.target.value)} placeholder="http://host:30120" required />
          </Field>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <Field label="Адрес">
              <Input value={host} onChange={event => setHost(event.target.value)} placeholder="play.example.com" required />
            </Field>
            <Field label="Порт">
              <Input value={port} onChange={event => setPort(event.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder={method === 'LOGIN_SERVER' ? '2106' : '25565'} />
            </Field>
          </div>
        )}
        <Button type="submit" variant="primary">
          Сохранить
        </Button>
      </form>
      {message && (
        <Notice tone={message.tone} className="mt-4">
          {message.text}
        </Notice>
      )}
    </section>
  )
}

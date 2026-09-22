import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileCode2,
  Globe2,
  LayoutDashboard,
  Loader2,
  Server,
} from 'lucide-react'
import { cn, hashSeed } from '@/lib/utils'
import { submitServer } from '@/services'
import { ownerApi } from '@/services/ownerApi'
import { useAuth } from '@/hooks/useAuth'
import { ProbeMethod, ServerStatus } from '@/models'
import { GAMES, getGame } from '@/data/games'
import type { GameServer } from '@/models'
import { Container } from '@/components/layout/Container'
import { Button } from '@/components/ui/Button'
import { Checkbox, ChipToggle, Field, Input, Select, Textarea } from '@/components/ui/controls'
import { Notice } from '@/components/ui/feedback'
import { ServerCard } from '@/components/server/ServerCard'
import { Logo } from '@/components/layout/Logo'
import { useSeo } from '@/lib/seo'

const STEPS = ['Основное', 'Проверка онлайна', 'Владение', 'Готово']

const CONNECT_METHODS = [
  {
    id: 'protocol',
    icon: <Server size={16} />,
    title: 'Прямой игровой протокол',
    body: 'GameScout сам опрашивает сервер по адресу и порту: Minecraft — Server List Ping, Lineage 2 — логин-сервер (без числа игроков).',
    placeholder: 'play.example.com:25565',
    games: ['minecraft', 'lineage2'],
  },
  {
    id: 'api',
    icon: <Globe2 size={16} />,
    title: 'Прямой адрес сервера FiveM',
    body: 'GameScout читает info.json, dynamic.json и players.json напрямую с вашего сервера — без мастер-листа Cfx.re.',
    placeholder: 'http://play.example.com:30120',
    games: ['gtarp'],
  },
  {
    id: 'none',
    icon: <FileCode2 size={16} />,
    title: 'Подключить позже',
    body: 'Онлайн не будет измеряться, пока вы не укажете адрес в кабинете владельца.',
    placeholder: '',
    games: [] as string[],
  },
]

const methodsFor = (gameId: string) => CONNECT_METHODS.filter((item) => item.id === 'none' || item.games.includes(gameId))

interface FormState {
  gameId: string
  name: string
  version: string
  modes: string[]
  region: string
  languages: string[]
  maxPlayers: string
  summary: string
  tags: string
  site: string
  discord: string
  country: string
  connect: string
  address: string
  agreeRules: boolean
}

const INITIAL: FormState = {
  gameId: 'minecraft',
  name: '',
  version: '1.21',
  modes: [],
  region: 'EU',
  languages: ['Русский'],
  maxPlayers: '1000',
  summary: '',
  tags: '',
  site: '',
  discord: '',
  country: 'RU',
  connect: 'protocol',
  address: '',
  agreeRules: false,
}

export default function AddServer() {
  useSeo({ title: 'Добавить сервер', noindex: true })
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormState>(INITIAL)
  const [monitoringSaved, setMonitoringSaved] = useState(false)
  const [monitoringError, setMonitoringError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [created, setCreated] = useState<GameServer | null>(null)
  const { user } = useAuth()

  /**
   * Sends the card to the API. The server assigns the id, the slug and
   * PENDING_MODERATION status, so nothing here guesses them.
   */
  async function submit() {
    setSaving(true)
    setSaveError('')
    try {
      const saved = await submitServer({
        name: form.name.trim(),
        gameId: form.gameId,
        version: form.version.trim() || undefined,
        description: form.summary.trim(),
        summary: form.summary.trim().slice(0, 180),
        links: { site: form.site.trim(), discord: form.discord.trim() || undefined },
        country: form.country.trim(),
        region: form.region,
        languages: form.languages,
        modes: form.modes,
      } as never)
      setCreated(saved)
      // The address is stored as the card's monitoring target; the first
      // check runs once moderation publishes the card.
      const method = methodsFor(form.gameId).find((item) => item.id === form.connect)
      const address = form.address.trim()
      if (method && method.id !== 'none' && address) {
        try {
          if (method.id === 'api') await ownerApi.updateMonitoring(saved.id, { method: 'SERVER_API', apiUrl: address })
          else {
            const [host, port] = address.replace(/^[a-z]+:\/\//i, '').split(':')
            await ownerApi.updateMonitoring(saved.id, {
              method: form.gameId === 'lineage2' ? 'LOGIN_SERVER' : 'GAME_PROTOCOL',
              host,
              ...(port ? { port: Number(port) } : {}),
            })
          }
          setMonitoringSaved(true)
        } catch (error) {
          setMonitoringError(error instanceof Error ? error.message : 'Адрес мониторинга не сохранён')
        }
      }
      setStep(3)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Не удалось отправить карточку')
    } finally {
      setSaving(false)
    }
  }

  const game = getGame(form.gameId)
  const patch = (next: Partial<FormState>) => setForm((prev) => ({ ...prev, ...next }))

  const preview = useMemo(
    () => draftServer(form, 'PENDING'),
    [form],
  )

  const canContinue =
    step === 0 ? form.name.trim().length > 1 && form.modes.length > 0 : step === 2 ? form.agreeRules : true

  return (
    <div className="pb-20">
      <div className="border-b border-white/6">
        <Container className="flex h-14 items-center justify-between gap-4">
          <Logo compact className="lg:hidden" />
          <div className="hidden items-center gap-3 text-[13px] text-ink-400 lg:flex">
            <Link to="/" className="hover:text-ink-100">
              GameScout
            </Link>
            <span className="text-ink-600">/</span>
            <span className="text-ink-100">Добавление сервера</span>
          </div>
          <Link to="/" className="text-[13px] text-ink-400 transition-colors hover:text-ink-100">
            Сохранить и выйти
          </Link>
        </Container>
      </div>

      <Container className="pt-8 lg:pt-12">
        <div className="max-w-2xl">
          <h1 className="text-[28px] leading-tight sm:text-[36px]">Добавьте сервер бесплатно</h1>
          <p className="mt-3 text-[14.5px] text-ink-300">
            Размещение, статистика и проверка онлайна не стоят ничего. Заполнение занимает около трёх минут.
          </p>
        </div>

        <Stepper step={step} />

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_350px] lg:gap-10">
          <div className="min-w-0">
            {step === 0 && <StepBasics form={form} patch={patch} />}
            {step === 1 && (
              <StepConnect form={form} patch={patch} />
            )}
            {step === 2 && (
              <>
                <StepOwnership form={form} patch={patch} />
                {!user && (
                  <Notice tone="warn" title="Нужен вход" className="mt-4">
                    Карточка сохраняется за вашей учётной записью — войдите, чтобы отправить её на модерацию.
                  </Notice>
                )}
                {saveError && (
                  <Notice tone="danger" title="Карточка не отправлена" className="mt-4">
                    {saveError}
                  </Notice>
                )}
              </>
            )}
            {step === 3 && <StepDone form={form} verified={monitoringSaved} created={created} monitoringError={monitoringError} />}

            {step < 3 && (
              <div className="mt-8 flex items-center justify-between gap-3 border-t border-white/6 pt-6">
                <Button
                  variant="ghost"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  icon={<ArrowLeft size={15} />}
                  className={step === 0 ? 'invisible' : ''}
                >
                  Назад
                </Button>
                <div className="flex items-center gap-3">
                  {step === 1 && form.connect === 'none' && (
                    <span className="hidden text-[12.5px] text-ink-500 sm:block">Можно подключить позже</span>
                  )}
                  <Button
                    variant="primary"
                    size="lg"
                    disabled={!canContinue || saving || (step === 2 && !user)}
                    onClick={() => (step === 2 ? void submit() : setStep((s) => Math.min(3, s + 1)))}
                    icon={saving ? <Loader2 size={16} className="animate-spin" /> : undefined}
                    iconRight={saving ? undefined : <ArrowRight size={16} />}
                  >
                    {step === 2 ? (saving ? 'Отправляем…' : 'Отправить на модерацию') : 'Продолжить'}
                  </Button>
                </div>
              </div>
            )}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] tracking-[0.12em] text-ink-500 uppercase">Предпросмотр карточки</span>
              <span className="text-[11.5px] text-ink-500">{game.shortName}</span>
            </div>
            <ServerCard server={preview} />
            <p className="mt-3 text-[12px] leading-relaxed text-ink-500">
              Так карточку увидят игроки в каталоге. Пока онлайн не измерен, карточка показывает «Онлайн ещё не измерялся».
            </p>
          </aside>
        </div>
      </Container>
    </div>
  )
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="mt-8 flex items-center gap-2 sm:gap-3">
      {STEPS.map((label, index) => (
        <div key={label} className="flex flex-1 items-center gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[12px] font-medium transition-colors',
                index < step
                  ? 'border-signal-400/50 bg-signal-500/20 text-signal-300'
                  : index === step
                    ? 'border-white/25 bg-white text-ink-950'
                    : 'border-white/10 text-ink-500',
              )}
            >
              {index < step ? <Check size={13} strokeWidth={3} /> : index + 1}
            </span>
            <span
              className={cn(
                'hidden truncate text-[13px] sm:block',
                index === step ? 'text-ink-50' : 'text-ink-500',
              )}
            >
              {label}
            </span>
          </div>
          {index < STEPS.length - 1 && (
            <span className={cn('h-px flex-1', index < step ? 'bg-signal-500/40' : 'bg-white/8')} />
          )}
        </div>
      ))}
    </div>
  )
}

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="surface rounded-xl p-5 sm:p-6">
      <h2 className="text-[18px]">{title}</h2>
      {description && <p className="mt-2 text-[13.5px] text-ink-400">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function StepBasics({ form, patch }: { form: FormState; patch: (next: Partial<FormState>) => void }) {
  const game = getGame(form.gameId)
  return (
    <div className="space-y-5">
      <Panel title="Игра и режимы" description="От выбора игры зависят доступные версии, режимы и способ проверки онлайна.">
        <div className="flex flex-wrap gap-2">
          {GAMES.map((item) => (
            <ChipToggle
              key={item.id}
              active={form.gameId === item.id}
              accent={item.accent}
              onClick={() => patch({ gameId: item.id, version: item.versions[0], modes: [] })}
            >
              {item.shortName}
            </ChipToggle>
          ))}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Версия / хроники" required>
            <Select
              value={form.version}
              onChange={(version) => patch({ version })}
              options={game.versions.map((version) => ({ value: version, label: version }))}
            />
          </Field>
          <Field label="Максимум игроков" required>
            <Input
              value={form.maxPlayers}
              onChange={(event) => patch({ maxPlayers: event.target.value.replace(/\D/g, '') })}
              inputMode="numeric"
            />
          </Field>
        </div>

        <div className="mt-4">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-200">
            Режимы <span className="text-signal-400">*</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {game.modes.map((mode) => (
              <ChipToggle
                key={mode}
                active={form.modes.includes(mode)}
                onClick={() =>
                  patch({
                    modes: form.modes.includes(mode)
                      ? form.modes.filter((m) => m !== mode)
                      : [...form.modes, mode],
                  })
                }
              >
                {mode}
              </ChipToggle>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="О проекте">
        <div className="space-y-4">
          <Field label="Название сервера" required hint="Так проект будет отображаться в каталоге и поиске">
            <Input
              value={form.name}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="Например, HolySky"
              maxLength={32}
            />
          </Field>

          <Field label="Краткое описание" hint="Одно предложение, которое объясняет, чем сервер отличается">
            <Textarea
              value={form.summary}
              onChange={(event) => patch({ summary: event.target.value })}
              placeholder="Классическое выживание с продуманной экономикой и войнами кланов."
              maxLength={160}
            />
          </Field>

          <Field label="Теги" hint="До пяти тегов через запятую — помогают в поиске">
            <Input
              value={form.tags}
              onChange={(event) => patch({ tags: event.target.value })}
              placeholder="Survival, PvP, Экономика"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Регион">
              <Select
                value={form.region}
                onChange={(region) => patch({ region })}
                options={[
                  { value: 'EU', label: 'EU' },
                  { value: 'RU / CIS', label: 'RU / CIS' },
                  { value: 'NA', label: 'NA' },
                  { value: 'SEA', label: 'SEA' },
                ]}
              />
            </Field>
            <Field label="Основной язык">
              <Select
                value={form.languages[0]}
                onChange={(language) => patch({ languages: [language] })}
                options={[
                  { value: 'Русский', label: 'Русский' },
                  { value: 'English', label: 'English' },
                  { value: 'Українська', label: 'Українська' },
                ]}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Сайт">
              <Input value={form.site} onChange={(event) => patch({ site: event.target.value })} placeholder="example.gg" />
            </Field>
            <Field label="Discord">
              <Input
                value={form.discord}
                onChange={(event) => patch({ discord: event.target.value })}
                placeholder="discord.gg/example"
              />
            </Field>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function StepConnect({ form, patch }: { form: FormState; patch: (next: Partial<FormState>) => void }) {
  const methods = methodsFor(form.gameId)
  const method = methods.find((item) => item.id === form.connect) ?? methods[0]

  return (
    <div className="space-y-5">
      <Panel
        title="Проверка онлайна"
        description="GameScout сам измеряет онлайн и показывает источник. Подключение бесплатное; VERIFIED получает только то, что GameScout посчитал сам."
      >
        <div className="grid gap-3">
          {methods.map((item) => (
            <button
              key={item.id}
              onClick={() => patch({ connect: item.id })}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
                method.id === item.id ? 'border-signal-400/40 bg-signal-500/[0.06]' : 'border-white/7 bg-white/[0.02] hover:border-white/16',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border',
                  method.id === item.id ? 'border-signal-400/40 bg-signal-500/12 text-signal-300' : 'border-white/8 bg-white/[0.03] text-ink-300',
                )}
              >
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-ink-50">{item.title}</span>
                <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-400">{item.body}</span>
              </span>
              <span
                className={cn(
                  'mt-1 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border',
                  method.id === item.id ? 'border-signal-400 bg-signal-400' : 'border-white/15',
                )}
              >
                {method.id === item.id && <Check size={11} strokeWidth={3} className="text-ink-950" />}
              </span>
            </button>
          ))}
        </div>

        {method.id !== 'none' && (
          <div className="mt-5">
            <Field label="Адрес для проверки" hint={method.id === 'api' ? 'Полный адрес с портом, как в F8 → connect' : 'Адрес и порт; порт можно не указывать'}>
              <Input value={form.address} onChange={(event) => patch({ address: event.target.value })} placeholder={method.placeholder} />
            </Field>
          </div>
        )}

        <Notice tone="info" className="mt-4">
          {method.id === 'none'
            ? 'Без источника карточка показывает «Онлайн ещё не измерялся». Адрес можно указать позже в кабинете владельца.'
            : 'Адрес сохранится вместе с карточкой. Первая проверка пройдёт автоматически после модерации — результат и источник появятся на карточке и в кабинете.'}
        </Notice>
      </Panel>
    </div>
  )
}

function StepOwnership({ form, patch }: { form: FormState; patch: (next: Partial<FormState>) => void }) {
  return (
    <Panel title="Владение сервером" description="Подтверждение защищает карточку от чужих правок и открывает кабинет: голоса, награды, мониторинг, статистику.">
      <div className="rounded-lg border border-white/7 bg-white/[0.02] p-4">
        <div className="text-[13.5px] font-medium text-ink-50">Файл на сайте проекта</div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-400">
          После отправки откройте карточку и нажмите «Это мой сервер». GameScout выдаст проверочный код — разместите его в файле
          {' '}
          <code className="font-mono text-ink-200">/.well-known/gamescout-verification.txt</code> на сайте
          {form.site ? ` ${form.site.replace(/^https?:\/\//, '').replace(/\/$/, '')}` : ' проекта'}, и мы проверим его автоматически.
        </p>
      </div>

      <div className="mt-6 border-t border-white/6 pt-5">
        <Checkbox
          checked={form.agreeRules}
          onChange={(checked) => patch({ agreeRules: checked })}
          label="Я подтверждаю, что данные карточки достоверны"
          hint="Намеренное завышение онлайна ведёт к снятию статуса и понижению в рейтинге"
        />
      </div>
    </Panel>
  )
}

function StepDone({ form, verified, created, monitoringError }: { form: FormState; verified: boolean; created: GameServer | null; monitoringError: string }) {
  return (
    <Panel title="Сервер отправлен на модерацию">
      <div className="flex items-start gap-3 rounded-lg border border-signal-500/22 bg-signal-500/[0.06] p-4">
        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-signal-400" />
        <div>
          <div className="text-[14px] font-medium text-ink-50">{created?.name ?? form.name ?? 'Ваш сервер'} добавлен</div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-300">
            Модерация занимает до 24 часов. После публикации карточка появится в каталоге и поиске.
            {verified && ' Адрес мониторинга сохранён — проверка запустится автоматически после публикации.'}
          </p>
        </div>
      </div>

      {monitoringError && (
        <Notice tone="warn" className="mt-4" title="Адрес мониторинга не сохранён">
          {monitoringError} Укажите адрес в кабинете владельца.
        </Notice>
      )}

      <div className="mt-5 space-y-2.5">
        {[
          'Карточка появится в каталоге по вашей игре',
          verified ? 'Онлайн будет проверяться автоматически, с указанием источника' : 'Адрес для проверки онлайна можно указать в кабинете',
          'Подтвердите владение: на карточке кнопка «Это мой сервер»',
          'Статистика переходов станет доступна сразу после публикации',
        ].map((item) => (
          <div key={item} className="flex items-center gap-2 text-[13.5px] text-ink-300">
            <CheckCircle2 size={14} className="shrink-0 text-ink-500" />
            {item}
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button to="/dashboard" variant="primary" icon={<LayoutDashboard size={15} />}>
          Перейти в кабинет
        </Button>
        <Button to="/catalog" variant="outline">
          Посмотреть каталог
        </Button>
      </div>

      {created && (
        <Notice tone="signal" title="Карточка сохранена" className="mt-6">
          Идентификатор <span className="font-mono">{created.id}</span>, адрес{' '}
          <span className="font-mono">/server/{created.slug}</span>, статус {created.moderation}. Запись остаётся в
          базе после перезагрузки страницы.
        </Notice>
      )}
    </Panel>
  )
}

/** Builds a preview card from the form so owners see exactly what players will see. */
/** Preview of the card as players will first see it: nothing measured yet, no invented numbers. */
function draftServer(form: FormState, status: 'PENDING'): GameServer {
  const max = Math.max(10, Number(form.maxPlayers) || 1000)
  const tags = form.tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)

  return {
    id: 'draft',
    slug: 'draft',
    name: form.name.trim() || 'Название сервера',
    gameId: form.gameId,
    version: form.version,
    modes: form.modes.length ? form.modes : ['Режим'],
    region: form.region,
    country: '—',
    flag: '🌍',
    languages: form.languages,
    online: {
      status,
      current: 0,
      max,
      playersKnown: false,
      change24h: 0,
      peak24h: 0,
      avg7d: 0,
      peak30d: 0,
      checkedAgoSec: 0,
      source: 'Ожидает проверки',
      method: ProbeMethod.None,
      uptime24h: 0,
      checksPerDay: 0,
      freshness: 'unknown',
    },
    rating: 0,
    reviewsCount: 0,
    updatedAt: new Date().toISOString(),
    tags: tags.length ? tags.slice(0, 5) : (form.modes.length ? form.modes.slice(0, 3) : ['Новый']),
    summary: form.summary.trim() || 'Краткое описание появится здесь — расскажите, чем ваш сервер отличается.',
    description: form.summary,
    hue: hashSeed(form.name || 'draft') % 360,
    addedAt: new Date().toISOString(),
    trendScore: 0,
    favorites: 0,
    votes: 0,
    moderation: ServerStatus.Draft,
    demo: true,
    links: { site: form.site || 'example.gg', discord: form.discord || 'discord.gg/example' },
    highlights: [],
    history: { '24h': [], '7d': [], '30d': [] },
    events: [],
    reviews: [],
  }
}

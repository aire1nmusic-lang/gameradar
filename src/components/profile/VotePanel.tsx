import { useEffect, useState } from 'react'
import { CheckCircle2, Gift, ThumbsUp } from 'lucide-react'
import { formatDate, formatNumber, formatTime, plural } from '@/lib/format'
import type { GameServer } from '@/models'
import { repo } from '@/repositories'
import { HttpError } from '@/repositories/http'
import { useAsync } from '@/hooks/data'
import { track } from '@/services/events'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/controls'
import { Notice } from '@/components/ui/feedback'

const NICK_KEY = 'gamescout:nickname'

function savedNick(): string {
  try {
    return localStorage.getItem(NICK_KEY) ?? ''
  } catch {
    return ''
  }
}

const whenLabel = (iso: string) => `${formatDate(iso)}, ${formatTime(iso)}`

type Result = { kind: 'done'; rewardTitle?: string } | { kind: 'cooldown'; nextAllowedAt?: string } | { kind: 'error'; message: string }

/**
 * Vote for a server — the one action a player takes on GameScout itself.
 *
 * The reward is whatever the owner configured; if nothing is configured the
 * panel says so instead of promising a prize. One vote per nickname per
 * cooldown window, enforced by the backend.
 */
export function VotePanel({ server }: { server: GameServer }) {
  const [nickname, setNickname] = useState(savedNick)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | undefined>()
  const [votes, setVotes] = useState(server.votes)
  const { data: reward } = useAsync(() => repo.votes.reward(server.id).catch(() => undefined), [server.id])

  // A returning voter learns about the cooldown before pressing the button.
  useEffect(() => {
    const nick = nickname.trim()
    if (nick.length < 2) return
    const timer = setTimeout(() => {
      repo.votes
        .eligibility(server.id, nick)
        .then(state => setResult(current => (current?.kind === 'done' ? current : state.allowed ? undefined : { kind: 'cooldown', nextAllowedAt: state.nextAllowedAt })))
        .catch(() => {})
    }, 400)
    return () => clearTimeout(timer)
  }, [server.id, nickname])

  async function vote(event: React.FormEvent) {
    event.preventDefault()
    const nick = nickname.trim()
    if (nick.length < 2) return
    setBusy(true)
    track(server.id, 'VOTE_CLICK')
    try {
      await repo.votes.cast({ serverId: server.id, nickname: nick })
      try {
        localStorage.setItem(NICK_KEY, nick)
      } catch {
        // remembering the nickname is a convenience
      }
      setVotes(value => value + 1)
      setResult({ kind: 'done', rewardTitle: reward?.rewardTitle })
    } catch (error) {
      if (error instanceof HttpError && error.status === 429) {
        const state = await repo.votes.eligibility(server.id, nick).catch(() => undefined)
        setResult(state?.nextAllowedAt ? { kind: 'cooldown', nextAllowedAt: state.nextAllowedAt } : { kind: 'error', message: error.message })
      } else {
        setResult({ kind: 'error', message: error instanceof Error ? error.message : 'Не удалось отправить голос' })
      }
    } finally {
      setBusy(false)
    }
  }

  const cooldownHours = reward?.cooldownHours ?? 12

  return (
    <section className="surface rounded-xl p-5 sm:p-6" id="vote">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px]">Голосование</h2>
          <p className="mt-1.5 text-[13px] text-ink-400">
            Голос поднимает сервер в рейтинге. Один голос с ника раз в {cooldownHours} ч.
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-md border border-white/8 bg-white/[0.03] px-3 py-1.5 text-[13px] text-ink-200">
          <ThumbsUp size={14} className="text-ink-400" />
          <span className="num font-medium text-ink-50">{formatNumber(votes)}</span>
          <span className="text-ink-400">{plural(votes, ['голос', 'голоса', 'голосов'])}</span>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-lg border border-white/7 bg-white/[0.02] p-3.5">
        <Gift size={16} className="mt-0.5 shrink-0 text-ink-300" />
        {reward?.rewardTitle ? (
          <div>
            <div className="text-[13.5px] font-medium text-ink-50">Награда: {reward.rewardTitle}</div>
            {reward.rewardDescription && <p className="mt-1 text-[12.5px] leading-relaxed text-ink-400">{reward.rewardDescription}</p>}
          </div>
        ) : (
          <p className="text-[12.5px] leading-relaxed text-ink-400">
            Владелец ещё не настроил награду за голос. Голос всё равно учитывается в рейтинге.
          </p>
        )}
      </div>

      {result?.kind === 'done' ? (
        <Notice tone="signal" className="mt-4" title="Голос учтён">
          {result.rewardTitle
            ? `Награда «${result.rewardTitle}» будет выдана на сервере, когда он заберёт голос через GameScout.`
            : 'Спасибо! Следующий голос с этого ника — через ' + cooldownHours + ' ч.'}
        </Notice>
      ) : (
        <form onSubmit={vote} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Ник в игре" className="flex-1">
            <Input
              name="nickname"
              autoComplete="nickname"
              value={nickname}
              onChange={event => setNickname(event.target.value)}
              minLength={2}
              maxLength={40}
              placeholder="Ваш ник на сервере"
              required
            />
          </Field>
          <Button type="submit" variant="primary" disabled={busy || result?.kind === 'cooldown'} icon={<CheckCircle2 size={15} />}>
            {busy ? 'Отправляем…' : 'Проголосовать'}
          </Button>
        </form>
      )}

      {result?.kind === 'cooldown' && (
        <Notice tone="warn" className="mt-3">
          С этого ника уже голосовали.{' '}
          {result.nextAllowedAt ? `Следующий голос — ${whenLabel(result.nextAllowedAt)}.` : 'Попробуйте позже.'}
        </Notice>
      )}
      {result?.kind === 'error' && (
        <Notice tone="danger" className="mt-3">
          {result.message}
        </Notice>
      )}
    </section>
  )
}

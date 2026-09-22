import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, FileCheck2, ShieldCheck } from 'lucide-react'
import type { GameServer, ServerClaim } from '@/models'
import { useAuth } from '@/hooks/useAuth'
import { ownerApi } from '@/services/ownerApi'
import { track } from '@/services/events'
import { formatDate, formatTime } from '@/lib/format'
import { Modal } from '@/components/ui/overlays'
import { Button } from '@/components/ui/Button'
import { Notice, Spinner } from '@/components/ui/feedback'
import { AuthModal } from '@/components/layout/AuthModal'

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <div className="mb-1.5 text-[12px] text-ink-400">{label}</div>
      <div className="flex items-center gap-2 rounded-md border border-white/9 bg-ink-900/70 px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-50">{value}</code>
        <button
          type="button"
          aria-label={`Скопировать: ${label}`}
          className="shrink-0 text-ink-400 transition-colors hover:text-ink-50"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }}
        >
          {copied ? <Check size={15} className="text-signal-400" /> : <Copy size={15} />}
        </button>
      </div>
    </div>
  )
}

/**
 * "Это мой сервер": proves ownership with a file on the project's website.
 *
 * The flow is the backend's, step by step: sign in → create a claim (or
 * resume the open one) → publish the token at the verification URL → the
 * backend fetches it → the card moves into the owner's dashboard.
 */
export function ClaimModal({ server, open, onClose }: { server: GameServer; open: boolean; onClose: () => void }) {
  const auth = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [claim, setClaim] = useState<ServerClaim | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadingClaims, setLoadingClaims] = useState(false)

  useEffect(() => {
    if (open) track(server.id, 'CLAIM_START')
  }, [open, server.id])

  // Resume an open claim instead of issuing a new token every time.
  useEffect(() => {
    if (!open || !auth.user || claim) return
    setLoadingClaims(true)
    ownerApi
      .claims()
      .then(list => {
        const current = list.find(item => item.serverId === server.id && item.status !== 'REJECTED')
        if (current) return ownerApi.claim(current.id).then(setClaim)
      })
      .catch(() => {})
      .finally(() => setLoadingClaims(false))
  }, [open, auth.user, claim, server.id])

  async function run(action: () => Promise<ServerClaim>) {
    setBusy(true)
    setError('')
    try {
      setClaim(await action())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось выполнить запрос')
    } finally {
      setBusy(false)
    }
  }

  const ownedByMe = !!auth.user && server.ownerId === auth.user.id
  const verified = claim?.status === 'VERIFIED' || ownedByMe
  const expiresAt = (claim as (ServerClaim & { expiresAt?: string }) | undefined)?.expiresAt

  let body: React.ReactNode
  if (auth.loading || loadingClaims) {
    body = (
      <div className="flex items-center gap-2 text-[13px] text-ink-300">
        <Spinner /> Проверяем…
      </div>
    )
  } else if (verified) {
    body = (
      <div className="space-y-4">
        <Notice tone="signal" title="Владение подтверждено">
          Сервер закреплён за вашим аккаунтом. В кабинете можно настроить награду за голос, ключ Pull API и мониторинг.
        </Notice>
        <Button to="/dashboard" variant="primary" full onClick={onClose}>
          Открыть кабинет
        </Button>
      </div>
    )
  } else if (server.ownerId) {
    body = <Notice tone="warn">У этого сервера уже есть подтверждённый владелец. Если это ошибка — напишите в поддержку GameScout.</Notice>
  } else if (!server.links.site) {
    body = <Notice tone="warn">У карточки нет сайта проекта, поэтому подтверждение файлом недоступно.</Notice>
  } else if (!auth.user) {
    body = (
      <div className="space-y-4">
        <p className="text-[13.5px] leading-relaxed text-ink-300">
          Подтверждение привязывает сервер к аккаунту владельца. Войдите, чтобы начать.
        </p>
        <Button variant="primary" full onClick={() => setAuthOpen(true)}>
          Войти
        </Button>
      </div>
    )
  } else if (!claim) {
    body = (
      <div className="space-y-4">
        <p className="text-[13.5px] leading-relaxed text-ink-300">
          Мы выдадим проверочный код. Вы разместите его файлом на сайте проекта{' '}
          <span className="text-ink-50">{new URL(server.links.site).host}</span>, а GameScout сам скачает файл и сверит код.
        </p>
        <Button variant="primary" full disabled={busy} onClick={() => run(() => ownerApi.createClaim(server.id))} icon={<ShieldCheck size={15} />}>
          {busy ? 'Создаём заявку…' : 'Получить проверочный код'}
        </Button>
      </div>
    )
  } else {
    body = (
      <div className="space-y-4">
        <ol className="space-y-3 text-[13px] leading-relaxed text-ink-300">
          <li>1. Создайте на сайте проекта файл по адресу ниже.</li>
          <li>2. Запишите в файл только проверочный код — без пробелов и других строк.</li>
          <li>3. Нажмите «Проверить». GameScout скачает файл с вашего сайта.</li>
        </ol>
        {claim.verificationUrl && <CopyField label="Адрес файла" value={claim.verificationUrl} />}
        <CopyField label="Проверочный код" value={claim.proofToken} />
        {expiresAt && (
          <p className="text-[12px] text-ink-500">
            Код действует до {formatDate(expiresAt)}, {formatTime(expiresAt)}. После этого заявку можно создать заново.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onClick={() => run(() => ownerApi.verifyClaim(claim.id))} icon={<FileCheck2 size={15} />}>
            {busy ? 'Проверяем файл…' : 'Проверить'}
          </Button>
          {claim.verificationUrl && (
            <Button variant="outline" href={claim.verificationUrl} icon={<ExternalLink size={15} />}>
              Открыть файл
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <Modal open={open && !authOpen} onClose={onClose} title="Это мой сервер" description={server.name} width="max-w-lg">
        {body}
        {error && (
          <Notice tone="danger" className="mt-4">
            {error}
          </Notice>
        )}
      </Modal>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  )
}

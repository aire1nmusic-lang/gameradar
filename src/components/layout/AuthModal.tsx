import { useState } from 'react'
import { Modal } from '@/components/ui/overlays'
import { Button } from '@/components/ui/Button'
import { Field, Input, Segmented } from '@/components/ui/controls'
import { Notice } from '@/components/ui/feedback'

export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'player' | 'owner'>('player')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Вход в GameRadar"
      description="Избранное, напоминания об открытиях и кабинет владельца"
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="primary" full onClick={onClose}>
            {mode === 'player' ? 'Войти как игрок' : 'Войти как владелец'}
          </Button>
          <p className="text-center text-[11.5px] text-ink-500">
            Продолжая, вы соглашаетесь с условиями использования
          </p>
        </div>
      }
    >
      <Segmented
        value={mode}
        onChange={setMode}
        className="mb-5 w-full [&>button]:flex-1"
        options={[
          { value: 'player', label: 'Игрок' },
          { value: 'owner', label: 'Владелец сервера' },
        ]}
      />

      <div className="space-y-4">
        <Field label="Email">
          <Input placeholder="you@example.com" type="email" />
        </Field>
        <Field label="Пароль">
          <Input placeholder="••••••••" type="password" />
        </Field>
      </div>

      <div className="my-5 flex items-center gap-3 text-[11.5px] text-ink-500">
        <span className="h-px flex-1 bg-white/7" />
        или
        <span className="h-px flex-1 bg-white/7" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onClose}>
          Discord
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Steam
        </Button>
      </div>

      <Notice tone="info" className="mt-5">
        Прототип: реальная авторизация не подключена. Кнопки просто закрывают окно.
      </Notice>
    </Modal>
  )
}

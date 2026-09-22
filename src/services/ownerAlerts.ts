import { OnlineStatus, ServerStatus, type GameServer, type OwnerAlert } from '@/models'

/**
 * Dashboard notices, derived from the server's actual state.
 *
 * Nothing here is invented: every notice is a statement about a field the
 * owner can verify on their own card. When there is nothing to report the
 * list is empty rather than padded with encouraging noise.
 */
export function alertsFor(server: GameServer): OwnerAlert[] {
  const alerts: OwnerAlert[] = []
  const at = server.updatedAt

  if (server.moderation === ServerStatus.Pending) {
    alerts.push({
      id: `${server.id}-moderation`,
      kind: 'info',
      title: 'Карточка на модерации',
      body: 'Сервер виден только вам. После проверки он появится в каталоге и в поиске.',
      at,
    })
  }

  if (!server.ownerId) {
    alerts.push({
      id: `${server.id}-claim`,
      kind: 'warn',
      title: 'Владение не подтверждено',
      body: 'Подтвердите владение файлом на сайте — после этого станут доступны ключ сервера и приём голосов.',
      at,
    })
  }

  switch (server.online.status) {
    case OnlineStatus.Verified:
      alerts.push({
        id: `${server.id}-verified`,
        kind: 'ok',
        title: 'Verified Online активен',
        body: `Онлайн измеряет GameScout. Последняя проверка — ${server.online.checkedAgoSec} сек. назад.`,
        at,
      })
      break
    case OnlineStatus.Live:
      alerts.push({
        id: `${server.id}-live`,
        kind: 'info',
        title: 'Сервер отвечает, точный онлайн недоступен',
        body: 'Для статуса VERIFIED подключите GameScout Agent — игровой протокол не отдаёт точное число игроков.',
        at,
      })
      break
    case OnlineStatus.Offline:
      alerts.push({
        id: `${server.id}-offline`,
        kind: 'warn',
        title: 'Сервер не отвечает',
        body: 'Проверьте адрес и порт мониторинга: последние проверки завершились без ответа.',
        at,
      })
      break
    case OnlineStatus.Pending:
      alerts.push({
        id: `${server.id}-pending`,
        kind: 'info',
        title: 'Онлайн ещё не измерялся',
        body: 'Укажите адрес и порт сервера, чтобы GameScout начал собственные проверки.',
        at,
      })
      break
    default:
      break
  }

  return alerts
}

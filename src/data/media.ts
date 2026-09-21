import { hashSeed, rng } from '@/lib/utils'
import type { GameServer } from '@/models'

/**
 * Server media.
 *
 * The prototype ships no bitmap screenshots — every shot is a seed that the
 * <ProceduralShot> component paints from the active theme. Nothing here
 * pretends to be a real photograph of a real server.
 */

export type ShotKind = 'landscape' | 'interior' | 'combat' | 'map'

export interface Shot {
  id: string
  caption: string
  kind: ShotKind
  seed: number
}

export interface VideoClip {
  title: string
  durationLabel: string
  author: string
  seed: number
}

export interface ServerMedia {
  shots: Shot[]
  video?: VideoClip
}

const CAPTIONS: Record<string, string[]> = {
  minecraft: ['Спавн', 'Торговая площадь', 'Территория клана', 'PvP-арена', 'Ферма ресурсов'],
  lineage2: ['Замок Аден', 'Осада', 'Город Гиран', 'Эпик-босс', 'Рынок'],
  gtarp: ['Центр города', 'Участок LSPD', 'Ночная гонка', 'Порт', 'Ночной клуб'],
  rust: ['База клана', 'Рейд', 'Монумент', 'Побережье', 'Аутпост'],
  cs2: ['Mirage', 'Inferno', 'Разминка', 'Финал матча', 'Retake-раунд'],
  ark: ['Лагерь племени', 'Приручение', 'Пещера', 'Побережье'],
  dayz: ['Черногорск', 'Военная база', 'Лес', 'Блокпост'],
  valheim: ['Поселение', 'Чёрный лес', 'Драккар', 'Болота'],
}

const KINDS: ShotKind[] = ['landscape', 'combat', 'interior', 'map']

const VIDEO_TITLES: Record<string, string> = {
  minecraft: 'Обзор мира и механик сервера',
  lineage2: 'Трейлер хроники и осадной системы',
  gtarp: 'Как выглядит день в городе',
  rust: 'Первый вайп: как это было',
  cs2: 'Разбор retake-раунда',
}

export function mediaFor(server: GameServer): ServerMedia {
  const random = rng(hashSeed(`${server.slug}-media`))
  const captions = CAPTIONS[server.gameId] ?? ['Игровой мир', 'Локация', 'Событие', 'Карта']
  const count = Math.min(captions.length, 4 + Math.round(random()))

  const shots: Shot[] = Array.from({ length: count }, (_, index) => ({
    id: `${server.slug}-shot-${index}`,
    caption: captions[index % captions.length],
    kind: KINDS[index % KINDS.length],
    seed: hashSeed(`${server.slug}-${index}`),
  }))

  const hasVideo = server.online.status !== 'PENDING' ? random() > 0.25 : true

  return {
    shots,
    video: hasVideo
      ? {
          title: server.launch
            ? 'Трейлер открытия сервера'
            : (VIDEO_TITLES[server.gameId] ?? 'Обзор сервера'),
          durationLabel: `${2 + Math.round(random() * 6)}:${String(10 + Math.round(random() * 48)).padStart(2, '0')}`,
          author: server.name,
          seed: hashSeed(`${server.slug}-video`),
        }
      : undefined,
  }
}

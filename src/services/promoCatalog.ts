import type { PromoProduct } from '@/models'

/**
 * Promotion price list.
 *
 * This is product configuration, not catalogue data: it describes what an
 * owner can buy, never which server is promoted. It lives in its own module
 * so the owner-facing pages can render it without pulling the development
 * fixtures in `src/data/dashboard.ts` into the production bundle.
 *
 * When billing lands this moves behind `GET /api/v1/promo-products`; the
 * service signature already returns a promise so nothing else changes.
 */
export const PROMO_PRODUCTS: PromoProduct[] = [
  {
    id: 'TOP',
    name: 'TOP',
    tag: 'Позиция в каталоге',
    description: 'Ваш сервер занимает верхнюю позицию в выдаче по выбранной игре.',
    bullets: ['Закреплённое место в каталоге', 'Метка «Продвижение»', 'До 5 позиций на игру'],
    priceLabel: 'от 4 900 ₽ / неделя',
    accent: 'TOP',
  },
  {
    id: 'VIP',
    name: 'VIP',
    tag: 'Выделенная карточка',
    description: 'Карточка получает акцентную рамку и увеличенный формат в списках.',
    bullets: ['Акцентное оформление', 'Увеличенный формат', 'Логотип большего размера'],
    priceLabel: 'от 2 900 ₽ / неделя',
    accent: 'VIP',
  },
  {
    id: 'FEATURED',
    name: 'Featured',
    tag: 'Главная страница',
    description: 'Размещение в подборке на главной странице GameScout.',
    bullets: ['Блок на главной', 'Ротация каждые 15 минут', 'Отдельная статистика'],
    priceLabel: 'от 7 900 ₽ / неделя',
    accent: 'FEATURED',
  },
  {
    id: 'banner',
    name: 'Banner',
    tag: 'Рекламные блоки',
    description: 'Баннерные места в каталоге и на страницах игр — всегда с пометкой «Реклама».',
    bullets: ['Каталог и страницы игр', 'Не более 1 блока на экран', 'Отчёт по показам и кликам'],
    priceLabel: 'от 5 900 ₽ / неделя',
    accent: 'banner',
  },
  {
    id: 'launch',
    name: 'Launch Promotion',
    tag: 'Перед открытием',
    description: 'Продвижение сервера до старта: предрегистрации и напоминание игрокам.',
    bullets: ['Блок «Открываются сегодня»', 'Push-напоминание игрокам', 'Счётчик предрегистраций'],
    priceLabel: 'от 9 900 ₽ / запуск',
    accent: 'launch',
  },
]

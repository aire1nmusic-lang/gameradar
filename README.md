# GameRadar — UI/UX прототип

Фронтенд-прототип рекламно-рейтинговой платформы игровых серверов: поиск, каталог, независимая проверка
онлайна (**Verified Online**), рейтинг с бустами, рекламные форматы, открытия и кабинет владельца.

Ключевая идея архитектуры — **Theme Engine**: одно ядро продукта и разные визуальные миры поверх него.
`/minecraft`, `/lineage-2`, `/lineage-2/interlude`, `/gta-rp` — это не отдельные сайты, а одна платформа
с разными темами.

Бэкенда, базы, авторизации и платежей нет — весь прототип работает на детерминированных mock-данных.

## Запуск

```bash
npm install
```

```bash
npm run dev
```

Откроется `http://localhost:5173`. Продакшен-сборка — `npm run build`, предпросмотр — `npm run preview`.

## Стек

- **React 19 + TypeScript**, маршрутизация — `react-router-dom`
- **Vite** как сборщик
- **Tailwind CSS v4** — дизайн-токены объявлены в `@theme` внутри `src/index.css`
- **lucide-react** — иконки
- Графики (area-chart, sparkline, bar-series) написаны на SVG вручную, без библиотек

## Экраны

| Маршрут | Экран |
| --- | --- |
| `/` | Главная: hero-поиск, игры, открытия, высокий онлайн, рост, TOP (продвижение), доверие, недавние |
| `/catalog` | Каталог: фильтры, сортировки, загрузка, пустое состояние, пагинация |
| `/server/:slug` | Профиль сервера: онлайн + графики, блок данных GameRadar, информация, история, отзывы, похожие |
| `/games` | Игры и лидеры по каждой игре |
| `/:game` | **Мир игры**: тематический hero, серверы, открытия, рейтинг, реклама (`/minecraft`, `/lineage-2`, `/gta-rp`, `/rust`, `/cs2`, …) |
| `/:game/:chronicle` | **Мир хроники** со своей темой (`/lineage-2/interlude`, `/lineage-2/high-five`, `/lineage-2/essence`) |
| `/boost` | Продвижение: прогноз позиции, пакеты START / PRO / MAX, рекламные места |
| `/openings` | Открытия по дням с предрегистрациями |
| `/rating` | Независимый рейтинг с объяснением формулы |
| `/favorites` | Избранное (хранится в `localStorage`) |
| `/owners` | Лендинг для владельцев: Verified Online, подтверждение владения, продвижение, FAQ |
| `/add-server` | Добавление сервера: 4 шага, живой предпросмотр карточки, симуляция проверки |
| `/dashboard` | Кабинет владельца: метрики, график просмотров, позиция, источники, продвижение |
| `/states` | Витрина состояний интерфейса (статусы, загрузка, ошибки, пустые экраны) |

Брейкпоинты: **1440** (desktop), **768** (tablet), **390** (mobile). Мобильная версия — отдельный UX:
нижняя навигация, bottom-sheet фильтры, горизонтальные rail-ленты, sticky-CTA, «большие пальцы» вместо ховеров.

Мобильные версии — те же маршруты: нижняя навигация, bottom-sheet фильтры и сортировка,
sticky-CTA на карточке сервера, полноэкранный поиск.

## Дизайн-система

Ключевое правило: **цвет = смысл**.

- `signal` (мятный) — **только** проверенные данные GameRadar: `VERIFIED ONLINE`, live-индикаторы, доверие
- `promo` (фиолетовый) — **только** платные размещения: TOP, VIP, Featured, Banner, Launch Promotion
- `warn` — `DATA ANOMALY` и устаревшие данные, `danger` — `OFFLINE`
- Основная кнопка — **белая, нейтральная**, чтобы не конкурировать со статусами

Токены (нейтрали `ink-*`, семантические цвета, радиусы, анимации) — в `src/index.css`.
Композитные примитивы (`.surface`, `.interactive`, `.glass`, `.texture-*`, `.skeleton`) там же.

Статусы онлайна: `verified`, `reported`, `offline`, `anomaly`, `pending`, `checking` —
см. `src/components/trust/status.tsx` и живую витрину на `/states`.

## Структура

```
src/
  components/
    layout/    Header, MobileNav, Footer, Layout, Logo, AuthModal, Container
    ui/        Button, Badge, controls, overlays, feedback, Rating, ServerLogo, SectionHeader
    trust/     статусы онлайна и строка «Проверено GameRadar»
    charts/    AreaChart, Sparkline, BarSeries (чистый SVG)
    server/    ServerCard, ServerRow, LaunchCard, скелетоны
    home/      Hero, игровые плитки, discovery-секции, блоки доверия и CTA
    catalog/   панель фильтров (используется и в сайдбаре, и в bottom-sheet)
    profile/   TrustPanel, ServerMedia (скриншоты и видео)
    search/    полноэкранный поиск (⌘K / «/»)
    game/      GameHero, ChronicleNav — вход в мир игры
    rating/    RatingBoard: подиум, список, ScoreBar, блок продвижения
    boost/     бейджи BOOSTED / TOP / Premium
    ads/       рекламные места (top banner, sidebar, takeover, featured, inline)
    art/       ProceduralShot — процедурные «скриншоты» в цветах темы
  theme/       Theme Engine (см. ниже)
  data/        типы, игры, хроники, серверы, темы, бусты, реклама, медиа, кабинет
  hooks/       избранное, медиа-запросы, счётчики, тикер проверки
  lib/         форматирование (ru), утилиты, seeded PRNG
  pages/       экраны
```

## Theme Engine

Тема — это **данные**, а не набор классов. Файл темы не импортирует React и не трогает DOM, поэтому
темы можно позже отдавать из API, не меняя ни одного компонента.

```
src/theme/
  core/
    types.ts          контракты: ThemeColors, ThemeGradients, ThemeCardStyle, ThemeDecor …
    tokens.ts         coreTheme — нейтральная тема платформы (база для всех остальных)
    cssVars.ts        themeToCssVars() и mergeTheme()
    ThemeProvider.tsx <ThemeScope> + useGameTheme()
    components.tsx    ThemedCard / ThemedButton / ThemedBadge / ThemedHeading / ThemedEyebrow …
    Decor.tsx         ThemePattern, ThemeHorizon, ThemeParticles, ThemeFrame, ThemeAura
  games/
    minecraft.ts  lineage2.ts  gtaRp.ts  rust.ts  cs2.ts
  chronicles/
    interlude.ts  highFive.ts  essence.ts
  registry.ts         GAME_THEMES, CHRONICLE_THEMES, resolveTheme(), autoTheme()
  index.ts            публичный API движка
```

### Как это работает

1. `resolveWorld(gameSlug, chronicleSlug)` (`src/data/themes.ts`) отдаёт игру, хронику и готовую тему.
2. `<ThemeScope theme={theme}>` публикует тему как CSS-переменные `--gt-*` на своём поддереве
   и кладёт объект темы в контекст (для не-CSS значений: паттерн, горизонт, частицы).
3. Классы `.gt-card`, `.gt-btn`, `.gt-badge`, `.gt-panel`, `.gt-display`, `.gt-eyebrow`, `.gt-hero`
   (см. конец `src/index.css`) читают только эти переменные.

Слои накладываются так: **core tokens → тема игры → тема хроники** (частичный override через
`mergeTheme`). Хроника описывает только то, чем она отличается.

### Что входит в тему

`colors` (primary / secondary / accent / background / surface / border / text), `gradients`
(hero, card, cta, aura), `glow`, `card` (радиус, фон, рамка, тени, overlay, тип рамки),
`button`, `badge`, `typography` (шрифты, трекинг акцентов, `displayScale`),
`decor` (паттерн, частицы, интенсивность, силуэт горизонта).

### Что темой **не** управляется

Сигналы доверия и коммерции одинаковы во всех мирах — иначе игрок не сможет читать их автоматически:

- `VERIFIED ONLINE` / `REPORTED` / `OFFLINE` / `DATA ANOMALY` — всегда платформенные цвета
  (`signal` / нейтральный / `danger` / `warn`);
- `BOOSTED`, `TOP`, `Premium`, метка «Реклама» — всегда фиолетовый `promo`.

## Ключевой арт миров (world media)

Тема задаёт палитру и геометрию, **арт задаёт атмосферу**. Битмап-слой живёт отдельно от
цветовых тем и подключается по той же схеме «данные → резолвер → компонент».

```
public/media/worlds/
  lineage-2/   citadel-sunset · moonlit-citadel · sky-citadel-gold · arcane-portal
  minecraft/   voxel-valley · fortress-sunset
  gta-rp/      neon-skyline
  rust/        wasteland-outpost
  cs2/         dawn-raid
  shared/      obsidian-stage
```

Каждый файл опубликован в трёх ширинах — `-400.webp`, `-800.webp`, `-1600.webp` (WebP,
весь набор ≈ 2,3 МБ). Ширину выбирает браузер через `srcset` / `sizes`.

### Слоты и резолвинг

`src/data/themeMedia.ts` — единственное место, где вообще встречаются пути к файлам.

| Слот | Где используется |
| --- | --- |
| `hero` | hero страницы мира, обложка профиля сервера, плитки игр, миниатюры хроник |
| `card` | обложки карточек серверов и подиума рейтинга |
| `promo` | TOP-баннер, sidebar, featured, inline-промо, takeover |
| `stage` | большие CTA: `/boost`, блок «Добавьте сервер бесплатно» |

Резолвинг идёт по цепочке **хроника → игра → shared**:

```ts
worldArt('hero', 'lineage2', 'essence')   // → arcane-portal
serverArt(server)                         // арт хроники сервера, варьируется по seed
promoArt(gameId, creativeId)              // арт для рекламного креатива
```

У сервера нет собственного арта — он наследует арт своей хроники (или игры), а внутри
галереи мира кадр выбирается детерминированно по seed, чтобы сетка карточек не повторяла
одну картинку.

### Читаемость

Ни одно изображение не выводится «просто фоном». `WorldArtSurface`
(`src/components/media/WorldArt.tsx`) всегда кладёт сверху scrim одного из пресетов —
`hero`, `card`, `banner`, `stage`, `tile` (CSS в конце `src/index.css`). Scrim смешивается
из `--gt-bg` / `--gt-bg-deep` активной темы, поэтому затемнение сохраняет цвет мира.
Дополнительно каждый арт помечен тоном (`dark` / `medium` / `bright`), который добавляет
плоское затемнение — светлые кадры гасятся сильнее.

Фокус кадра задаётся отдельно для desktop и mobile (`focus.desktop` / `focus.mobile` →
`object-position`), поэтому при вертикальном кропе в кадре остаётся главный объект.

В плотной карточке каталога (`ServerCard`) арт намеренно ограничен маской в правый верхний
угол: заголовок, описание и строка проверки онлайна не пересекаются с изображением.
Контраст заголовка на самом светлом арте — ≈ 6,8:1.

### Fallback

Если у мира нет ключевого арта (ARK, DayZ, Valheim), `WorldArtSurface` рендерит `fallback` —
процедурный `ProceduralShot`. Layout при этом не меняется.

### Как заменить картинки

1. Положить новые файлы в `public/media/worlds/<мир>/<имя>-{400,800,1600}.webp`.
2. Поправить запись в таблице `ART` в `src/data/themeMedia.ts` (путь, alt, тон, фокус).
3. При необходимости переназначить слоты в `WORLDS`.

Код компонентов трогать не нужно.

## Как добавить новую игру

1. **Данные.** Добавьте запись в `GAMES` (`src/data/games.ts`): `id`, `slug` (сегмент URL),
   `name`, `shortName`, `tagline`, `motif`, цвета `from` / `to` / `accent`, счётчики, `versions`,
   `modes`, `chronicles: []`.
2. **Готово.** Маршруты `/:gameSlug` и `/:gameSlug/:chronicleSlug` уже зарегистрированы, а
   `autoTheme()` соберёт тему из `from` / `to` / `accent` — мир сразу выглядит осмысленно
   (так сейчас работают ARK, DayZ, Valheim).
3. **Своя тема (по желанию).** Создайте `src/theme/games/<game>.ts`, экспортируйте `GameTheme`
   и зарегистрируйте его в `GAME_THEMES` (`src/theme/registry.ts`) под ключом `Game.id`.
   Удобнее всего копировать ближайшую по настроению тему и менять значения.
4. **Серверы.** Добавьте записи в `RAW` (`src/data/servers.ts`) с новым `gameId` — карточки,
   рейтинг, бусты и реклама подхватятся автоматически.
5. **Арт (по желанию).** Положите файлы в `public/media/worlds/<slug>/` и добавьте запись в
   `WORLDS` в `src/data/themeMedia.ts`. Без арта мир использует процедурные изображения.

## Как добавить новую хронику

1. В `chronicles` нужной игры (`src/data/games.ts`) добавьте объект: `id`, `slug`, `label`,
   `tagline`, `versions` (значения `GameServer.version`, которые относятся к хронике),
   счётчики и — если нужна своя тема — `themeId`.
2. Для собственной темы создайте `src/theme/chronicles/<chronicle>.ts` c `ChronicleTheme`
   (обязательные поля: `id`, `parent` — id темы игры, `label`, `mood`; остальное — частичные
   override-ы) и зарегистрируйте в `CHRONICLE_THEMES` под тем же `themeId`.
3. Без `themeId` хроника работает как фильтр и наследует тему игры — так сделаны
   `Classic`, `Gracia Final` и платформы GTA RP.
4. Своя сцена для хроники задаётся ключом `"<gameId>:<chronicleId>"` в `WORLDS`
   (`src/data/themeMedia.ts`) — так Interlude, High Five и Essence отличаются не только
   палитрой, но и кадром.

## Рейтинг и бусты

`src/data/boost.ts` разделяет два числа и никогда их не смешивает:

- `organicScore` — заработано: проверенный онлайн, оценки, отзывы, стабильность, динамика;
- `activeBoosts` — куплено владельцем.

`organicLeaderboard()` — независимый рейтинг (бусты исключены, серверы с `DATA ANOMALY`
не участвуют до перепроверки). `leaderboard()` — витрина с учётом бустов; в интерфейсе она
включается явным переключателем и помечается. `boostForecast()` считает прогноз позиции,
сколько бустов нужно до следующей позиции и до TOP-10 / TOP-3 / TOP-1 — это основа `/boost`.

Везде, где очки показываются, рядом стоит `ScoreBar`: мятная часть — заработанные очки,
фиолетовая — бусты.

## Реклама

Инвентарь описан в `src/data/ads.ts`, компоненты — в `src/components/ads/AdSlots.tsx`:
`TopBanner`, `SidebarBanner`, `BackgroundTakeover`, `FeaturedServerCard`, `InlinePromo`,
`PremiumBadge`. Любой платный блок обёрнут в `AdSlot` и получает видимую метку через
CSS-класс `.ad-slot` (`data-ad-label`). Подмена органической карточки рекламной без метки
запрещена продуктовым правилом и не реализована.

## Картинки

Ключевой арт миров — в `public/media/worlds/` (см. раздел «Ключевой арт миров»). Галерея
скриншотов на странице сервера и все миры без собственного арта используют `ProceduralShot`
(`src/components/art/ProceduralShot.tsx`) — изображение генерируется из seed сервера и цветов
активной темы.

Ни одно изображение в прототипе не выдаётся за реальный снимок реального сервера: галерея
подписана явно, а сам набор арта — временный и заменяется правкой одной таблицы.

## Mock-данные

`src/data/servers.ts` — 35 вымышленных серверов по 8 играм; `src/data/games.ts` — игры и хроники;
`src/data/boost.ts`, `src/data/ads.ts`, `src/data/media.ts` — бусты, рекламный инвентарь и медиа. История онлайна, отзывы и события
генерируются детерминированно из seed (`mulberry32`), поэтому данные не «прыгают» между рендерами,
но выглядят живыми. Даты открытий и вайпов считаются относительно текущего времени.

Все числа, названия, рейтинги и отзывы — демонстрационные и не являются реальными данными.

## Что намеренно не реализовано

Авторизация, отправка форм, платежи, списание бустов, видеоплеер и реальные запросы к серверам.
Кнопки входа, оплаты и отправки отзыва открывают диалоги-заглушки с явной пометкой, что это прототип.

Архитектура подготовлена под замену данных на API: весь доступ к данным идёт через модули
`src/data/*`, а темы резолвятся через `resolveWorld()` / `themeForGame()` — компоненты не знают,
откуда пришли игры, серверы и темы.

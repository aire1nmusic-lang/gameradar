# Перенос gamescout.online на вход через Yandex Cloud

Статус: **`gamescout.online` обслуживается Yandex с 25.09.2026 06:19 UTC.** Apex в Cloudflare DNS —
CNAME на шлюз, DNS only, TTL 1 min. Pages, Worker route, `new.gamescout.online` и Vercel оставлены для отката.

## Проверка после переключения (25.09.2026)

- DNS: 1.1.1.1 и 8.8.8.8 отдают `158.160.184.183` (TTL 60), AAAA пустой — IPv6 в Cloudflare не уходит.
- TLS: сертификат Yandex (serial `061412B2…`), до 23.12.2026.
- 24/24 HTTP-проверки (страницы, robots, sitemap, постер, JS, API 204 КБ, cookie, POST 404/400/401/403,
  CORS, подмена IP) — все от Yandex (`server: ycalb`).
- check-host: Москва ×2, Санкт-Петербург, Нюрнберг, Хельсинки, Амстердам → 200 на страницу, каталог, постер.
- Браузер (mobile): 7 запросов API без ошибок, 21 картинка без битых, хосты — только gamescout.online и
  Google Fonts, `cf-ray` нет; онлайн свежий 42/42.
- D1 не изменена проверкой; мониторинг продолжает писать `checked_at`.

**Важно для релизов:** пользователи теперь получают фронтенд из бакета, а не из Pages. После изменений
в `main` обязательно выполнять загрузку в бакет (команда в конце документа), иначе сайт останется на
старой сборке.

## Схема

```
браузер ──► gamescout.online (DNS only) ──► Yandex API Gateway gamescout-ru (TLS: Let's Encrypt, Certificate Manager)
                                             ├─ /, /{file+}  → Object Storage gamescout-ru-site (SPA, fallback index.html)
                                             └─ /api/*, /__gs/health → Cloud Function gamescout-api-proxy
                                                                         └─(секрет + IP посетителя)→ Worker gamescout-origin → D1
Cloudflare остаётся: DNS зоны, gamescout-api (cron-мониторинг), D1, Pages gameradar и Worker route — как откат.
```

| Ресурс | Значение |
| --- | --- |
| Облако / каталог | `cloud-haze-697` / `gamescout` (`b1gee8rjvfqvev92jkcr`) |
| Шлюз | `gamescout-ru`, `d5d9pl6cgdpfk52duoa2.fovt0b64.apigw.yandexcloud.net` (158.160.184.183) |
| Домены шлюза | `gamescout.online` (сертификат `fpq6dopo4ek750a18g49`, до 23.12.2026), `new.gamescout.online` (`fpqvavmfp047p2rorn07`, до 22.12.2026) |
| Функция | `gamescout-api-proxy`, `GS_PUBLIC_ORIGINS` = gamescout.online; new.gamescout.online; домен шлюза |
| Бакет | `gamescout-ru-site`: production-сборка `main` (39b4837), robots.txt с паритетом Cloudflare |
| Бюджет | `gamescout-consumption-guard`: 100 ₽/мес, уведомления при 20 ₽ и 100 ₽ |

## Проверка до переключения (24.09.2026, через IP шлюза с SNI/Host `gamescout.online`)

24/24 PASS, каждый ответ от Yandex (`server: ycalb`, без `cf-ray`):
TLS (сертификат Yandex, serial совпадает), `/`, `/lineage-2`, `/minecraft`, `/gta-rp`, `/catalog`,
`/server/donutsmp`, `/openings`, `/rating` (SPA = index.html побайтно), robots.txt (паритет), sitemap.xml,
постер (побайтно), JS-бандл (immutable), API-каталог 204 КБ / 96 карточек, профиль, фильтр,
cookie → API, `Set-Cookie` ← logout, POST vote → 404/400 без записи, claim → 401, чужой Origin → 403,
CORS preflight → 204, подмена IP-заголовков игнорируется, IP посетителя — реальный.
Браузер (mobile, домен шлюза, та же сборка): без ошибок API, без битых картинок, запросов в Cloudflare нет.
D1 после проверки не изменена (0 событий/голосов/claim/сессий).

## Переключение (только по отдельному разрешению владельца)

Одна запись в Cloudflare → gamescout.online → DNS:

| Было | Стало |
| --- | --- |
| CNAME `gamescout.online` → `gameradar-c1e.pages.dev`, **Proxied** | CNAME `gamescout.online` → `d5d9pl6cgdpfk52duoa2.fovt0b64.apigw.yandexcloud.net`, **DNS only**, TTL 1 min |

Cloudflare сделает CNAME flattening на apex. Остальные записи не трогать; `_acme-challenge` (TXT) оставить.

После переключения проверить: главная, игры, каталог, профиль, `/__gs/health` (ваш IP), POST из UI,
`/api/v1/servers?limit=100` целиком — из РФ (домашний и мобильный) и из Европы.

## Откат (1–5 минут)

Вернуть ту же запись: CNAME `gamescout.online` → `gameradar-c1e.pages.dev`, **Proxied**. Pages custom domain
и Worker route `gamescout.online/api/*` не удаляются, поэтому Cloudflare начинает отвечать сразу; у
DNS-only записи TTL 60 с, резолверы переключатся за 1–5 минут. В Yandex ничего менять не нужно.

## Что будет с new.gamescout.online

Продолжит работать как второй адрес того же шлюза (тот же бакет, функция и данные). После переключения
в нём нет необходимости: можно оставить как запасной адрес или позже отвязать домен от шлюза и удалить
его записи. Индексации не мешает: canonical на всех страницах указывает на `https://gamescout.online`.

## Известные проблемы

- **Мониторинг production — исправлен 24.09.2026** (`exceededCpu` на cron): cron ставит тик в Cloudflare
  Queue `gamescout-monitor`, проход выполняет consumer. После деплоя 16/16 циклов `ok`, CPU consumer
  16–62 мс, cron 0–1 мс, `exceededCpu` = 0; все 42 цели ротируются, `stale` = 0.
- **Сертификат apex выпущен по TXT, а не по CNAME:** Cloudflare держит скрытые TXT на `_acme-challenge`
  для своего сертификата, и CNAME-делегирование не работает. Автопродление Certificate Manager через
  TXT не сработает само: примерно за 30 дней до 23.12.2026 заменить TXT на новое значение из
  `yc certificate-manager certificate get gamescout-online-apex --full`.
- Посетители из Европы тоже идут через Москву (+задержка).
- Мобильные «белые списки» в РФ: Yandex — лучший шанс, но гарантий нет.
- Релиз фронтенда: Pages собирается сам, бакет — вручную:
  `npm run build && node ru-proxy/build.mjs --robots ru-proxy/yandex/robots.production.txt && node ru-proxy/yandex/upload.mjs --bucket gamescout-ru-site`.

## Staging на new.gamescout.online (подготовлено 25.09.2026, не завершено)

`new.gamescout.online` и apex сидят на одном шлюзе, бакете, функции и origin-Worker, поэтому выкатить
кандидата «только на new.» можно лишь отдельной цепочкой. Все ресурсы — free tier, apex не затрагивается.

| Ресурс | Состояние |
| --- | --- |
| Worker `gamescout-origin-staging` (`ru-proxy/wrangler.staging.toml`) | задеплоен: код кандидата, та же D1, `PROXY_ONLY`, секрет стоит; напрямую → 403 |
| Функция `gamescout-api-proxy-staging` (`d4e1hgjf4m0g2cnpbuaj`) | создана, **версии нет** |
| Шлюз `gamescout-staging` (`d5d08arkk9drmr85tso5`) | создан: бакет `gamescout-ru-site`, префикс `staging/`, функция выше; домен не привязан |
| `new.gamescout.online` | **по-прежнему на шлюзе apex** (старая сборка). DNS менять не нужно: обе ingress-IP маршрутизируют по host |

Осталось (каждый шаг — отдельное решение владельца):

1. Версия функции: runtime `nodejs22`, entrypoint `index.handler`, 128 МБ, 30 с, concurrency 1, пакет —
   `ru-proxy/handler.mjs` + `ru-proxy/yandex/index.mjs` (как `index.js`) + `package.json` `{"type":"module"}`;
   env `GS_UPSTREAM=https://gamescout-origin-staging.aire1n-music.workers.dev`,
   `GS_PUBLIC_ORIGINS=https://new.gamescout.online;https://d5d08arkk9drmr85tso5.8wihnuyr.apigw.yandexcloud.net`,
   `GS_PROXY_SECRET` — тот же, что у production-функции.
2. Сборка и загрузка под префикс (apex отдаёт корень бакета и префикс не видит в навигации):
   `npm run build && node ru-proxy/build.mjs --noindex --out ru-proxy/.deploy-staging && node ru-proxy/yandex/upload.mjs --bucket gamescout-ru-site --dir ru-proxy/.deploy-staging/public --prefix staging`.
3. Проверить шлюз по его собственному домену (`/`, `/lineage-2`, `/server/2b2t`, `/__gs/health`, `/api/v1/servers?limit=100`).
4. Перенести домен: `yc serverless api-gateway remove-domain gamescout-ru --domain-id d5di3f0l9asjuhsmp158`,
   затем `yc serverless api-gateway add-domain gamescout-staging --domain new.gamescout.online --certificate-id fpqvavmfp047p2rorn07`.
   Откат — те же команды в обратную сторону.

Уборка, если staging не нужен: удалить шлюз `gamescout-staging`, функцию `gamescout-api-proxy-staging`,
`npx wrangler delete --config ru-proxy/wrangler.staging.toml` и объекты `staging/` в бакете.

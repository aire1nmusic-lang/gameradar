# Перенос gamescout.online на вход через Yandex Cloud

Статус на 24.09.2026: **Yandex готов принять `gamescout.online`** (сертификат выпущен, домен привязан к
шлюзу, production-сборка залита, проверка до переключения пройдена). Apex DNS **не переключён**.

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

- **Мониторинг production (не связан с Yandex).** cron `gamescout-api` завершается `exceededCpu`
  (лимит 10 мс CPU на вызов бесплатного плана): попытки идут, результаты не сохраняются, последний
  успешный `checked_at` — 24.09 05:26 UTC. Оба входа показывают одинаково устаревший онлайн. Нужна
  правка Worker (меньше CPU на вызов) или перенос проб в Yandex Cloud Function; отдельно от переключения.
- **Сертификат apex выпущен по TXT, а не по CNAME:** Cloudflare держит скрытые TXT на `_acme-challenge`
  для своего сертификата, и CNAME-делегирование не работает. Автопродление Certificate Manager через
  TXT не сработает само: примерно за 30 дней до 23.12.2026 заменить TXT на новое значение из
  `yc certificate-manager certificate get gamescout-online-apex --full`.
- Посетители из Европы тоже идут через Москву (+задержка).
- Мобильные «белые списки» в РФ: Yandex — лучший шанс, но гарантий нет.
- Релиз фронтенда: Pages собирается сам, бакет — вручную:
  `npm run build && node ru-proxy/build.mjs --robots ru-proxy/yandex/robots.production.txt && node ru-proxy/yandex/upload.mjs --bucket gamescout-ru-site`.

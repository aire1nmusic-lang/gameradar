# Перенос gamescout.online на вход через Yandex Cloud

Статус: `new.gamescout.online` работает через Yandex (проверено 23.09.2026). Основной домен **не переключён**.

## Результаты проверки (23.09.2026)

| Проверка | Результат |
| --- | --- |
| TLS `new.gamescout.online` | Let's Encrypt (YR1), до 22.12.2026, автопродление Certificate Manager |
| Внешние узлы check-host: Москва ×2, Санкт-Петербург, Нюрнберг, Хельсинки, Амстердам | 200 для страницы, постера и `/api/v1/servers?limit=100` |
| Российский провайдер (Дом.ру, прямой маршрут) → тот же шлюз | главная, `/lineage-2`, `/minecraft`, `/gta-rp`, каталог (96), профиль, mobile/desktop — без ошибок API и битых картинок |
| API > 16 КБ | 201 КБ целиком |
| Cookie / POST / Origin | `Set-Cookie` проходит; голос/claim отвечают 404/400/401 без записи; чужой Origin — 403 |
| IP посетителя | берётся из шлюза; подмена заголовков игнорируется; хеш события в D1 совпал с реальным IP |
| Браузер → Cloudflare | нет (только шлюз и Google Fonts) |

Оговорки: узлы check-host в РФ — дата-центры, они открывают и `gamescout.online` через Cloudflare, поэтому
домашние провайдеры проверяются только реальным пользователем. На машине разработчика VPN-клиент
перехватывает `*.gamescout.online` по имени, поэтому оттуда `new.` не открывается (временный домен шлюза
с того же IP — открывается).

## Схема

```
браузер ──► gamescout.online (DNS only) ──► Yandex API Gateway  (TLS: Let's Encrypt, Certificate Manager)
                                             ├─ /, /{file+}  → Object Storage gamescout-ru-site (SPA, fallback index.html)
                                             └─ /api/*, /__gs/health → Cloud Function gamescout-api-proxy
                                                                         └─(секрет + IP посетителя)→ Cloudflare Worker → D1
Cloudflare остаётся: DNS зоны, Worker(ы), D1, cron-мониторинг, Pages (резерв/откат).
```

Ресурсы Yandex (облако `cloud-haze-697`, каталог `gamescout`): бакет `gamescout-ru-site`, функция
`gamescout-api-proxy`, шлюз `gamescout-ru` (`d5d9pl6cgdpfk52duoa2.fovt0b64.apigw.yandexcloud.net`),
сервисный аккаунт `gamescout-gw`, сертификаты в Certificate Manager, бюджет `gamescout-consumption-guard`.

## Предусловия (до переключения)

1. **Мониторинг production исправлен.** Сейчас `gamescout-api` работает на коде `737129d`, миграция `0005`
   не применена, очередь мониторинга застревает (данные «устарели»). Сначала:
   `npx wrangler d1 migrations apply gamescout --remote` → `npx wrangler deploy` из `main`.
2. **Один код upstream.** После шага 1 перевести `gamescout-origin` на тот же код (`main`):
   `npx wrangler deploy --config ru-proxy/wrangler.origin.toml`. Либо (проще в поддержке) дать
   `PROXY_SECRET` самому `gamescout-api`, указать функцию на его адрес и удалить `gamescout-origin`.
3. **Discord OAuth** (если включён в `main`): redirect URI `https://gamescout.online/api/v1/auth/discord/callback`
   не меняется; колбэк пойдёт через Yandex → функция → Worker. Сам Discord в РФ заблокирован.
4. **Сертификат для apex** выпускается заранее, без переключения трафика (DNS-проверка):
   `yc certificate-manager certificate request --name gamescout-online --domains gamescout.online --challenge dns`
   и CNAME `_acme-challenge` → `<id>.cm.yandexcloud.net` (DNS only) в Cloudflare. Дождаться `ISSUED`.
5. **Сборка без noindex** в бакет (основной домен индексируется; `robots.txt` и `sitemap.xml` — настоящие):
   `npm run build && node ru-proxy/build.mjs && node ru-proxy/yandex/upload.mjs --bucket gamescout-ru-site`.
   Для `new.` тогда нужен отдельный бакет или `noindex` снять только после переключения.
6. Привязать домен к шлюзу: `yc serverless api-gateway add-domain gamescout-ru --domain gamescout.online --certificate-id <id>`
   (до переключения DNS это ни на что не влияет). В функции `GS_PUBLIC_ORIGINS` добавить
   `https://gamescout.online`; в Worker он уже `ALLOWED_ORIGIN`.

## Переключение (по разрешению владельца)

1. Записать текущее состояние apex (для отката): сейчас proxied-записи Cloudflare → Pages `gameradar`.
2. В Cloudflare DNS заменить apex на `CNAME gamescout.online → d5d9pl6cgdpfk52duoa2.fovt0b64.apigw.yandexcloud.net`,
   **DNS only**, TTL 60 (Cloudflare выполнит CNAME flattening на apex).
3. Проверить: главная, игры, каталог, профиль, `/api/v1/servers?limit=100` > 16 КБ, `/__gs/health`, POST,
   `/sitemap.xml`, `/robots.txt`; из РФ (Дом.ру/мобильный) и из Европы.
4. Worker route `gamescout.online/api/*` и Pages custom domain **не удалять** — нужны для отката.

## Откат (≤ 5 минут)

Вернуть apex на прежнюю proxied-запись Pages (оранжевое облако). Proxied-запись отвечает сразу, у
DNS-only записи TTL 60 — резолверы переключатся за 1–5 минут. Ничего в Yandex удалять не нужно.

## Стоимость

Всё в free tier до: 100 тыс. запросов к шлюзу/мес (≈ 40–50 запросов на визит → ~2 тыс. визитов),
1 млн вызовов функции, 1 ГБ хранения, 100 тыс. GET, 100 ГБ исходящего трафика. Сверх: шлюз 142,3 ₽ за
1 млн запросов, функция 18,97 ₽ за 1 млн вызовов + 6,48 ₽ за ГБ×час; трафик сверх 100 ГБ — по прайс-листу
VPC. Бюджет `gamescout-consumption-guard` уведомляет при 20 ₽ и 100 ₽ в месяц.

## Ограничения

- Мобильные «белые списки» в РФ: Yandex Cloud — наиболее вероятный вариант, но гарантий нет.
- Июньская (2026) «заморозка по отпечатку» задевала Yandex Cloud при >3 параллельных TLS-соединениях;
  HTTP/2 держит одно соединение на хост — на проверке из Дом.ру не проявилась.
- Посетители из Европы тоже пойдут через Москву (+задержка); Cloudflare на бесплатном плане не умеет
  гео-DNS. Альтернатива без переноса apex: Redirect Rule в Cloudflare `ip.src.country eq "RU"` →
  `https://new.gamescout.online` (гипотеза: короткий 302 проходит до обрыва на ~16 КБ; проверить).
- При каждом релизе фронтенда — загрузка сборки в бакет (Pages собирается сам).

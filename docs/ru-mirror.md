# RU-зеркало GameScout (без VPN, 0 ₽)

## Схема

```
браузер (РФ) ──► gamescout-ru.vercel.app  (Vercel Hobby, AWS, SNI vercel.app в белом списке ТСПУ)
                   ├─ статика SPA (тот же build, что Pages)
                   └─ /api/*  ──server-to-server──►  gamescout-origin.<account>.workers.dev
                                                        (тот же код и та же D1, что production;
                                                         PROXY_ONLY: без секрета — 403)
```

Браузер пользователя не обращается к Cloudflare. Сторонние хосты страницы — только
`fonts.googleapis.com` / `fonts.gstatic.com`.

| Компонент | Где | Что |
| --- | --- | --- |
| Зеркало | Vercel, проект `gamescout-ru` | `ru-proxy/` → `middleware.js` + `handler.mjs`, `vercel.json` (noindex) |
| Upstream | Cloudflare Worker `gamescout-origin` | `ru-proxy/wrangler.origin.toml`, без cron и routes |
| Production | без изменений | `gamescout-api` (cron, route `gamescout.online/api/*`), Pages `gameradar`, D1 |

Переменные Vercel (Production, зашифрованы): `GS_UPSTREAM`, `GS_PROXY_SECRET`, `GS_PUBLIC_ORIGINS`.
Секрет Worker: `PROXY_SECRET` (тот же, что `GS_PROXY_SECRET`).

## Безопасность

- Не open proxy: upstream задан в env, проксируется только `/api/*`, заголовки запроса — по списку,
  тело ≤ 1 МБ, ошибки upstream не раскрывают его адрес.
- IP посетителя: Vercel сам выставляет `x-real-ip` / `x-forwarded-for` (клиентские значения
  перезаписываются); зеркало передаёт его в `X-GS-Client-IP` вместе с `X-GS-Proxy-Auth`. Worker
  верит IP только при совпадении секрета, поэтому лимиты голосов и дедупликация считают реальных
  посетителей, а не IP Vercel.
- Запись с чужого Origin запрещена и в зеркале, и в Worker (`EXTRA_ORIGINS` — только адреса зеркала).
- Ответы API — `private, no-store`, CDN Vercel их не кеширует.

## Обновление

Фронтенд (после изменений в `main`):

```bash
npm run build && npm run mirror:build
cd ru-proxy/.deploy && npx vercel deploy --prod
```

Worker `gamescout-origin` должен работать на том же коде, что `gamescout-api`, иначе разойдётся схема
D1. Сейчас это `737129d` + патч доверенного IP (production-Worker ещё не обновлён до `main`, миграция
`0005` не применена). Когда production обновят до `main`, origin деплоится из `main`:

```bash
npx wrangler deploy --config ru-proxy/wrangler.origin.toml
```

Откат зеркала целиком: удалить проект `gamescout-ru` в Vercel и `npx wrangler delete --name gamescout-origin`.
Production от этого не зависит.

## Проверка из реальной сети РФ

С 2–3 провайдеров (один — мобильный), без VPN:

1. Открыть https://gamescout-ru.vercel.app — главная, `/lineage-2`, `/minecraft`, `/gta-rp`, `/catalog`, любой профиль.
2. https://gamescout-ru.vercel.app/__gs/health — `ok: true` и ваш IP.
3. Большой ответ целиком (≈ 200 КБ, заморозка обрывает на ~16 КБ):
   ```bash
   curl -s -o /dev/null -w "%{http_code} %{size_download}\n" "https://gamescout-ru.vercel.app/api/v1/servers?limit=100"
   ```
4. Для сравнения то же с `https://gamescout.online/api/v1/servers?limit=100` (ожидается зависание).
5. По возможности — проверка 16 КБ из hyperion-cs/dpi-checkers с URL зеркала.

## Основной домен: план и откат

Собственные домены на Vercel из РФ по данным сентября 2026 зависают так же, как Cloudflare (свой
SNI не в белом списке), поэтому простой перевод DNS `gamescout.online` на Vercel пользователям из
РФ не поможет. Порядок:

1. **Проверить `*.vercel.app` из РФ** (раздел выше). Если не открывается — зеркало на Vercel не
   годится, следующий вариант — Deno Deploy (`*.deno.net`), тот же `handler.mjs` через `Deno.serve`.
2. **Проверить свой поддомен** (дёшево, без риска): `ru.gamescout.online` → CNAME на Vercel,
   DNS only (серое облако), добавить домен в проект и в `GS_PUBLIC_ORIGINS` / `EXTRA_ORIGINS`.
   Откат — удалить запись. Если открывается из РФ — это адрес для российских пользователей.
3. **Перенаправление с основного домена** (гипотеза, проверить): короткий ответ Cloudflare проходит
   до обрыва на ~16 КБ, поэтому Redirect Rule в Cloudflare `ip.src.country eq "RU"` → 302 на
   зеркало может доводить пользователей из РФ до рабочего адреса, не трогая остальных. Сначала
   правило только для пути `/ru-check`, замер из РФ, затем на весь сайт. Откат — выключить правило
   (мгновенно). Минус: SEO и шаринг ведут на `gamescout.online`, пользователь из РФ окажется на
   адресе зеркала.
4. **Не делать**: переводить apex `gamescout.online` с Cloudflare (ломает Worker route, cron-зону и
   не помогает РФ), выключать production Pages/Worker.

Ограничения Vercel Hobby: только некоммерческое использование (платное продвижение серверов
потребует Pro или другой платформы), 100 GB трафика и 10 GB Fast Origin Transfer в месяц.
Мобильный режим «белых списков» зарубежные хостинги не проходят в принципе.

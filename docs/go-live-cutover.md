# Переключение сайта на приватный API (вход, кабинет, админка)

Цель: чтобы `https://gamescout.online/account` и `/admin` работали через приватный API на машине `priv.gamescout.online`, а публичный каталог остался на Cloudflare без изменений.

Готовые части (всё в репозитории):

| Что | Файл |
|---|---|
| Кандидат шлюза, приватные маршруты идут по HTTPS на машину | `ru-proxy/yandex/gateway.vm.template.yaml` (генерация: `node scripts/yandex-private-gateway.mjs --write --vm`) |
| Прокси на машине доверяет IP посетителя только с секретом шлюза | `deploy/vm/Caddyfile`, `deploy/vm/compose.yaml`, `private-api/ingress.mjs` |
| Первая роль ADMIN один раз | `private-api/bootstrap-admin.mjs` |

## Что нужно знать до начала

- Маршруты записи старого каталога (`/dashboard`, `/add-server`, старые голоса) после переключения дают 404: их заменяет приватный API. Публичные `GET` каталога не меняются.
- Шлюз Yandex по умолчанию **не** передаёт заголовки и параметры запроса. В кандидате везде стоит `'*': '*'` и `X-GS-Gateway`, иначе `Cookie` и `Origin` потеряются.
- Реальный IP посетителя приватный API берёт из `X-Forwarded-For` (последняя запись, её добавляет шлюз), но только если пришёл секрет `PRIVATE_GATEWAY_SECRET`. Без него используется адрес соединения. Проверяется на тестовом шлюзе (шаг 3).

## Шаги

### 1. Секрет шлюза и новый Caddy на машине
На машине в `deploy/vm/.env` добавить `PRIVATE_GATEWAY_SECRET=<64 hex>` (сгенерировать `openssl rand -hex 32`), обновить `Caddyfile` и `compose.yaml` из репозитория, затем `sudo docker compose up -d proxy api`. Пока переменная не задана, `proxy` не запустится (`:?required`): сначала секрет, потом перезапуск.

### 2. Кандидат шлюза для проверки
Скопировать `gateway.vm.template.yaml` вне git, подставить:
`__BUCKET__`, `__SERVICE_ACCOUNT_ID__`, `__FUNCTION_ID__` (как в текущем шлюзе), `__PRIVATE_ORIGIN__` = `https://priv.gamescout.online`, `__PRIVATE_HOST__` = `priv.gamescout.online`, `__PRIVATE_GATEWAY_SECRET__` = тот же секрет.

Создать **отдельный** тестовый шлюз с этой спецификацией (не трогая боевой).

### 3. Проверки на тестовом шлюзе
- `GET /api/v1/health` отвечает `{"status":"ok",...}`.
- `GET /api/v1/auth/me` возвращает `providers` с google и discord, `emailLogin: true`.
- Через Google вход возвращается на тестовый адрес и ставит cookie `gs_private_session` (сначала добавить адрес возврата шлюза в приложении Google/Discord, либо проверять уже на боевом шлюзе).
- Запрос с поддельным `X-GS-Gateway` не даёт доверия к IP (в логах `unknown` или адрес соединения).
- `GET /__internal/maintenance` даёт 404. Публичные `/api/v1/games`, `/api/v1/servers` отвечают как раньше.
- Старая запись `POST /api/v1/votes` даёт 404.

### 4. Переключение боевого шлюза (окно 10 минут)
1. Сохранить текущую спецификацию боевого шлюза (для отката).
2. Обновить боевой шлюз кандидатом.
3. Сразу задеплоить Cloudflare Worker с `PUBLIC_ONLY=true` (после `d1 migrations apply`).
4. Повторить проверки шага 3 на `https://gamescout.online`.

### 5. Первый админ
1. Открыть `https://gamescout.online/account`, войти через Google `gamescout.team@gmail.com` (пока Google в режиме теста, этот адрес должен быть в тестовых пользователях).
2. На машине выдать роль один раз:

```bash
cd ~/gamescout-staging/deploy/vm
ID=$(sudo docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select id from gs_users where email = \$\$gamescout.team@gmail.com\$\$"' | tr -d '\r')
sudo docker compose exec -T -e ADMIN_USER_ID="$ID" -e ADMIN_BOOTSTRAP_REASON="Initial owner administrator" api node private-api/bootstrap-admin.mjs
```

Скрипт откажется работать, если ADMIN уже существует. Через API роль ADMIN выдать нельзя, так что права администратора остаются только у этого пользователя.
3. Обновить `/admin`: должны быть видны все разделы.

### Откат
Вернуть сохранённую спецификацию шлюза и убрать `PUBLIC_ONLY` (повторный деплой Worker). Данные приватного API остаются.

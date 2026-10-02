# Задание тестировщику GameScout

Каждый исполнитель сначала читает core-progress.md и roadmap. Не путать этот чеклист с отчетом «все пройдено». Результаты значимых проверок сразу фиксировать в core-progress.md и отдельном отчете: commit/build, среда, браузер, шаги, expected/actual, evidence, severity, blocker, rollback. Не сохранять ПДн/секреты/raw dumps. Задание НЕ выполнено внешним тестировщиком; это план приемки.

## Среда и повторяемость

- Synthetic users/Coins/серверы создаются только в отдельной local/test PostgreSQL, без production URLs/SMTP/Robokassa/OpenRouter/Telegram. Тестовые email .test, явно DEMO. Не загрязнять production ranking, public projection или D1.
- Для каждого сценария три прохода: чистая сессия, повтор/refresh/back, прерывание/плохая сеть. Каждое приложение/вертикаль: L2/Minecraft/GTA RP. Chrome desktop, Firefox, Android 360×800 и iOS 390×844; доступность клавиатуры и увеличение 200%.
- Успех на PGlite не подтверждает lock/concurrency реального PostgreSQL. Конкурентные финансовые тесты повторить на отдельном PostgreSQL17 двумя независимыми подключениями. Browser E2E и live интеграции — отдельные evidence.
- После трех отказов доступа конкретного сервиса остановить повторы, записать blocker и перейти к независимой проверке. Production тесты — read-only или реальный согласованный сценарий без выдуманной активности.

## Матрица приемки

| Область | Проверить |
| --- | --- |
| Вход | email/register closed, confirm expiry/replay, reset/replay, logout/all sessions, неверный пароль, throttling, cookie flags, CSRF/Origin, redirect allowlist |
| OAuth | Google/Discord живой поток только при доступе; VK BLOCKED отдельно; email collision не объединяет чужие аккаунты; link requires session; state/PKCE expiry и повтор |
| Каталог | все 3 игры, фильтры/пагинация, URL/deeplink/back, search/Unicode, unknown online/source/stale, открытие/регион отсутствуют, 0 карточек, 404, API 500/timeout |
| Сервер | фактические характеристики/online history, отдельные ссылки, недоступная/ограниченная ссылка, статистика без выдуманных данных, recent Support, анонимность и fallback эмблемы |
| Голос | verified email, rolling/revote, replay key/conflict, risk/captcha fail, account/device/IP limits, REVIEW/reject, сортировка независима от Coins |
| Claim | подать/повторить, доказательства/пустые поля, только ADMIN approve/reject; grants конкретному серверу; чужой owner read/write 403; отзыв прав немедленный |
| ЛК | один аккаунт player+owner, функции только после admin grant; список owned servers; баланс и ledger; disabled user/session revocation |
| Поддержка | гонка 6 серверов/3 игры/3+ пользователей; participant distinct; anonymous/allowed/review nick; порядок ties; idem replay/conflict; double-click/network retry; overspend и конкурентный debit |
| Ledger | integer/bounds, balance=sum(delta), atomic rollback, append-only, transfer/withdraw denied, production dev fixture denied; ledger записывается независимо от nickname anonymity |
| Refund | ADMIN-only, reason, self-refund denied, повтор/conflict, credit тому же user, history unchanged, public aggregates decrease, retry projection |
| Платеж | только test Robokassa, amount/signature/receipt, forged callback, repeated/parallel notification, reconciliation, pending/failed; real sales disabled |
| Admin | разрешение каждого API; прямой URL не обходит ACL; все разделы/empty/loading/error, audit actor+scope; reader не меняет данные |
| Copyright | missing info/FAKE/DOUBTFUL/valid-human-review, конкретные link/description scopes, restore, карточка остается, repeated job<=3, public version/order/retry |
| AI/egress | raw nickname/evidence не отправляются; Telegram only template+opaque ID; network rejection; no key/no balance; budgets до enable; raw PII не уходит в GitHub/monitoring |
| Operations | maintenance stale, backup unknown/stale/verified, restore drill отдельно, dedup alerts, stopped jobs, Telegram timeout и ограниченные повторы |
| SEO | настоящий HTTP без JS каждого пути, title/description/canonical/JSON-LD/sitemap/robots, noindex unfinished; shell не принимать за prerender |
| Визуал/формы | tab/focus/labels, ошибки ввода, UTF-8/длинные ники, 320px без overflow, modal/scroll, skeleton/empty, image failure/default, стабильные размеры карточек |
| Cookies | чистый браузер до login, cookies/localStorage и network; optional analytics до отказа/после согласия/отзыв; политика соответствует фактическим событиям |
| Изображения (пока отсутствует) | marked BLOCKED: upload/format spoof/oversize/EXIF/script, moderation approve/reject, AVATAR debit once, before approve default, copyright restore |

## Автоматическая гонка в этом срезе

`node --test --test-name-pattern="isolated Support race" tests/private-core.test.mjs`

In-memory PGlite + фактический private API: 3 подтвержденных тестовых аккаунта, 6 серверов, 3 раунда/27 событий, concurrent requests, replay, overspend, balances/ledger, participants, anonymity и неизменность Народного рейтинга. Без сети/боевых fake users. Удаление тестового состояния — закрытие ephemeral DB; production rollback не требуется. Это не browser/real-PostgreSQL нагрузочный тест и не приемка всего продукта.

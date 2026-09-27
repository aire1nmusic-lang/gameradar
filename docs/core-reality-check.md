# Reality Check — 27.09.2026

Согласованный объём: [roadmap](roadmap-2026-09-27.md), включая неизменённые SHOULD HAVE / LATER. Это требования, а не доказательство готовности. Основной домен gamescout.online; историческое имя gameradar сохраняется.

## Фактическая база

Первоначальный checkout `39b4837` отставал от локального `origin/main` на 30 коммитов. Работа перенесена в `codex/private-core` от `571ec6a`; соседний worktree не изменён. Первичный вывод «email/OAuth нет» относился только к старому checkout: актуальная ветка содержит API, но UI входа ещё старый.

| Статус | Область | Наблюдение |
|---|---|---|
| VERIFIED | Cloudflare/D1 | Read-only CLI: production D1 gamescout, миграции 0001–0006, 105 карточек (9 demo), users/claims/votes по 0. Обе версии схемы исследованы; никаких remote записей не выполнено. |
| VERIFIED | Каталог/monitoring | Код содержит три основные игры, реальные импорты, источники/свежесть online, cron+queue, кабинет и Claim файлом. Наличие кода не равно живой приёмке. |
| VERIFIED | Аккаунты | В 571ec6a email-коды, восстановление, 4 OAuth-провайдера и admin API, всё в D1. PBKDF2 15000 и автоматическое связывание Google/Яндекс по email противоречат новому объёму. |
| VERIFIED | SEO HTTP | GET / и /minecraft: 200, по 4504 символа, одинаковый общий title. SPA; route-specific crawlable HTML не подтверждён. API-запросы с этой машины прерывались TLS/timeout — это не доказательство общего отказа API. |
| VERIFIED | Yandex Cloud | `yc.exe` установлен вне PATH; read-only CLI показал две активные Functions и отсутствие Managed PostgreSQL-кластеров в доступном облаке. Runbook описывает существующие Gateway/Object Storage и relay; актуальные права на их изменение и возможность разместить приватный API не подтверждены. |
| VERIFIED | Отсутствующие компоненты | В проверенном коде нет Coins ledger, Robokassa, copyright scope/restore, Telegram triage. Старые boost/promotional UI не соответствуют Поддержке. |
| BLOCKED | Живые интеграции | Новые OAuth credentials, почта, Robokassa test merchant, OpenRouter/Telegram credentials и права поисковых консолей не найдены в локальном окружении. Секреты gamescout-api пусты; отдельно проверяется origin Worker, который реально принимает relay. |
| HYPOTHESIS | Новая приватная БД | PostgreSQL в Yandex и отдельный Node API подходят для транзакций и стойкого password hash; размещение и тариф ещё не выбраны. |

## Архитектурное изменение до реализации

Сейчас приватные данные и публичный каталог находятся в одной D1. Требуется приватный сервис в Yandex: users, credentials, sessions, OAuth state, claims, grants, votes, antifraud, ledger, payments, copyright, audit. D1 остаётся публичной проекцией. Приватные маршруты должны идти непосредственно в Yandex; нельзя пересылать их через Worker, писать в D1 при отказе Yandex или проверять ownership по запаздывающей публичной копии.

Первый срез: PostgreSQL migrations + account HTTP API/UI + Claim/manual review + private permissions + transactional public outbox. Сохраняем существующие OAuth transport adapters, исправляем небезопасное связывание. Сначала локальная приёмка; переключение существующего relay и миграция production — отдельный review с rollback. Незавершённые приватные маршруты в новом режиме закрываются, а не падают обратно на старую D1.

Public outbox пишется в одной PostgreSQL-транзакции с событием. Получатель принимает только allowlist публичных полей; события содержат snapshot и монотонную версию по серверу. Повтор/перестановка доставки не меняет результат. Retry с backoff; метрики pending/oldest age/attempts; доставка не участвует в решении о правах или деньгах. Приёмка требует тестов пропавшего ACK, отката SQL и устаревшего события.

## Официальные источники и применимость

- [D1 batch / Sessions](https://developers.cloudflare.com/d1/worker-api/d1-database/): атомарность batch ограничена D1; sessions дают последовательную согласованность, не транзакцию с Yandex.
- [Yandex PostgreSQL pricing](https://yandex.cloud/ru/docs/managed-postgresql/pricing): хосты, диски, превышение backup и egress оплачиваются отдельно.
- [Google server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server): code exchange, registered redirect, state; provider subject — ключ идентичности.
- [VK официальный SDK](https://github.com/VKCOM/vkid-web-sdk/blob/master/src/auth/auth.ts): PKCE, device_id, state и user_info. Публичный портал docs не открылся; использован первичный код SDK.
- [Яндекс OAuth](https://yandex.ru/dev/id/doc/ru/codes/code-url), [userinfo](https://yandex.ru/dev/id/doc/ru/user-information): code flow и профиль по OAuth token; email не разрешает автоматическое объединение.
- [Robokassa ResultURL](https://docs.robokassa.ru/ru/notifications-and-redirects), [Receipt](https://docs.robokassa.ru/ru/fiscalization): серверное подтверждение, Password#2, точная сумма, подпись с Shp_*, ответ OK+InvId; Receipt участвует в платёжной подписи. Browser success не зачисляет Coins.
- [OpenRouter credits](https://openrouter.ai/docs/api/api-reference/credits/get-remaining-credits), [Telegram Bot API](https://core.telegram.org/bots/api#sendmessage): отдельные серверные credentials; исключить ПДн и токены из уведомлений. Live-проверки не выполнены.

## Стоимость до создания ресурсов

Новые ресурсы не создавались: **0 ₽ новых облачных затрат**. Локальный PostgreSQL WASM для тестов не является production-хранилищем.

Ориентир по опубликованному примеру Yandex (720 часов, Россия): один s3-c2-m8 = 720 × (2×1.8792 + 8×0.5072) = 5627.52 ₽/мес только compute; с 100 ГБ network HDD = 6001.92 ₽/мес. Три таких хоста = 18005.76 ₽/мес до egress/backup сверх лимита/API/mail. Это расчёт из примера, не выбранная конфигурация и не обещание тарифа аккаунта. Перед созданием подтвердить регион, минимальный диск, доступные классы и бюджет в калькуляторе. Более дешёвый локальный стенд выбран для разработки; self-hosted DB на VM требует отдельного сравнения backup/операционных затрат.

## Условия выпуска

Не менять production DNS, реальные платежи или необратимые миграции без отдельного согласования. Перед регистрацией — документы ПДн и подтверждённый mail sender. Перед продажами — утверждённые пакеты/минимальный чек/возвраты/чеки. Старую скидочную сетку не вводить в продажи. Ядро не готово, пока не пройдены игрок → Claim владельца → администратор → голос → тестовый платёж/Поддержка → copyright/restore для L2, Minecraft, GTA RP.

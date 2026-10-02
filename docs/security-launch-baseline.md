# Security launch baseline — 01.10.2026

## Reality Check

| Риск | Статус и имеющаяся защита | Что остается |
|---|---|---|
| Auth brute-force / credential stuffing | VERIFIED local: IP+subject keyed rate-limit, scrypt, одинаковые ошибки, безопасные сессии, Origin проверки | Нет MFA; Turnstile live credentials не настроены |
| Registration/mail spam | VERIFIED production: регистрация закрыта; лимиты писем и токенов | До открытия проверить почтовую инфраструктуру и legal readiness |
| Claim/vote/Support/Coins abuse | VERIFIED local: verified email, scoped grants, ADMIN final approval, idempotency, private ledger, rate limits, risk signals | Ownership challenge еще не реализован; полный production role E2E не пройден |
| Copyright spam / AI injection | VERIFIED local: intake limits, обязательные поля, allowlisted egress, локальная triage/ADMIN | Telegram delivery еще не работает; не считать AI доказательством прав |
| SQL/API/admin/secrets | VERIFIED local: SQL parameters, permissions; VERIFIED live anonymous admin/refund401, PRIVATE proxy secret, D1 PUBLIC_ONLY | Периодический review секретов и исторических D1 данных;32 visitor hash остаются |
| Payment abuse | VERIFIED local: TEST callback signature/amount/idempotency; VERIFIED live sales=false | Merchant credentials и реальный TEST/refund E2E отсутствуют; payment-origin allocation/refund policy еще нужны |
| Upload | VERIFIED source: платный upload еще не открыт | До включения нужны type/size/decode ограничения и private moderation; сейчас не добавлять upload |
| Backup/recovery | VERIFIED: encrypted off-VM upload и отдельный restore rehearsal | Cold backup на ПК удобной командой еще нужен |
| Scraping/API load/DDoS | LIKELY: provider edge и application limits снижают часть риска | Не проводились production load/DDoS тесты; volumetric защита private VM не доказана |

**Важная граница:** gamescout.online сейчас обслуживает Yandex API Gateway. Cloudflare Worker — upstream публичного API. Включение Cloudflare WAF/Bot Fight/Under Attack на другой Cloudflare зоне не защищает автоматически Yandex gateway или прямой VM адрес. Не обещать защиту всего сайта Cloudflare Free и не менять DNS ради нее без отдельного разрешения. Проверить реальные доступные zone settings перед включением challenges. Free Turnstile можно добавить к рискованным операциям после настройки ключей.

Официальные сведения: [Cloudflare DDoS](https://developers.cloudflare.com/ddos-protection/), [Bot Fight Mode](https://developers.cloudflare.com/bots/get-started/free/), [Turnstile](https://developers.cloudflare.com/turnstile/). Не покупать Pro/Business сейчас: сначала измерить реальные edge/VM/API ошибки и источник нагрузки. Платный тариф нужен только если подтвержден конкретный предел применимого бесплатного компонента; цены и покрытие пересчитать перед предложением владельцу.

## Усиленная защита

После деплоя соответствующего API:

```powershell
node scripts/vm-emergency.mjs on
```

Вернуть обычную работу:

```powershell
node scripts/vm-emergency.mjs off
```

Только владелец с существующим Yandex CLI/SSH доступом запускает эти команды. LLM инструменту доступ не выдается. Команда меняет только EMERGENCY_MODE в существующей `.env`, сохраняет owner-only `.env.emergency-before`, пересоздает только API и пишет private audit. БД/схема/DNS/IAM/секреты не меняются. Новая стоимость0.

В режиме on пользовательские write endpoints отвечают503+Retry-After300, регистрация закрывается, существующие application limits становятся в4 раза строже (минимум1). Reads, существующий login/logout, admin с обычными проверками прав и точный Robokassa ResultURL сохраняются. Никакого обхода подписи платежа/ADMIN авторизации нет. Это application circuit breaker, а не volumetric DDoS фильтр. Автоматически включать Under Attack или покупать защиту эта команда не будет.

Если restart/health не прошел: проверить существующий API и восстановить предыдущую `.env.emergency-before` на VM с600 permissions, затем API-only recreate. Не публиковать env или docker compose config.

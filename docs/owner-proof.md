# Подтверждение конкретного сервера

## Reality Check и границы

- **VERIFIED (официальная документация):** DNS TXT используется для проверки контроля домена: [Cloudflare](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/pre-validation/). GameScout проверяет `_gamescout.<официальный-host>`, не переданный заявителем посторонний домен.
- **VERIFIED (официальная документация):** FiveM `sets gamescout_verify TOKEN` публикуется в `info.json`: [Cfx convars](https://docs.fivem.net/docs/scripting-reference/convars/). [Paranoia >=2](https://docs.fivem.net/docs/server-manual/server-commands/) может закрывать endpoint. Автоматическая FiveM проверка GameScout пока **не реализована**: требуется trusted registry endpoint, иначе заявитель докажет контроль своего постороннего сервера.
- **LIKELY:** Minecraft MOTD подходит для публичной публикации кода, но готовая автоматическая проверка владения MOTD в private API отсутствует. Не выдавать monitoring ping за доказательство владения.
- **VERIFIED по текущему коду:** универсального L2 ownership API нет. Сайт/DNS и ADMIN manual fallback применимы всем трем играм.

## Текущий минимальный UX

1. Подтвержденный email → заявка Claim на конкретный server ID, основание и ссылка на уже известный официальный ресурс.
2. Получить код на 30 минут: SITE / DNS / MANUAL. Повторная выдача отменяет предыдущий код.
3. SITE: файл `/.well-known/gamescout-verification.txt` на HTTPS-сайте, указанном в private registry, только строка кода. DNS: TXT `_gamescout.<host>`, только код. Автоматическая проверка сохраняет факт обнаружения и передает на ADMIN review.
4. MANUAL: разместить код на официальном сайте/Discord/Telegram проекта. ADMIN лично открывает известный ресурс и вводит наблюдавшийся код. Код из сообщения заявителя сам по себе доказательством не является. MOTD/FiveM допустимы как ручной способ только при проверяемой связи endpoint с карточкой.
5. Только ADMIN выдает права; no self-review. Claim, proof consumption, scoped grant, audit и public outbox записываются одной PostgreSQL-транзакцией. Права других серверов не появляются.

## Защита / проверка / откат

Код сохраняется только SHA256 в `gs_claim_proofs`; plaintext возвращается владельцу при выдаче и не попадает в audit/D1/Telegram/AI. Expiry, rotation, cross-server misuse, чужая сессия, approval без доказательства и replay покрываются API-тестом. Network: HTTPS, pinned public IPv4, native DNS, никаких redirects/credentials, 5 секунд и 4KB. IPv6 пока закрыт; при недоступности — MANUAL.

Migration022 только добавляет private table. Existing VERIFIED grants сохраняются. Pending legacy claims тоже требуют доказательство перед новым approval. Перед production: verified encrypted backup, SHA256 migration plan, source/image rollback. Откат приложения к прежнему image/source; additive table/audit сохранять, не удалять и не откатывать уже выданные права молча. Откат на старое приложение временно возвращает старую политику Claim — учитывать при восстановлении.

Локальные тесты не доказывают настоящий Claim в production. Контролируемого owner test server пока нет; не создавать права на чужие реальные серверы ради приемки.

# Приёмка ядра: проверено и что ещё нужно

Факты20.10.2026, без объявления готовности всего ядра. Свежий статус всегда в [core-progress.md](core-progress.md). Production private API/БД/DNS в этом срезе не изменялись.

| Срез | Фактическое доказательство | Что не доказано |
| --- | --- | --- |
| Реальная SQL-приёмка | Локальный PostgreSQL17, TLS с verified CA,24 миграции и повторный migrate; игрок → владелец → админ для3игр | Эти миграции и исходники на действующей VM |
| Деньги | Synthetic подписанный TEST callback, повтор/гонки →1PURCHASE; spend/refund concurrency, баланс=ledger, People rating не меняется | Настоящий Robokassa test checkout/callback, чеки; реальные продажи выключены |
| Восстановление | GPG test key, custom pg_dump, decrypt SHA совпадает, pg_restore в отдельную БД; counts/ledger/audit/triggers совпали; fixture keys/container/volumes удалены | Расшифровка/восстановление настоящей production копии; наличие recovery kit вне этого ПК |
| Голоса | Прежняя гонка IP воспроизведена (201+201), после исправления IP/device/ASN races дают201+403, challenge/replay проверены; IPv6 canonicalization | Реальный ASN resolver на входе VM, реальная Turnstile и живой игрок с подтверждённой почтой |
| Backup | Metadata audit последнего объекта07.10; encrypted21955bytes независимо скачаны, SHA/size совпали; unknown/stale heartbeat теперь alert | Fresh production backup, ежедневный cron действующей VM, restore production копии |
| Доступ | HTTPS Gateway/VM отвечают, main auth503; GitHub repo/environment VM key отсутствует, локальный agent не запущен | SSH в действующую VM; старую остановленную VM не запускать |
| Уведомления/AI | Local egress/Telegram relay/queue/triage/restore tests; raw PII не передаются | Настоящая Telegram delivery, OpenRouter inference; сырые nickname/evidence по текущей политике не отправляются |

## Воспроизведение без production данных

Нужны установленный и запущенный Docker Desktop/Engine, Node.js, OpenSSL, GnuPG (`gpg`/`gpgconf`). Windows использует Git-for-Windows tools при их наличии. Новые облачные сервисы не создаются; Docker image остаётся локальным кешем. На CI расходуются существующие runner minutes и трафик registry.

```powershell
npm run test:private
$env:PRIVATE_LOCAL_POSTGRES_REHEARSAL='1'
npm run test:postgres
node scripts/audit-private-backups.mjs
```

Последняя команда только читает storage metadata, сохраняет `output/private-backup-audit.json`; stale/unknown завершается ненулевым кодом. Она не доказывает cron, целостность содержимого или restore. Независимая encrypted копия: `node scripts/download-cold-backup.mjs`. Не хранить рядом production recovery key и не расшифровывать production БД в публичном/test окружении.

`test:postgres` игнорирует production DATABASE_URL/CA/ключи: создаёт random localhost-only контейнер, временные synthetic secrets, PostgreSQL с TLS,3game fixtures, race tests, encrypted dump/restore. Очистка ограничена собственным случайным label и проверенной временной папкой; никакого `docker system prune`, удаления чужих volumes или остановки чужих сервисов. Report: ignored `output/local-postgres-acceptance.json`.

## Что требуется для продолжения production

1. **Операторский SSH:** локально доступная authorized identity действующей VM, strict pinned known-hosts и фактически проверенный deploy path. Ключи/пароли в чат или Git не присылать. Existing read-only GitHub workflow ждёт secrets `VM_SSH_PRIVATE_KEY`, `VM_SSH_KNOWN_HOSTS` и variables `VM_SSH_USER`, `VM_DEPLOY_PATH`. Не угадывать прежние defaults и не добавлять новый ключ/право доступа автоматически.
2. **Первым делом свежая копия:** на действующей VM проверить volumes/cron/права backup bucket/recipient; сделать encrypted backup, сверить PUT/HEAD/SHA, затем отдельно restore в disposable БД. Ничего не применять к production schema до этого. Снять migration plan/hash, сравнить с ожидаемым и согласовать необходимое схемное изменение отдельно.
3. **Private API release:** после backup и подтверждения совместимости24 схем развернуть только проверенные private API исходники; сохранить `.env`, TLS, volumes и предыдущий image/source, проверить health/auth/risk/операционные alerts, откатить при неуспехе. Сейчас эти исправления в исходниках/CI, не на VM.
4. **Домен:** [готовый план](release-plan-2026-10-15.md), отдельное «переключай» и операторский DNS/custom-domain доступ. Зафиксировать исходные записи/Worker binding и откат. В текущем срезе DNS не трогать.
5. **Живая приёмка:** почта/Google/Discord, recovery, player/owner/admin3игры, Robokassa test и Telegram. Сначала проверить существующие env/config на VM, не просить повторно создавать приложения/бота. При отсутствии нужны Unisender/SMTP, OAuth, Robokassa test, Turnstile и Telegram credentials — вводятся приватно в env. Проверку внешнего OpenRouter отдельно согласовать по safe DTO/допустимым данным; наличие API key не снимает этот блокер.

Откат кода этого среза — предыдущий main24ade8a/образ private API, без изменения схемы. Денежные ledger/audit не удалять, регистрация и реальные продажи остаются закрытыми. Откат frontend — существующий verified release manifest + hash-verified private archive; новые дополнительные пути bucket автоматически не удаляются.

Canonical IP вводится без хранения исходных IP: старые HMAC нельзя пересчитать обратно. Для ранее неканонических IPv6 форм в первый день после rollout risk bucket может отличаться от исторического; account rolling window и challenge сохраняются. Это не доказательство «один человек — один голос».

CSS/media аудит:12 CSS-файлов не содержат соседних полностью идентичных rules/declarations для безопасного автоматического удаления. Из151 медиа найдены5 byte-identical пар Essence/старого master (~1.47MB); наличие старых URL, design previews и отдельного publish-keyart не позволяет считать их ненужными только по совпадению байтов. Ассеты и CSS не удалены/не переписаны; cleanup требует отдельной reference/screenshot сверки. Принятый внешний вид сохранён.

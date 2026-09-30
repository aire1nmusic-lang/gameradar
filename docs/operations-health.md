# Free operational checks v1

Существующий `/api/v1/health` проверяет PostgreSQL SELECT 1 и возвращает только технический статус. `/api/v1/admin/system` требует system.read и теперь включает operations: DB roundtrip, maintenance heartbeat age/status, stopped copyright/nickname/Telegram counters, human nickname review count. Ни emails, ни queue payloads, ни request bodies не экспортируются. ADMIN «События» показывает snapshot существующим стилем, дизайн не перерабатывается.

Heartbeat хранится в существующей private `gs_system_alerts` как maintenance_heartbeat, отдельно от alerts UI. Пишется только в конце успешно завершившегося maintenance, не от frontend refresh и не от старта API. Нет heartbeat => unknown; старше 300s => stale. Это успешное выполнение worker, а не гарантия доставки каждого события. Ошибка/остановленные jobs видны отдельно. При первом stopped job идет один Telegram event, при исчезновении stopped jobs — recovery. Состояние неизменно => новых уведомлений нет.

Backup пока **unknown**: независимый upload/restore heartbeat не подключен; наличие cron/VM не означает успешную копию. Статус не подменяется зеленым. Следующий шаг — связать backup script с private heartbeat только после успешного PUT/HEAD и separately фиксировать restore rehearsal. Secrets/object names в public endpoint не выводить.

Local tests: roles 401/403/ADMIN200; unknown/fresh/stale; alerts dedup/recovery; public health не содержит private snapshot; Telegram synthetic message ignored. Без новых миграций или ресурсов. Это application checks, не full VM monitoring: disk/RAM и падение самой VM требуют native Yandex metrics + независимый внешней probe. Worker probe должен читать только public health, не admin endpoint; credentials/raw logs туда не передавать. Монитор на этой же VM не дает независимости.

Live Telegram BLOCKED до подтвержденных TELEGRAM_BOT_TOKEN / TELEGRAM_ADMIN_CHAT_ID в RU runtime; ключи не записывать в docs/chat. Сначала send-only; callbacks/approval/restart отсутствуют. OpenRouter/Sonnet не включен: нужны incident DTO, budget reservations, privacy routing и ограниченный key; raw copyright/nickname channels остаются закрытыми.

Rollback: revert operational module/UI commit; не откатывать egress privacy-срез к raw inference с живыми ключами. Таблицы/данные удалять не требуется. Existing private heartbeat row можно оставить: никакие private grants/payments/ledger не затронуты.

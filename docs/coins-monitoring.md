# Журнал Coins и контроль целостности

Private PostgreSQL — единственный источник финансовых данных. ADMIN/FINANCE с coins.read видят журнал в админке: операции, тип, signed delta, пользователь, связанная Поддержка/заказ, private details. Фильтры userId/kind/relatedId, страницы50. GET /admin/coins/journal; GET /admin/coins/integrity. Обычный кошелек не раскрывает основания подарков/бартера.

Ledger и audit append-only; исправление новой записью. Журнал не является доказательством отсутствия накрутки: валидные, но подозрительные операции требуют отдельного анализа поведения.

Maintenance раз в5мин выполняет один SQL snapshot: wallet=sum(delta), Support debit/recipient/relation, refund credit, test payment PURCHASE, orphan financial rows, admin-promo audit. Возвращает OK/REVIEW, counts и первые100 private samples. Alert coins_integrity фиксирует переход в gs_audit и gs_telegram_outbox; повтор той же проблемы не спамит, восстановление отдельное событие. Failure выполнения не обновляет heartbeat; checkedAt позволяет заметить устаревшую проверку. Проверка ничего не начисляет/не списывает/не блокирует.

Для будущего event-driven AI: coinIncidentContext принимает исключительно opaque eventRef/status/total/allowlisted category counts. Не передавать samples, ledger rows, user IDs, emails, IP или details. Реальный Sonnet runtime и вызовы модели пока НЕ включены. Telegram получает фиксированный текст и opaque ID; доставка зависит от существующего сетевого блокера VM.

Runbook: открыть Coins → REVIEW → сопоставить sample ref с журналом и audit/Support/orders; подтвердить источник ошибки до изменения. Не редактировать старые ledger/audit и не автоматически править balance по AI-выводу. Коррекции только через согласованную атомарную операцию с новым ledger и audit. Откат этого среза: предыдущий API image/source + index сайта; схема неизменна, созданные monitoring schedule/alerts допустимо оставить.

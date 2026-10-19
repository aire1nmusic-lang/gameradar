# Проверяемый выпуск без изменения DNS

Актуальный путь — `.github/workflows/deploy-production.yml`: существующий Yandex bucket и asset version Worker `gamescout-emergency-preview`, который сейчас обслуживает основной домен. Worker сохраняется как временный совместимый путь: publisher скачивает его текущий единственный модуль и точные API bindings, отказывается от неожиданной конфигурации и не меняет routes/custom domains/DNS. Старую незавершённую заготовку отдельного edge publisher из checkout 14.10 не применять поверх текущего main.

## До изменения трафика

1. Private tests, Claim routing, public ranking в настоящем workerd, fault tests выпуска/SEO, bundle, сборка и повторная сверка живого публичного каталога.
2. `tests/mobile-ux-browser.mjs`: 320×568 / 390×844 / 768×1024 / 1024×768 / 1440×900 / 844×390; три игры, поддержка, Claim, поиск, CTA у футера и восстановление формы при auth503. API writes запрещены фикстурой. Старые девять suites требуют удалённую светлую тему/старую DOM-структуру и сохранены как legacy; production gate использует актуальный сценарий. Это эмуляция, не аппаратная приёмка Android.
3. Предыдущие mutable файлы Yandex архивируются, архив приватно загружается и независимо скачивается с проверкой SHA256. Hashed assets остаются для отката.
4. `node scripts/publish-primary-worker.mjs --snapshot` сохраняет в `output/primary-release/rollback.json` полный предыдущий traffic split, ID deployment и SHA предыдущего HTML. Только технические данные, без email/токенов/source. Обязательный upload-artifact сохраняет manifest **до** активации; ошибка загрузки блокирует выпуск.
5. Кандидат проверяется по отдельному version URL: шесть страниц, SHA и точные bytes JS/CSS, cache policy и полный HTTP SEO без JS. Неуспех оставляет основной Worker неизменным; Yandex mutable файлы восстанавливаются workflow.

## После активации

Publisher проверяет основной домен, ассеты, публичные API, title/description/canonical/JSON-LD/noindex, robots/sitemap, 404 страницы и отсутствующих ассетов. Пустой HTTP404 допустим: у него нет индексируемого содержимого; HTML404 обязан иметь noindex. HTTP200 на неизвестном URL/ассете всегда проваливает gate.

Manifest сначала синхронно сохраняет candidate/activating. Потерянный ответ deployment API не считается доказательством отсутствия изменения: publisher читает активное распределение. При ошибке восстанавливает **весь** исходный split и проверяет старый SHA по HTTP. Чужой параллельный deployment не затирает. Неудачная проверка отката фиксируется как `rollback-blocked`, не как успех. Финальный manifest и screenshot report загружаются always; workflow выходит с ошибкой после попытки восстановления bucket.

## Ручное восстановление

Скачать `primary-rollback-RUN-ATTEMPT` или финальный `primary-release-result-RUN-ATTEMPT` из соответствующего GitHub run. Сверить worker, предыдущий SHA и текущую версию. Через существующий Cloudflare deployment API восстановить **все** `{version_id,percentage}` из `previous.versions`, затем проверить SHA/шесть страниц/public API. Не выбирать просто предпоследний элемент списка versions. Предыдущие version IDs доступны только пока Cloudflare сохраняет эти версии; manifest не является офлайн-копией Worker assets.

Yandex архив: `_deployment-backups/SHA/RUN-ATTEMPT/site-rollback.tar.gz`, приватный ACL, SHA256 в metadata. Восстановление изменяемых файлов использует существующие операторские ключи и записанный bucket; старые assets не удаляются. Текущий sync отката не удаляет новые дополнительные пути: после изменения набора страниц нужна отдельная сверка таких путей. Это явное ограничение, не гарантированный byte-for-byte rollback всего bucket.

Новый ресурс не создаётся; расходуются существующие квоты GitHub artifacts, Cloudflare versions и Object Storage. Регистрация/реальные платежи/production DNS этим выпуском не включаются. Приватный ingress переключается только по отдельному плану [release-plan-2026-10-15.md](release-plan-2026-10-15.md).

Проверенные первичные справки: [Cloudflare rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/) и [GitHub workflow artifacts](https://docs.github.com/en/actions/tutorials/store-and-share-data).

# Production projection и SEO — 01.10.2026

## Подтверждено

- Existing Yandex VM → existing gamescout-origin Worker: доставлены все70 прежних outbox событий; pending0. Новый backfill не выполнялся.
- D1 public_server_projection:70 строк, всеversion1. Повторная отправка той же версии дважды вернула200, число/версии не изменились. Все70 приватных payload проверены по public allowlist.
- Production gateway теперь отдает `{file}/index.html` вместо SPA fallback. Загружены100 HTML объектов, reconciliation70/70/0 mismatches.
- `SEO_BASE_URL=https://gamescout.online node tests/seo-http.mjs`: raw HTTP трех игр, server profile каждой игры, catalog, description/title/canonical, robots/sitemap, account/admin noindex, неизвестный404/noindex прошли.
- API prefix сохранен byte-for-byte; health200, admin/refund без session401, realSales=false. Production IAB Lineage2 визуально работает; proof в ignored output/seo-lineage-live.jpg.

## Откат

Gateway spec содержит секрет; не печатать/не коммитить. На ПК владельца owner-only каталог `Documents/GameScout Secrets/seo-20261001`: before.yaml и candidate.yaml. SHA256 прежнего spec:8c656ac4a676111bbf71b20b1652567758e04714e6c36d167351164a98d43bf0.

Вернуть прежний routing существующей CLI:

```powershell
$taskBefore = Join-Path $env:USERPROFILE 'Documents\GameScout Secrets\seo-20261001\before.yaml'
& "$env:USERPROFILE\yandex-cloud\bin\yc.exe" serverless api-gateway update --id d5d9pl6cgdpfk52duoa2 --spec $taskBefore --retry 0
```

Projection rollback на VM: восстановить защищенный `deploy/vm/.env.projection-rollback-20260930` как `.env`, затем `docker compose up -d --no-deps api`. Это останавливает последующие доставки; уже полученные публичные версии нельзя понижать или удалять. При проблеме данных нужна поздняя компенсирующая версия.

## Не считать завершенным

- В production нет owned cards; реальное controlled owner edit → projection → website еще не проверено. Не назначать права и не менять чужой сервер ради теста.
- Allowlist DTO не доказывает отсутствие ПДн в произвольном public description/URL; модерация публичного содержимого остается обязательной.
- Статический HTML — snapshot каталога при сборке. Изменения dynamic online/Support видны API/JS, но обновление prerender после будущих owner edits нужно включить в релизный процесс. Это не SSR и не доказательство всех role E2E.
- Стоимость: новых ресурсов/фиксированных платежей0;100 PUT в существующий bucket и обычные D1/Worker/gateway операции по действующим тарифам.

# GitHub → Yandex Object Storage production deploy

## Что уже сделано

- `.github/workflows/ci.yml` — проверяет каждый push/PR: private tests, сборку из live public catalog, SEO/reconciliation и bundle.
- `.github/workflows/deploy-production.yml` — ручная публикация статического сайта в существующий bucket `gamescout-ru-site`.
- Production workflow ничего не удаляет из bucket. Перед публикацией сохраняет текущие HTML/robots/sitemap и другие не-asset файлы как rollback artifact. Новые hashed assets загружаются первыми.
- После публикации workflow проверяет live SEO/404 и JS/CSS. При ошибке возвращает предыдущие не-asset файлы.

## Одно действие владельца

GitHub connector не умеет создавать repository secrets. Нужны два GitHub Actions secret:

- `YC_ACCESS_KEY_ID`
- `YC_SECRET_ACCESS_KEY`

Использовать отдельный Yandex Cloud service account/static access key с минимальными правами только на нужный Object Storage bucket. Не использовать owner/admin ключи и не коммитить секреты.

Добавить: GitHub → gameradar → Settings → Secrets and variables → Actions → New repository secret.

После этого: Actions → Deploy production site → Run workflow → ввести `DEPLOY`.

Первый запуск считать production VERIFIED только после успешного workflow и отдельной проверки gamescout.online.

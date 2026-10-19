# Единственный недостающий Claim маршрут — кандидат, production не изменён

VERIFIED 19.10: `yc serverless api-gateway get-spec --id d5d9pl6cgdpfk52duoa2` прочитал действующую спецификацию. Резервная копия: `output/gateway-audit/current-spec.yaml` в рабочей копии `output/core-reliability-20261019`, 13 886 байт, SHA256 `2545ef42395427e4584045cf42b52157508155d6f67ae7074c0ef563f4472e06`. Файл исключён из Git, поскольку содержит действующие заголовки доступа.

В live 33 пути, в исправленном vm-seo template 34. Единственный отсутствующий live путь — `/api/v1/claims/{path+}`. Текущий `/{file+}` уже читает `{file}/index.html` из Object Storage с error_object; независимый неизвестный URL вернул404. Возвращать старый SPA fallback или повторно исправлять рабочий SEO-маршрут не требуется.

## Минимальный diff

Кандидат клонирует действующий `/api/v1/owners/{path+}` с сохранением его параметров, proxy headers, query и timeouts, меняя только путь owners→claims. Существующие33 пути и прочая спецификация структурно сверены без отличий. Секретные значения ниже намеренно скрыты; кандидат хранит прежние значения без изменения.

```diff
+/api/v1/claims/{path+}:
+  x-yc-apigateway-any-method:
+    parameters:
+      - name: path
+        in: path
+        required: false
+        schema: { type: string }
+    x-yc-apigateway-integration:
+      type: http
+      url: https://priv.gamescout.online/api/v1/claims/{path}
+      headers:
+        "*": "*"
+        Host: "[прежнее значение без изменения]"
+        X-GS-Gateway: "[прежний секрет без изменения]"
+      query: { "*": "*" }
+      omitEmptyHeaders: true
+      omitEmptyQueryParameters: true
+      timeouts: { connect: 3, read: 25 }
```

`output/gateway-audit/candidate-spec.yaml`: SHA256 `9eba8e50677ff3fb7a6e29302a64bbde25fc14b64e38ce3337f28ee16d64b8f3`. Он не загружался в Yandex. Локально проходят проверки маршрутизации всех объявленных private endpoints, включая proof/check. Отдельный облачный тестовый шлюз и внешняя проверка кандидата на нём пока **не выполнены**; это не VERIFIED staging.

## Риск и откат

Новый greedy route направит запросы доказательства владения в существующий private API; его авторизация и одноразовый proof остаются обязательными. Секреты и остальные маршруты не меняются. Возможны ошибка валидации спецификации или несовместимость обработки path-параметра на самом Gateway — потому локальный route test не заменяет приёмку облачного стенда.

Перед применением: снова прочитать live spec, проверить исходный SHA; при любом drift остановиться и подготовить новый diff/backup. После отдельно согласованного теста/production изменения проверить health, anonymous auth, public catalog/rating, 404 и разрешённый Claim proof scenario. Не выдавать Claim чужого сервера ради проверки.

Откат: `yc serverless api-gateway update --id d5d9pl6cgdpfk52duoa2 --spec output/gateway-audit/current-spec.yaml`, затем независимые HTTP health/auth/rating/404. Проверить CLI syntax перед выполнением. Обе команды update требуют отдельного согласования production Gateway из исходного задания владельца; ни update, ни DNS не запускались. Переключение apex DNS — другой план [release-plan-2026-10-15.md](release-plan-2026-10-15.md) и отдельное «переключай».

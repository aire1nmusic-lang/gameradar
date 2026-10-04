# Мировые страницы и рейтинги — решение владельца 04.10.2026

На странице мира и хроники только три блока: Топ поддержка, Скоро открытие, Топ онлайн. Список каталога ниже отсутствует. Preview: до 5 строк на телефоне (включая низкий landscape до 1023px), до 15 на планшете/ПК. Данные не дополнять вымышленными строками. «Все» ведёт в соответствующий полный список.

На /rating две независимые колонки: Поддержка (Coins) и Народный (голоса текущего окна). Одинаковые лимиты preview, «Все» раскрывает выбранную колонку, «Свернуть» возвращает preview. Оплата никогда не меняет число голосов или Народный рейтинг. Онлайн доступен в каталоге как сортировка, отдельной вкладки рейтинга нет.

## Общий топ каталога

Три равные доли, именно 1/3 (33⅓%, суммарно 100%): голоса, поддержка Coins, свежий известный онлайн. Каждый показатель нормализуется по порядковому месту среди различных положительных значений внутри одной игры: rank(value)/count(distinct positive values). Одинаковые значения получают одинаковый балл; нули, неизвестные и устаревшие значения дают 0. Отсутствующая категория не перераспределяет свой вес. Миллион игроков не имеет большего веса, чем лидер по голосам или Coins. Равные итоговые баллы: название, затем стабильный ID. Фильтры не меняют нормализацию — она считается по полному публичному каталогу выбранных игр.

Это смешанная витрина, которая прямо учитывает платную поддержку. Она не называется независимым/народным рейтингом. Первые 3 результата выделяются; остальные обычные. Фильтры и дополнительные сортировки сохранены. При ошибке агрегатов показываем ошибку и повтор, не выдумываем нули. Это MVP-формула; с реальным трафиком оценить чувствительность к накрутке и временные окна. Backend antifraud/ledger остаются источником истины, frontend не выдаёт финансовых/владельческих прав.

Открытия: только будущие даты, ближайшие сначала, без медалей или paid promotion. Общая строка не выделяет близость открытия цветом.

## Один аккаунт

PLAYER по умолчанию; OWNER только по подтверждённым конкретным серверам; ADMIN видит статус «Администратор» и административные инструменты внутри /account. Отдельного входа или header-ссылки нет. /admin совместимо перенаправляет на /account. Все операции всё ещё проверяет private API по permissions, UI не является защитой. Управление статусом владельца уже существует в разделе Пользователи через Claim/grants; общий глобальный доступ к чужим серверам не выдаётся. Игрок может подать Claim, но owner editors/statistics появляются только с реальными grants.

Стоимость: новых сервисов/ресурсов 0; чтение существующих public catalog + allowlisted aggregate API. Обновление изображений следующий отдельный этап.


## Visual inspection mode (04 October)
The administrator can enable **Демо визуала** in account management. Only that authenticated administrator's browser decorates server cards with deterministic sample votes, support amounts and several SVG avatar variants. A banner labels every preview and offers an off switch. The preference is local, and no sample is written to PostgreSQL, D1, vote ledgers, payment or Coins APIs. Anonymous/player browsers ignore the preference. Actual online and opening dates remain unchanged. The catalogue, world panels and both rating columns use the same sample set; no demo page enters the public SEO snapshot.

All layouts expose Home/Catalogue/Rating/Openings: desktop header, phone/tablet bottom navigation. Favorites remains in account. Phone/tablet chronicles are a disclosure with consistent 2:1 cards, with upcoming servers shown before the other two panels when present; otherwise online comes first. Preview limits remain5phone/15desktop. Administration has five groups with contextual tabs on desktop and a labelled native section picker on smaller screens. Account/Coins stay reachable below mobile management. Admin JS is fetched only when needed; discovery cards and aggregates load concurrently with a15s query cache, failures evicted.

Official source changes: TheBattle Nostalgia x10 uses its current legacy `server_eternal_x15` block, validated against its visible world name. L2MAD x30 uses `/online-count` key5, identified by homepage `data-server-id=5`. Do not map key9 to an upcoming world or treat Eternal's load indicator as player count. The source-only workflow backs up exactly two public unclaimed source configurations before reversible changes; no schema or private/financial change is involved.

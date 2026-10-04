# Мировые страницы и рейтинги — решение владельца 04.10.2026

На странице мира и хроники только три блока: Лидеры поддержки, Скоро открытие, Топ онлайн. Список каталога ниже отсутствует. Preview: до 5 строк на телефоне (включая низкий landscape до 1023px), до 15 на планшете/ПК. Данные не дополнять вымышленными строками. «Все» ведёт в соответствующий полный список.

Актуальное решение владельца: на /rating три колонки: Лидеры поддержки (Coins), Скоро открытие (будущие объявленные даты) и Выбор игроков (голоса текущего окна). В двух рейтингах все опубликованные серверы выбранной игры, включая нули; полные списки внутри доступных с клавиатуры прокручиваемых панелей, без ограничения5/15. На главной лимиты5/15 остаются. Оплата никогда не меняет число голосов или Народный рейтинг. Онлайн доступен в каталоге как сортировка, отдельной вкладки рейтинга нет.

## Общий топ каталога

Три равные доли, именно 1/3 (33⅓%, суммарно 100%): голоса, поддержка Coins, свежий известный онлайн. Каждый показатель нормализуется по порядковому месту среди различных положительных значений внутри одной игры: rank(value)/count(distinct positive values). Одинаковые значения получают одинаковый балл; нули, неизвестные и устаревшие значения дают 0. Отсутствующая категория не перераспределяет свой вес. Миллион игроков не имеет большего веса, чем лидер по голосам или Coins. Равные итоговые баллы: название, затем стабильный ID. Фильтры не меняют нормализацию — она считается по полному публичному каталогу выбранных игр.

Это смешанная витрина, которая прямо учитывает платную поддержку. Она не называется независимым/народным рейтингом. Первые 3 результата выделяются; остальные обычные. Фильтры и дополнительные сортировки сохранены. При ошибке агрегатов показываем ошибку и повтор, не выдумываем нули. Это MVP-формула; с реальным трафиком оценить чувствительность к накрутке и временные окна. Backend antifraud/ledger остаются источником истины, frontend не выдаёт финансовых/владельческих прав.

Открытия: только будущие даты, ближайшие сначала, без медалей или paid promotion. Общая строка не выделяет близость открытия цветом.

## Один аккаунт

PLAYER по умолчанию; OWNER только по подтверждённым конкретным серверам; ADMIN видит статус «Администратор» и административные инструменты внутри /account. Отдельного входа или header-ссылки нет. /admin совместимо перенаправляет на /account. Все операции всё ещё проверяет private API по permissions, UI не является защитой. Управление статусом владельца уже существует в разделе Пользователи через Claim/grants; общий глобальный доступ к чужим серверам не выдаётся. Игрок может подать Claim, но owner editors/statistics появляются только с реальными grants.

Стоимость: новых сервисов/ресурсов 0; чтение существующих public catalog + allowlisted aggregate API. Обновление изображений следующий отдельный этап.


## Visual inspection mode (04 October)
The administrator can enable **Демо визуала** in account management. Only that authenticated administrator's browser decorates server cards with deterministic sample votes, support amounts and several SVG avatar variants. A banner labels every preview and offers an off switch. The preference is local, and no sample is written to PostgreSQL, D1, vote ledgers, payment or Coins APIs. Anonymous/player browsers ignore the preference. Actual online and opening dates remain unchanged. The catalogue, world panels and the support and player-vote rating columns use the same sample set; no demo page enters the public SEO snapshot.

All layouts expose Home/Catalogue/Rating/Openings: desktop header, phone/tablet bottom navigation. Favorites remains in account. Phone/tablet chronicles are a disclosure with consistent 2:1 cards, with upcoming servers shown before the other two panels when present; otherwise online comes first. Preview limits remain5phone/15desktop. Administration has five groups with contextual tabs on desktop and a labelled native section picker on smaller screens. Account/Coins stay reachable below mobile management. Admin JS is fetched only when needed; discovery cards and aggregates load concurrently with a15s query cache, failures evicted.

Official source changes: TheBattle Nostalgia x10 uses its current legacy `server_eternal_x15` block, validated against its visible world name. L2MAD x30 uses `/online-count` key5, identified by homepage `data-server-id=5`. Do not map key9 to an upcoming world or treat Eternal's load indicator as player count. The source-only workflow backs up exactly two public unclaimed source configurations before reversible changes; no schema or private/financial change is involved.

## Поддержка и прогноз позиции — текущий визуальный срез
На /rating калькулятор поддержки: сервер, целое1..10000Coins, быстрые суммы, текущая/предполагаемая позиция и соседние карточки с движением. На мобильном сначала выбор/сумма, затем прогноз, затем действие. reduced-motion отключает анимацию. Списки обновляются30сек при видимой странице; после подтвержденной поддержки кэш очищается. На главной действий покупки/поддержки нет, профиль и ЛК дают ссылку в рейтинг. Демо использует примеры и не допускает транзакций.
Поддержка сортируется coins DESC, participants DESC, id ASC как действующий privateAPI. Голоса — votes DESC,id ASC. Прогноз рассчитывает только одну игру. При равной новой сумме показан диапазон возможных мест: принадлежность пользователя к уже поддержавшим приватна, и публичные агрегаты не позволяют обещать точное место при равенстве. Любой прогноз — снимок, новые действия/возвраты могут изменить результат. Смешанный общий топ каталога и его1/3 веса не меняются.

## Граница правовой проверки
Это интерфейс существующей поддержки за GS Coins, не новая платежная услуга, не благотворительное пожертвование и не гарантия трафика/ТОП-1. Цены пакетов/скидки/сроки не вводятся, реальные продажи не включаются. Переименование не определяет правовую квалификацию. До включения коммерческого продвижения нужно отдельно оценить применимость38-ФЗ18.1 (интернет-реклама, сведения о рекламодателе, идентификатор/учёт черезОРД), обязательств18.2 и54-ФЗ (чеки), реквизитов/оферты/возвратов; этот срез не заявляет готовность к продажам или юридическое соответствие всего сервиса.
Проверенные источники: [статья18.1 38-ФЗ](https://www.consultant.ru/document/cons_doc_LAW_58968/2c4537e4796f6ff8b2736ed1b0d4fef08e14458e/), [разъяснениеФАС об информации на сайтах](https://www.consultant.ru/document/cons_doc_LAW_458545/), [ФНС об электронных чеках](https://www.nalog.gov.ru/rn31/news/activities_fts/12291416/). Классификация конкретного платного рейтинга ещё не подтверждена юристом.

## Значки и визуальная иерархия
БазовыйSVGнабор переиспользуется: Coins/поддержка,голоса,открытие,online,владелец,подтверждение,статистика. Медали1/2/3 сохраняют читаемые номера/золото-серебро-бронзу; L2герб,MCпиксельныйщит,GTAскошенныйжетон. Значок источника означает реальный статус проверки, не обещание безопасности/качества сервера. Владельцу полезны подтверждение прав,статистика и настройка проекта; статус выдаётся backendpermissions,не декоративно. Светлая шапка мира: тёмные тексты/иконки, светлые отдельныеконтролы, без общей фоновойполосы; hall/account artwork сохраняют отдельныйконтраст.

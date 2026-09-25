# Промпты для картинок GameScout (ChatGPT / GPT Image)

## Формат — что просить и что прислать

Одна картинка на игру работает сразу в трёх местах: шапка страницы игры, плитка на главной, шапка страницы сервера.
Поэтому она широкая, а главный объект стоит справа.

| Параметр | Значение |
| --- | --- |
| Соотношение сторон | **21:9** (самое широкое, что даёт ChatGPT; если только 16:9 — тоже подойдёт) |
| Размер | чем больше, тем лучше; **минимум 2560 px по ширине**, идеально 3800+ |
| Главный объект | в **правой трети** кадра (60–95 % ширины) |
| Левые 40 % | спокойные: небо, дымка, поле — сюда ложатся название игры и поиск |
| Верх 8 % и низ 12 % | без важных деталей: сверху шапка сайта, снизу обрезка |
| Свет | светлый, яркий, день или золотой час — **не ночь, не мрак** |
| Нельзя | текст, буквы, цифры, логотипы, интерфейс, рамки, склейка из двух картинок |
| Файл | оригинал **PNG**, без сжатия |

Как режется на сайте:
- **Компьютер:** полоса 1920×600 по центру высоты. Левая часть под текстом слегка затемняется.
- **Телефон:** окно 390×440 вокруг главного объекта. Поэтому объект нужен целиком, а не обрезанный краем.

Куда класть: `F:\GameHub\Постеры\новые\` с именем игры — `lineage-2.png`, `minecraft.png`, `gta-rp.png`,
`rust.png`, `cs2.png`, `dayz.png`. Для хроник и режимов: `lineage-2-interlude.png`, `minecraft-anarchy.png` и так далее.
Можно просто прислать в чат.

Промпты на английском: так модель точнее держит композицию. В начале каждого промпта общий блок, его не менять.

---

## Общий блок (вставлять первым в каждый промпт)

```
Ultra-wide 21:9 website header artwork, one continuous seamless scene (no split panels, no seams, no borders).
Composition: the main subject sits in the right third of the frame (60–95% of the width), fully visible;
the left 40% continues the same scene naturally but stays calm and uncluttered (sky, haze, soft landscape)
so a white headline and a search bar can sit on top of it; keep important details out of the top 8% and the bottom 12%.
Lighting: bright, luminous, warm daylight or golden hour, vivid saturated colors, clear air with depth — not dark, not night, not gloomy.
Quality: premium AAA game key art, cinematic, crisp, highly detailed, correct anatomy, clean hands and weapons.
Absolutely no text, letters, numbers, logos, watermarks, user interface or signs with writing.
```

---

## Lineage 2

Четыре готовых варианта от GPT Image уже есть: Башня Дерзости, осада замка, Антарас, Эльфийская деревня.
Их можно выбрать сразу, без генерации. Промпты ниже — если хочется ещё.

**A. Башня Дерзости и Аден**
```
[общий блок]
Promotional key art for the Korean MMORPG Lineage II (NCSOFT), Interlude era. On the right third the colossal Tower of Insolence —
an ancient ornate spire of pale marble and gold rising through the clouds — with the white-walled royal city of Aden and its
deep-blue slate roofs at its foot. In the right foreground on a rocky ledge a party of Lineage II races in their signature look:
a Human knight in ornate dark-gold plate armor with a tower shield and a long sword glowing with the iconic Lineage II enchant
aura (shimmering blue-white flames along the blade); a slender Elf archer with pale skin, long silver-blue hair and white-and-teal
armor; a Dark Elf woman with ashen blue-grey skin, long white hair and pointed ears in an ornate black-and-violet robe with a
glowing purple staff; a huge tan-skinned Orc in fur-and-bone armor with war paint; a short Dwarf with a braided red beard,
goggles and a heavy hammer. Korean MMORPG character design: tall, elegant, detailed faces, ornate filigree armor.
Left side: a wide golden-hour sky over a green valley and a distant river.
```

**B. Осада замка**
```
[общий блок]
Promotional key art for Lineage II (NCSOFT): a clan castle siege. On the right half a massive white-stone castle with blue conical
roofs and golden trims (Aden / Giran style) under siege: many players, colorful clan banners, siege golems, spells and fire arrows
arcing through the air. In the right foreground a Human paladin in ornate dark-gold plate raises a sword glowing with the iconic
Lineage II enchant aura, next to a Dark Elf woman with ashen blue-grey skin and long white hair casting violet magic and an Elf
archer with silver-blue hair drawing a long bow. Left side: the same battlefield fading into a calm bright sunset sky and hills.
```

**C. Рейд на Антараса**
```
[общий блок]
Promotional key art for Lineage II (NCSOFT): a raid boss fight. On the right half the colossal earth dragon Antharas — enormous,
armored, brown-green stone-like scales, huge curved horns, glowing amber eyes — rears up in a vast sunlit rocky canyon.
In the right foreground a raid party charges: a Human knight with a tower shield, a Dark Elf with ashen blue-grey skin casting
violet magic, an Elf archer with silver-blue hair, an Orc shaman with tribal paint, a Dwarf with a braided beard and a hammer;
their weapons glow with the Lineage II enchant aura. Left side: open bright sky with warm sunbeams and drifting dust.
```

**D. Эльфийская деревня (настроение экрана входа Interlude)**
```
[общий блок]
Promotional key art for Lineage II (NCSOFT) in the mood of the classic Interlude login screen. On the right third an Elf mage woman
in ornate white-and-gold robes with long silver-blue hair and pointed ears, holding a staff with the Lineage II enchant glow, stands
on a marble balcony of the Elven Village next to the giant luminous Mother Tree with glowing leaves and floating light motes;
beside her a Dark Elf swordsman with ashen blue-grey skin and long white hair in black ornate armor with a dual-blade sword.
Left side: an enchanted forest valley and a wide bright sunset sky.
```

**Хроники** (заменить сюжет, общий блок тот же):
- `lineage-2-interlude.png` — вариант D или A.
- `lineage-2-high-five.png`: `Lineage II High Five: the Seed of Destruction — a floating dark-crystal fortress in the sky; a Kamael soldier with one white wing and a huge rapier, a Human knight and an Elf archer on a cliff; bright sunset.`
- `lineage-2-essence.png`: `Lineage II Essence (modern NCSOFT remaster look): sleek glowing armor with cyan runes, a Human warrior and a Dark Elf assassin in front of a bright crystal-blue magical city, clean modern MMORPG render.`
- `lineage-2-classic.png`: `Lineage II Classic: the peaceful starting village on Talking Island — wooden houses, a windmill, green hills and sea, a young Human fighter and an Elf mage in simple starter armor, soft morning light, nostalgic.`

---

## Minecraft

**A. Деревня и замок**
```
[общий блок]
A blocky voxel sandbox world where every object is made of cubes, in the style of Minecraft: a bright sunny valley. On the right
third a cozy voxel village and a cobblestone castle with towers and torches, a waterfall into a turquoise lake, oak and birch
trees, a player character in shiny diamond armor holding a diamond pickaxe on a grassy hill, sheep and a horse nearby,
cube-shaped white clouds. Left side: clear blue sky and gentle grassy hills. Clean crisp voxel render with ray-traced lighting.
```

**B. Небесные острова (SkyBlock)**
```
[общий блок]
Minecraft-style voxel world made entirely of cubes: on the right third floating sky islands at sunrise with waterfalls pouring
off their edges into the clouds, a small wooden house, a tree and a chest on the largest island, glowing diamond and emerald ores
in the cliffs, a player standing at the edge with a diamond sword. Left side: soft pastel morning sky with a few cube clouds.
```

**Режимы** (сюжет вместо A/B):
- `minecraft-anarchy.png`: `Minecraft anarchy server: a huge griefed ruined city of blocks with lava flows and TNT craters on the right, a player in netherite armor on top of a ruined tower, bright day, dramatic but not dark.`
- `minecraft-skyblock.png` — вариант B.
- `minecraft-minigames.png`: `Minecraft BedWars minigame arena: colorful floating island bases with wool beds of different colors connected by block bridges, players in team-colored armor, bright sky.`

---

## GTA RP

Стиль обложек загрузочных экранов GTA V: иллюстрация с чёткими контурами, насыщенные цвета.

**A. Бульвар и персонажи**
```
[общий блок]
In the illustrated style of Grand Theft Auto V loading-screen artwork (bold outlines, painterly shading): a sunny palm-lined
boulevard of a Los Santos-like city at golden hour. On the right third a group of roleplay characters: a police officer next to
a black-and-white patrol car with a light bar, a businessman in a tailored suit, a biker leaning on a chrome chopper, a woman in
sunglasses next to a glossy orange sports coupe; glass skyscrapers and green hills behind. Left side: warm orange-pink sky over
the street. No license plates with text, no brand names.
```

**B. Пляж и пирс**
```
[общий блок]
In the illustrated style of Grand Theft Auto V loading-screen artwork: a sunny Vespucci-like beach promenade and wooden pier with a
Ferris wheel on the right third, a candy-colored lowrider and a white convertible under tall palm trees, roleplay characters
strolling, a lifeguard tower and surfers. Left side: turquoise ocean and a bright clear sky. No signs with text.
```

---

## Rust

**A. База на холме**
```
[общий блок]
Rust (Facepunch) survival game key art: on the right third a fortified base built from wooden logs, corrugated sheet metal and
stone on a grassy hill by the sea; a fully geared player in a metal facemask and road-sign armor with a crossbow stands at the
gate, next to a fresh-spawn survivor wearing only shorts, holding a rock and a torch; a campfire, a rusty radar dome and wind
turbines in the distance. Left side: bright sunrise sky over a misty coastline.
```

**B. Нефтяная вышка**
```
[общий блок]
Rust (Facepunch) survival game key art: on the right third a huge rusty offshore oil rig in a sunny open sea, cranes and shipping
containers on its decks, an attack helicopter circling it; a small rubber boat with two armored players speeds toward it leaving a
white wake. Left side: sparkling calm sea and a bright clear sky.
```

---

## CS2

Первая партия CS2 вышла с дефектами (склейка, выдуманный сайт в кадре), поэтому обе заново.

**A. Пустынный город (в духе Dust II)**
```
[общий блок]
Counter-Strike 2 key art (Source 2 realism): a sunlit Middle-Eastern desert town of sandstone walls, arches, wooden double doors and
narrow streets in the spirit of the map Dust II. On the right third a squad of four counter-terrorist operators in modern tactical
gear and helmets advancing through an archway with rifles, dust glowing in strong afternoon sun, wooden crates. Left side: warm
sandstone rooftops and a wide bright blue sky. No website UI, no navigation bars.
```

**B. Итальянская деревня (в духе Inferno)**
```
[общий блок]
Counter-Strike 2 key art (Source 2 realism): a colorful Italian village with pastel houses, flower balconies and cobblestone
streets in the spirit of the map Inferno. On the right third two terrorists in balaclavas plant a bomb by a stone fountain while a
counter-terrorist aims from a balcony above. Left side: bright sky and a glimpse of distant hills.
```

---

## DayZ

Первые варианты «дорога» вышли со склейкой, «побережье» получились нормальными.

**A. Дорога через деревню (Черноруссия)**
```
[общий блок]
DayZ (Bohemia Interactive) key art set in Chernarus, Eastern-European countryside: on the right third a lone survivor with a big
hiking backpack and a hunting rifle walks along an empty cracked asphalt road past an abandoned rusty Soviet hatchback with open
doors; a village with wooden houses and a white church with an onion dome, golden autumn birch trees, two distant infected in the
field. Left side: wide clear pale-blue autumn sky over fields. No road signs with text.
```

**B. Холм над побережьем (в духе Электрозаводска)**
```
[общий блок]
DayZ (Bohemia Interactive) key art: on the right third two survivors with backpacks and rifles stand on a green hill with
wildflowers overlooking an abandoned Soviet coastal town with a harbor, a red-and-white lighthouse and a rusted cargo ship run
aground. Left side: bright blue sky and calm sea.
```

---

## Живая шапка (видео)

Видео делается из уже одобренной картинки: она становится первым и последним кадром, поэтому ролик зацикливается без скачка.
Демо на Minecraft (Seedance 2.5, 720p, 5 с) — в чате.

Цены OpenArt за 5 секунд без звука, со скидкой подписки:

| Модель | Качество | Кредиты | Заметки |
| --- | --- | --- | --- |
| PixVerse V6 | 1080p | 135 | дешевле всех в 1080p |
| Kling 3.0 pro | 1080p | 158 | рекомендую для компьютера: стабильная картинка, держит петлю |
| Seedance 2.0 Mini | 720p | 180 | |
| Seedance 2.0 | 720p | 360 | режет кадр в 16:9 |
| Seedance 2.5 | 720p | 585 | как в демо; 1080p — от 1700 |

**Мобильная версия.** Широкое видео 21:9 на телефоне превращается в узкую полоску, а если его обрезать, получается мыло.
Поэтому на телефон идёт отдельное вертикальное видео 9:16 из вертикальной обрезки той же картинки. Это второй ролик,
PixVerse 1080p за 135 кредитов. Итого около 290 кредитов на игру, около 1750 на все шесть.

Правила показа на сайте, чтобы видео не вредило:
- Сначала всегда показывается картинка, видео плавно проявляется поверх, когда загрузилось. Страница не прыгает.
- Видео не грузится при включённой экономии трафика, на медленной сети и при системной настройке «уменьшить движение».
- Без звука, 5–6 секунд по кругу. Вес: 1,5–2,5 МБ на компьютере, до 1 МБ на телефоне.
- Если вертикального ролика нет, телефон показывает неподвижную картинку.

Промпт для анимации (подставляется к любой картинке):
```
Seamless looping ambient animation of this exact picture for a website header background. Keep exactly the same framing and
composition, no cuts, no new objects, no camera shake. Gentle motion only: [что движется — вода, облака, флаги, огонь,
дым, листья, свечение оружия, дыхание персонажей]. Very slow, subtle camera push-in. The last frame returns to the first frame
for a perfect loop. No text.
```

---

## Если картинка не подходит

- **Объект по центру, а не справа:** допишите `Move the main subject further to the right; leave the left 40% as open sky.`
- **Темно:** `Make it much brighter, high-key daylight, no dark areas.`
- **Появился текст или логотип:** `Remove all text, letters and logos.`
- **Видна склейка:** `One single continuous camera shot, no split, no seam.`

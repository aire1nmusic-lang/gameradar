import test from 'node:test'
import assert from 'node:assert/strict'
import { openingDate, announcedOpening, gta5rpWorlds, minecraftList, minecraftDetail } from '../scripts/discovery/facts.mjs'
import { robotsAllowed, publicAddress } from '../scripts/discovery/http.mjs'
const now = new Date('2026-10-27T18:00:00Z')
test('opening dates require a real launch, valid calendar date and nearby year', () => {
  assert.equal(openingDate('Открытие 30 октября 2026 в 18:00',now), '2026-10-30')
  assert.equal(openingDate('Старт 03.11.2026',now), '2026-11-03')
  assert.equal(openingDate('Grand opening November 3, 2026',now), '2026-11-03')
  for (const text of ['Открытие 03.11.2025','Открытие 31.11.2026','Открытие 29.02.2026','Registered 30.10.2026','ОБТ старт 30.10','Wipe opens 30.10','Новый сезон старт 30.10','Обновление 30 октября','Турнир старт 30.10']) assert.equal(openingDate(text,now),null,text)
  assert.equal(openingDate('Старт 2 января',new Date('2026-12-20Z')), '2027-01-02')
})
test('unrelated dates and conflicting announcements are not combined', () => {
  assert.equal(announcedOpening('<p>Открытие скоро</p><p>Обновление 30.10.2026</p>',now),null)
  assert.equal(announcedOpening('<p>Открытие 30.10.2026</p><p>Старт 31.10.2026</p>',now),null)
  assert.equal(announcedOpening('<p>Открытие <b>30 октября 2026</b></p>',now),'2026-10-30')
  assert.equal(announcedOpening('<script>"Открытие 30.10.2026"</script>',now),null)
})
test('GTA SSR identifies worlds, never accepts arbitrary hosts or malformed endpoints', () => {
  const worlds = [{name:'Mirror',host:'mirror.gta5rp.com',port:22005},{name:'Bad',host:'localhost',port:22005},{name:'Other',host:'fake.gta5rp.com.attacker.net',port:22}]
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({props:{pageProps:{values:{list:worlds}}}})}</script>`
  assert.deepEqual(gta5rpWorlds(html),worlds.slice(0,1))
  assert.deepEqual(gta5rpWorlds('<html>challenge</html>'),[])
})
test('Minecraft facts require a dedicated official website; registration is not an opening', () => {
  assert.deepEqual(minecraftList('<a href="/server-s1"></a><a href="/server-s1"></a><a href="/server-s2"></a>'),['1','2'])
  const html = '<h1>Test MC</h1><button data-clipboard-text="play.network.net:25566"></button><tr><td><strong>Website</strong></td><td><a href="https://network.net/">Website</a></td></tr>'
  assert.equal(minecraftDetail(html).endpoint.port,25566)
  assert.equal(minecraftDetail(html.replace('https://network.net/','https://discord.gg/abc')),null)
})
test('robots honours agent groups, longest rules and wildcard exclusions', () => {
  const robots = 'User-agent: *\nDisallow: /private\nDisallow: /*?*\nAllow: /private/public\nUser-agent: Googlebot\nAllow: /'
  assert.equal(robotsAllowed(robots,'/private/a'),false)
  assert.equal(robotsAllowed(robots,'/private/public/a'),true)
  assert.equal(robotsAllowed(robots,'/?login=1'),false)
  assert.equal(robotsAllowed(robots,'/'),true)
  assert.equal(robotsAllowed('User-agent: GameScoutBot\nDisallow: /\nUser-agent: *\nAllow: /','/'),false)
})
test('discovered URLs cannot target private/loopback addresses', () => {
  for (const address of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.0.1','172.16.0.1','100.64.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1']) assert.equal(publicAddress(address),false,address)
  assert.equal(publicAddress('8.8.8.8'),true)
  assert.equal(publicAddress('2606:4700:4700::1111'),true)
})

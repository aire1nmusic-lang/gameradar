/**
 * Real-server import dataset: loading, validation and SQL.
 *
 * The dataset in import/*.json is curated by hand from public sources. Only
 * facts are accepted — name, official website, public endpoint, chronicle or
 * mode, rates, opening date, language and country. There is deliberately no
 * field for a description, a logo or a screenshot: another project's
 * advertising copy and artwork must never be copied into GameScout, so the
 * validator rejects any key it does not know.
 *
 * The generated SQL is idempotent. Row ids derive from the record key, every
 * write is an upsert that changes a row only when a fact changed, and a card
 * claimed by its owner is never overwritten by an import.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

export const DATASET_DIR = path.resolve('import')

const GAMES = {
  lineage2: { prefix: 'l2', endpoint: ['LOGIN_SERVER'], website: true },
  minecraft: { prefix: 'mc', endpoint: ['GAME_PROTOCOL'], website: true },
  gtarp: { prefix: 'gta', endpoint: ['SERVER_API'], website: true },
  // Source-engine games answer A2S over UDP, which a Worker cannot send: no
  // direct probe, online only from OFFICIAL/EXTERNAL sources. Many community
  // servers have no website, so it is optional here.
  rust: { prefix: 'rust', endpoint: [], website: false },
  cs2: { prefix: 'cs2', endpoint: [], website: false },
  dayz: { prefix: 'dayz', endpoint: [], website: false },
}

/** Online sources a record may declare, and what each needs. */
const SOURCE_PROVIDERS = {
  mcsrvstat: { tier: 'EXTERNAL', name: 'mcsrvstat.us', config: ['address'] },
  mcstatus: { tier: 'EXTERNAL', name: 'mcstatus.io', config: ['address'] },
  // BattleMetrics' API needs a paid subscription since 2026 — kept for when one exists.
  battlemetrics: { tier: 'EXTERNAL', name: 'BattleMetrics', config: ['id'] },
  // Valve's master server; read only when the Worker has STEAM_API_KEY.
  steam: { tier: 'EXTERNAL', name: 'Steam', config: ['address'] },
  official_json: { tier: 'OFFICIAL', name: 'Сайт проекта', config: ['url', 'path'] },
  official_html: { tier: 'OFFICIAL', name: 'Сайт проекта', config: ['url', 'regex'] },
}

const RECORD_KEYS = new Set([
  'key', 'game', 'name', 'website', 'chronicle', 'version', 'modes', 'rates', 'openedAt', 'languages',
  'country', 'region', 'endpoint', 'onlineSources', 'source', 'refs', 'checkedAt', 'confidence', 'notes',
])
const ENDPOINT_KEYS = new Set(['method', 'host', 'port', 'url', 'expectName'])
const REF_KEYS = new Set(['name', 'url'])

const q = value => (value === null || value === undefined ? 'NULL' : typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'")

export class DatasetError extends Error {}

function fail(where, message) {
  throw new DatasetError(`${where}: ${message}`)
}

function str(value, where, field, min, max) {
  if (typeof value !== 'string') fail(where, `${field} must be a string`)
  const v = value.trim()
  if (v.length < min || v.length > max) fail(where, `${field} must be ${min}–${max} characters`)
  if (/[\u0000-\u001f]/.test(v)) fail(where, `${field} contains control characters`)
  return v
}

function optionalStr(value, where, field, max) {
  return value === null || value === undefined ? null : str(value, where, field, 1, max)
}

function publicHost(host, where, field) {
  const h = String(host).toLowerCase()
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split('.').map(Number)
    if (a === 10 || a === 127 || a === 0 || a >= 224 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127)) {
      fail(where, `${field} must be a public address`)
    }
    return h
  }
  if (!h.includes('.') || !h.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)) || /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(h)) {
    fail(where, `${field} must be a public hostname`)
  }
  return h
}

function httpsUrl(value, where, field) {
  const raw = str(value, where, field, 8, 500)
  let url
  try { url = new URL(raw) } catch { fail(where, `${field} is not a URL`) }
  if (url.protocol !== 'https:') fail(where, `${field} must use https`)
  if (url.username || url.password || url.hash) fail(where, `${field} must not carry credentials or a fragment`)
  publicHost(url.hostname, where, field)
  return url.toString()
}

function isoDate(value, where, field) {
  if (value === null || value === undefined) return null
  const raw = str(value, where, field, 10, 40)
  if (!/^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(raw)) fail(where, `${field} must be ISO-8601`)
  const time = Date.parse(raw.length === 10 ? raw + 'T00:00:00Z' : raw)
  if (!Number.isFinite(time)) fail(where, `${field} is not a valid date`)
  return new Date(time).toISOString()
}

function ref(value, where) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(where, 'source entries must be {name,url}')
  for (const key of Object.keys(value)) if (!REF_KEYS.has(key)) fail(where, `unknown source field "${key}"`)
  const url = str(value.url, where, 'source url', 8, 500)
  try { if (!['http:', 'https:'].includes(new URL(url).protocol)) throw 0 } catch { fail(where, 'source url must be http(s)') }
  return { name: str(value.name, where, 'source name', 2, 80), url }
}

function endpoint(value, game, where) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || Array.isArray(value)) fail(where, 'endpoint must be an object')
  for (const key of Object.keys(value)) if (!ENDPOINT_KEYS.has(key)) fail(where, `unknown endpoint field "${key}"`)
  const method = str(value.method, where, 'endpoint.method', 3, 20)
  if (!GAMES[game].endpoint.includes(method)) fail(where, `endpoint.method ${method} is not supported for ${game}`)
  const port = value.port === null || value.port === undefined ? null : Number(value.port)
  if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) fail(where, 'endpoint.port must be 1–65535')
  if (method === 'SERVER_API') {
    const raw = str(value.url, where, 'endpoint.url', 10, 300)
    let url
    try { url = new URL(raw) } catch { fail(where, 'endpoint.url is not a URL') }
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.username || url.hash) fail(where, 'endpoint.url must be a bare http(s)://host:port/')
    publicHost(url.hostname, where, 'endpoint.url')
    // The master list is not our source of truth, and a relay is not a direct endpoint.
    if (/(^|\.)(fivem\.net|cfx\.re|cfx-services\.net)$/i.test(url.hostname)) fail(where, 'endpoint.url must be the server itself, not a Cfx.re service')
    return { method, host: null, port: null, url: url.toString(), expectName: optionalStr(value.expectName, where, 'endpoint.expectName', 80) }
  }
  return { method, host: publicHost(str(value.host, where, 'endpoint.host', 3, 253), where, 'endpoint.host'), port, url: null, expectName: null }
}

function onlineSource(value, where) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(where, 'onlineSources entries must be objects')
  for (const key of Object.keys(value)) if (!['provider', 'url', 'config'].includes(key)) fail(where, `unknown onlineSources field "${key}"`)
  const spec = SOURCE_PROVIDERS[value.provider]
  if (!spec) fail(where, `unknown online source provider ${value.provider}`)
  const config = value.config ?? {}
  if (typeof config !== 'object' || Array.isArray(config)) fail(where, 'onlineSources.config must be an object')
  for (const key of Object.keys(config)) if (![...spec.config, 'maxPath'].includes(key)) fail(where, `unknown ${value.provider} config "${key}"`)
  for (const key of spec.config) str(String(config[key] ?? ''), where, `${value.provider}.${key}`, 1, 300)
  if (config.url) {
    let url
    try { url = new URL(config.url) } catch { fail(where, `${value.provider}.url is not a URL`) }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.hash) fail(where, `${value.provider}.url must be plain http(s)`)
    publicHost(url.hostname, where, `${value.provider}.url`)
  }
  if (config.regex) {
    let re
    try { re = new RegExp(config.regex) } catch { fail(where, 'official_html.regex does not compile') }
    if (new RegExp(re.source + '|').exec('').length !== 2) fail(where, 'official_html.regex must have exactly one capture group')
  }
  if (value.provider === 'steam' && !/^\d+\.\d+\.\d+\.\d+:\d{1,5}$/.test(String(config.address))) fail(where, 'steam.address must be ip:port')
  if (config.id !== undefined && !/^\d{1,12}$/.test(String(config.id))) fail(where, 'battlemetrics.id must be numeric')
  const publicUrl = value.url === undefined || value.url === null ? null : str(value.url, where, 'onlineSources.url', 8, 300)
  return { tier: spec.tier, provider: value.provider, name: spec.name, url: publicUrl, config: config.id !== undefined ? { ...config, id: String(config.id) } : config }
}

/** Validates one raw record and returns the normalised form. */
export function validateRecord(raw, file = 'record') {
  const where = `${file}:${raw?.key ?? '?'}`
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(where, 'record must be an object')
  for (const key of Object.keys(raw)) {
    if (!RECORD_KEYS.has(key)) fail(where, `unknown field "${key}" — only public facts are importable (no descriptions or images)`)
  }
  const game = str(raw.game, where, 'game', 2, 20)
  if (!GAMES[game]) fail(where, `unknown game ${game}`)
  const key = str(raw.key, where, 'key', 4, 120)
  if (!new RegExp(`^${GAMES[game].prefix}:[a-z0-9][a-z0-9.:-]*$`).test(key)) fail(where, `key must look like ${GAMES[game].prefix}:<slug>`)

  const name = str(raw.name, where, 'name', 2, 80)
  if (/https?:|www\./i.test(name)) fail(where, 'name must not contain a URL')
  const modes = raw.modes === undefined ? [] : raw.modes
  if (!Array.isArray(modes) || modes.length > 8) fail(where, 'modes must be an array of up to 8 labels')
  const languages = raw.languages === undefined || raw.languages === null ? [] : raw.languages
  if (!Array.isArray(languages) || languages.length > 12) fail(where, 'languages must be an array of up to 12 labels')
  const country = optionalStr(raw.country, where, 'country', 2)
  if (country && !/^[A-Z]{2}$/.test(country)) fail(where, 'country must be an ISO 3166-1 alpha-2 code')

  const refs = raw.refs
  if (!Array.isArray(refs) || !refs.length || refs.length > 10) fail(where, 'refs must list 1–10 public sources')
  const confidence = str(raw.confidence, where, 'confidence', 5, 12)
  if (!['confirmed', 'likely'].includes(confidence)) fail(where, 'confidence must be confirmed or likely')
  const normalizedRefs = refs.map(item => ref(item, where))
  // A catalogue listing alone is an advertisement; "confirmed" needs a second, independent page.
  if (confidence === 'confirmed' && new Set(normalizedRefs.map(item => new URL(item.url).hostname.replace(/^www\./, ''))).size < 2) {
    fail(where, 'confirmed records need at least two independent sources')
  }

  const record = {
    key,
    game,
    name,
    website: (raw.website === null || raw.website === undefined) && !GAMES[game].website ? null : httpsUrl(raw.website, where, 'website'),
    chronicle: optionalStr(raw.chronicle, where, 'chronicle', 40),
    version: str(raw.version ?? '', where, 'version', 0, 40),
    modes: modes.map(item => str(item, where, 'modes[]', 2, 30)),
    rates: optionalStr(raw.rates, where, 'rates', 80),
    openedAt: isoDate(raw.openedAt, where, 'openedAt'),
    languages: languages.map(item => str(item, where, 'languages[]', 2, 30)),
    country,
    region: optionalStr(raw.region, where, 'region', 20),
    endpoint: endpoint(raw.endpoint, game, where),
    onlineSources:
      raw.onlineSources === undefined
        ? []
        : Array.isArray(raw.onlineSources) && raw.onlineSources.length <= 4
          ? raw.onlineSources.map(item => onlineSource(item, where))
          : fail(where, 'onlineSources must be an array of up to 4'),
    source: ref(raw.source, where),
    refs: normalizedRefs,
    checkedAt: isoDate(raw.checkedAt, where, 'checkedAt') ?? fail(where, 'checkedAt is required'),
    confidence,
  }
  if (record.game === 'lineage2' && !record.version) fail(where, 'Lineage 2 records need the chronicle label in version')
  // Every Minecraft address also gets a third-party fallback: when our own
  // ping cannot reach a server (e.g. behind Cloudflare Spectrum, which a
  // Worker may not connect to), its online is still known — as EXTERNAL.
  // Two monitors, because one can be blocked by the server and report it down.
  if (record.game === 'minecraft' && record.endpoint) {
    const address = record.endpoint.host + (record.endpoint.port ? ':' + record.endpoint.port : '')
    const defaults = [
      { provider: 'mcstatus', url: `https://mcstatus.io/status/java/${address}`, config: { address } },
      { provider: 'mcsrvstat', url: `https://mcsrvstat.us/server/${address}`, config: { address } },
    ]
    for (const item of defaults) if (!record.onlineSources.some(source => source.provider === item.provider)) record.onlineSources.push(onlineSource(item, where))
  }
  return record
}

/** Loads and validates every import/*.json file. Duplicate keys or names are errors. */
export function loadDataset(dir = DATASET_DIR) {
  const records = []
  for (const file of readdirSync(dir).filter(name => name.endsWith('.json')).sort()) {
    let list
    try { list = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) } catch (error) { throw new DatasetError(`${file}: invalid JSON (${error.message})`) }
    if (!Array.isArray(list)) throw new DatasetError(`${file}: expected an array of records`)
    list.forEach(raw => records.push(validateRecord(raw, file)))
  }
  const seen = new Map()
  for (const record of records) {
    for (const id of [record.key, `${record.game}:${record.name.toLowerCase()}`]) {
      if (seen.has(id)) throw new DatasetError(`duplicate record ${id} (${seen.get(id)} and ${record.key})`)
      seen.set(id, record.key)
    }
  }
  return records
}

/* ── derived, GameScout-authored fields ─────────────────────────────────── */

export const serverId = record => 'imp-' + record.key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function slugify(input) {
  const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' }
  return input.toLowerCase().replace(/[а-яё]/g, c => map[c] ?? '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

function hue(key) {
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 360
}

const flag = country => (country ? String.fromCodePoint(...[...country].map(c => 0x1f1a5 + c.charCodeAt(0))) : '')
const PLATFORM = { fivem: 'FiveM', ragemp: 'RAGE:MP', altv: 'alt:V' }
// "9 октября 2026" — without the trailing "г.", which would double the sentence's full stop.
const dateRu = iso => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(/\s*г\.$/, '')

/**
 * Card text is written by GameScout from the facts, never taken from the
 * project's own advertising.
 */
export function cardText(record) {
  const provenance = `Карточка собрана GameScout по открытым данным. Владелец может подтвердить сервер и дополнить описание.`
  if (record.game === 'lineage2') {
    const facts = [`Хроника: ${record.version}.`, record.rates && `Рейты: ${record.rates}.`, record.openedAt && `Открытие: ${dateRu(record.openedAt)}.`].filter(Boolean)
    return {
      summary: `Lineage 2 ${record.version}${record.rates ? ' · ' + record.rates : ''}`,
      description: `Сервер Lineage 2. ${facts.join(' ')} ${provenance} Точный онлайн Lineage 2 GameScout публикует только через GameScout Agent.`,
    }
  }
  if (record.game === 'minecraft') {
    const facts = [record.modes.length && `Режимы: ${record.modes.join(', ')}.`, record.version && `Версии: ${record.version}.`, record.endpoint && `Адрес: ${record.endpoint.host}${record.endpoint.port ? ':' + record.endpoint.port : ''}.`].filter(Boolean)
    return {
      summary: `Minecraft Java${record.modes.length ? ' · ' + record.modes.slice(0, 3).join(', ') : ''}`,
      description: `Сервер Minecraft Java Edition. ${facts.join(' ')} ${provenance} При успешной прямой проверке онлайн берётся из Server List Ping: число игроков сообщает сам сервер, поэтому статус LIVE, а не VERIFIED. Доступный сторонний мониторинг показывается только с указанием источника.`,
    }
  }
  if (['rust', 'cs2', 'dayz'].includes(record.game)) {
    const title = { rust: 'Rust', cs2: 'Counter-Strike 2', dayz: 'DayZ' }[record.game]
    const address = record.onlineSources.find(item => item.provider === 'steam')?.config.address
    const facts = [record.version && `Режим: ${record.version}.`, record.modes.length && `Особенности: ${record.modes.join(', ')}.`, address && `Адрес: ${address}.`].filter(Boolean)
    return {
      summary: `${title}${record.version ? ' · ' + record.version : ''}`,
      description: `Сервер ${title}. ${facts.join(' ')} ${provenance} Онлайн — по данным стороннего мониторинга: GameScout не может опросить этот сервер напрямую, поэтому статус не VERIFIED.`,
    }
  }
  const platform = PLATFORM[record.chronicle] ?? record.version
  const monitoring = record.endpoint
    ? 'Для прямой проверки указан endpoint сервера (players.json). Текущий онлайн появится только после успешного измерения.'
    : 'Прямой endpoint сервера не опубликован; текущий онлайн не указан.'
  return {
    summary: `GTA V RP · ${platform}`,
    description: `Ролевой сервер GTA V на платформе ${platform}. ${provenance} ${monitoring}`,
  }
}

/* ── SQL ────────────────────────────────────────────────────────────────── */

const SERVER_FACTS = ['name', 'game_id', 'chronicle_id', 'version', 'summary', 'description', 'rates', 'modes', 'languages', 'website', 'region', 'country', 'flag', 'opened_at', 'launch_at', 'launch_type', 'import_key', 'source_name', 'source_url', 'source_refs', 'last_source_check_at']

/**
 * Builds the import as one SQL script.
 *
 * `existing` is the current servers table (id, slug) so slugs stay stable
 * across runs and never collide with a card that is already there.
 */
export function importSql(records, { existing = [], chronicles = [], at = new Date().toISOString(), hideDemo = false, showDemo = false, archive = [] } = {}) {
  const bySlug = new Map(existing.map(row => [row.slug, row.id]))
  const byId = new Map(existing.map(row => [row.id, row.slug]))
  const knownChronicles = new Set(chronicles.map(row => `${row.game_id}:${row.id}`))
  const sql = ['-- GameScout real-server import. Idempotent: re-running updates rows, never duplicates them.']
  const plan = []

  for (const record of records) {
    const id = serverId(record)
    let slug = byId.get(id)
    if (!slug) {
      const base = slugify(record.name) || record.key.split(':')[1]
      slug = base
      for (const suffix of [record.game, 'server', '2', '3']) {
        if (!bySlug.has(slug) || bySlug.get(slug) === id) break
        slug = `${base}-${suffix}`
      }
      if (bySlug.has(slug) && bySlug.get(slug) !== id) throw new DatasetError(`${record.key}: cannot find a free slug for ${record.name}`)
    }
    bySlug.set(slug, id)
    byId.set(id, slug)

    const chronicleId = record.chronicle && knownChronicles.has(`${record.game}:${record.chronicle}`) ? record.chronicle : null
    const { summary, description } = cardText(record)
    const future = record.openedAt && Date.parse(record.openedAt) > Date.parse(at)
    const row = {
      name: record.name,
      game_id: record.game,
      chronicle_id: chronicleId,
      version: record.version,
      summary,
      description,
      rates: record.rates,
      modes: JSON.stringify(record.modes),
      languages: JSON.stringify(record.languages),
      website: record.website,
      region: record.region ?? '',
      country: record.country ?? '',
      flag: flag(record.country),
      opened_at: record.openedAt,
      launch_at: future ? record.openedAt : null,
      launch_type: future ? 'Открытие' : null,
      import_key: record.key,
      source_name: record.source.name,
      source_url: record.source.url,
      source_refs: JSON.stringify(record.refs),
      last_source_check_at: record.checkedAt,
    }
    const insert = { id, slug, ...row, hue: hue(record.key), moderation: 'PUBLISHED', added_at: at, updated_at: at, imported_at: at, is_demo: 0, tags: '[]', highlights: '[]' }
    const cols = Object.keys(insert)
    // The new Claim authority is private. D1 receives only a public claimed bit;
    // legacy owner_id alone cannot protect a reviewed owner edit from re-import.
    const unclaimed = `(SELECT owner_id FROM servers WHERE id=${q(id)}) IS NULL AND COALESCE((SELECT claimed FROM public_server_projection WHERE server_id=${q(id)}),0)=0`
    sql.push(
      `INSERT INTO servers (${cols.join(',')}) VALUES (${cols.map(c => q(insert[c])).join(',')})\n` +
        `  ON CONFLICT(id) DO UPDATE SET ${SERVER_FACTS.map(c => `${c}=excluded.${c}`).join(',')},updated_at=excluded.updated_at\n` +
        // An owner-claimed card belongs to its owner; an unchanged record writes nothing.
        `  WHERE ${unclaimed} AND (${SERVER_FACTS.map(c => `servers.${c} IS NOT excluded.${c}`).join(' OR ')});`,
    )

    const firstSource = record.onlineSources[0]
    const method = record.endpoint?.method ?? (firstSource ? (firstSource.tier === 'OFFICIAL' ? 'OFFICIAL_SOURCE' : 'EXTERNAL_MONITOR') : 'NONE')
    const measurable = record.endpoint || firstSource
    const note = measurable
      ? null
      : record.game === 'lineage2'
        ? 'Lineage 2: источник онлайна не подключён; точный онлайн — только через GameScout Agent'
        : 'Публичный источник онлайна не найден'
    sql.push(
      `INSERT OR IGNORE INTO server_online (server_id,status,current,max,source,method,note) VALUES (${[id, 'PENDING', 0, 0, measurable ? 'Ожидает проверки' : 'Нет источника', method, note].map(q).join(',')});`,
    )

    const ownerless = unclaimed
    if (record.endpoint) {
      const e = record.endpoint
      sql.push(
        `INSERT INTO monitoring_targets (server_id,method,host,port,api_url,expect_name,enabled) SELECT ${[id, e.method, e.host, e.port, e.url, e.expectName, 1].map(q).join(',')} WHERE ${ownerless}\n` +
          `  ON CONFLICT(server_id) DO UPDATE SET method=excluded.method,host=excluded.host,port=excluded.port,api_url=excluded.api_url,expect_name=excluded.expect_name,enabled=1\n` +
          `  WHERE ${ownerless} AND (monitoring_targets.method IS NOT excluded.method OR monitoring_targets.host IS NOT excluded.host OR monitoring_targets.port IS NOT excluded.port OR monitoring_targets.api_url IS NOT excluded.api_url OR monitoring_targets.expect_name IS NOT excluded.expect_name OR monitoring_targets.enabled<>1);`,
      )
    } else {
      // An endpoint removed from the dataset stops being probed.
      sql.push(`UPDATE monitoring_targets SET enabled=0 WHERE server_id=${q(id)} AND enabled=1 AND ${ownerless};`)
    }
    const providers = record.onlineSources.map(item => item.provider)
    for (const item of record.onlineSources) {
      sql.push(
        `INSERT INTO online_sources (id,server_id,tier,provider,name,url,config,enabled) SELECT ${[`${id}:${item.provider}`, id, item.tier, item.provider, item.name, item.url, JSON.stringify(item.config), 1].map(q).join(',')} WHERE ${ownerless}\n` +
          `  ON CONFLICT(id) DO UPDATE SET tier=excluded.tier,name=excluded.name,url=excluded.url,config=excluded.config,enabled=1\n` +
          `  WHERE ${ownerless} AND (online_sources.tier IS NOT excluded.tier OR online_sources.name IS NOT excluded.name OR online_sources.url IS NOT excluded.url OR online_sources.config IS NOT excluded.config OR online_sources.enabled<>1);`,
      )
    }
    // A source dropped from the dataset stops being read.
    sql.push(`UPDATE online_sources SET enabled=0 WHERE server_id=${q(id)} AND enabled=1 AND ${ownerless}${providers.length ? ` AND provider NOT IN (${providers.map(q).join(',')})` : ''};`)
    plan.push({ key: record.key, id, slug, sources: providers, name: record.name, game: record.game, chronicleId, endpoint: record.endpoint ? record.endpoint.method : null, action: existing.some(row => row.id === id) ? 'update' : 'insert' })
  }

  for (const id of archive) sql.push(`UPDATE servers SET moderation='ARCHIVED',updated_at=${q(at)} WHERE id=${q(id)} AND import_key IS NOT NULL AND owner_id IS NULL AND COALESCE((SELECT claimed FROM public_server_projection WHERE server_id=${q(id)}),0)=0 AND moderation='PUBLISHED';`)
  // DEMO rows are hidden, never deleted: the development seed stays intact.
  if (hideDemo) sql.push(`UPDATE servers SET moderation='ARCHIVED',updated_at=${q(at)} WHERE is_demo=1 AND moderation='PUBLISHED';`)
  if (showDemo) sql.push(`UPDATE servers SET moderation='PUBLISHED',updated_at=${q(at)} WHERE is_demo=1 AND moderation='ARCHIVED';`)
  return { sql: sql.join('\n') + '\n', plan }
}

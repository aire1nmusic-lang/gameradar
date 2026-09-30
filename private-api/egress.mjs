/** Outbound policy v1. Never turn an arbitrary private object into an AI prompt.
 * Mail/OAuth/payment transports have separate purposes; their credentials are
 * NOT business payload and are injected only by their dedicated connectors.
 */
const notices = Object.freeze({
  'copyright.submitted':'Получена претензия',
  'copyright.restricted':'Материал временно ограничен; нужна ручная проверка',
  'copyright.suspected_fake':'Претензия требует проверки на фейк',
  'copyright.needs_info':'По претензии нужны уточнения',
  'copyright.ai_error':'Ошибка обработки претензии',
  'copyright.restore':'Ограничение восстановлено администратором',
  'copyright.reject':'Претензия отклонена администратором',
  'copyright.restrict':'Материал ограничен администратором',
  'copyright.request_info':'Администратор запросил уточнения по претензии',
  'projection.lag':'Задержка публичной проекции',
  'projection.recovered':'Публичная проекция восстановлена',
  'openrouter.balance_unavailable':'Не удалось проверить баланс AI',
  'openrouter.balance_check_recovered':'Проверка баланса AI восстановлена',
  'openrouter.low_balance':'Низкий баланс AI',
  'openrouter.balance_recovered':'Баланс AI выше порога',
  'operations.jobs_stalled':'Задания остановлены; нужна ручная проверка',
  'operations.jobs_recovered':'Остановленных заданий больше нет',
  'backup.upload_stale':'Резервная копия давно не загружалась',
  'backup.upload_recovered':'Загрузка резервной копии восстановлена',
})

function exact(value,keys) {
  if(!value||typeof value!=='object'||Array.isArray(value)
    ||Object.keys(value).some(key=>!keys.includes(key)))throw new Error('egress_payload_rejected')
}

/** Only opaque internally generated event ID; no stored message/free text. */
export function telegramNotice(value) {
  exact(value,['event','eventRef'])
  if(!Object.hasOwn(notices,value.event)||typeof value.eventRef!=='string'
    ||!/^[A-Za-z0-9_-]{16,64}$/.test(value.eventRef))throw new Error('egress_payload_rejected')
  return `GameScout: ${notices[value.event]}\nEvent: ${value.eventRef}`
}

/** No nickname/evidence AI channel until an explicitly reviewed safe DTO exists. */
export function externalAIPayload(channel) {
  if(['nickname','copyright'].includes(channel))throw new Error('egress_raw_ai_disabled')
  throw new Error('egress_channel_unapproved')
}

/** Locally derived presence flags: no text, names, URLs, evidence or identities. */
export function copyrightPresence(claim) {
  const present=value=>typeof value==='string'&&value.trim().length>0
  return Object.freeze({
    scopeKnown:['site','discord','telegram','description'].includes(claim?.material_key),
    rightsPresent:present(claim?.rights_basis),workPresent:present(claim?.work_description),
    evidencePresent:present(claim?.evidence),targetPresent:present(claim?.material_url),
  })
}

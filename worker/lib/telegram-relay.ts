/** Technical incidents only. No free-text payload, destinations, URLs or credentials from callers. */
const events = new Set([
  'coins.integrity_failed','coins.integrity_recovered','copyright.submitted','copyright.review_required',
  'copyright.restricted','copyright.suspected_fake','copyright.needs_info','copyright.ai_error',
  'copyright.restore','copyright.reject','copyright.restrict','copyright.request_info',
  'projection.lag','projection.recovered','openrouter.balance_unavailable',
  'openrouter.balance_check_recovered','openrouter.low_balance','openrouter.balance_recovered',
  'operations.jobs_stalled','operations.jobs_recovered','backup.upload_stale','backup.upload_recovered',
])
export function relayNotice(value: unknown): {event:string;eventRef:string} {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('relay_payload_rejected')
  const row=value as Record<string,unknown>
  if(Object.keys(row).length!==2||Object.keys(row).some(key=>!['event','eventRef'].includes(key))
    ||typeof row.event!=='string'||!events.has(row.event)||typeof row.eventRef!=='string'
    ||!/^[A-Za-z0-9_-]{16,64}$/.test(row.eventRef))throw new Error('relay_payload_rejected')
  return {event:row.event,eventRef:row.eventRef}
}
export async function deliverRelayNotice(config:{botToken?:string;chatId?:string},value:unknown,request:typeof fetch=fetch):Promise<{ok:true}> {
  const dto=relayNotice(value)
  if(!config.botToken||!config.chatId)throw new Error('relay_unconfigured')
  let response:Response
  try {response=await request(`https://api.telegram.org/bot${config.botToken}/sendMessage`,{
    method:'POST',headers:{'Content-Type':'application/json'},redirect:'manual',signal:AbortSignal.timeout(10000),
    body:JSON.stringify({chat_id:config.chatId,text:`GameScout: ${dto.event}\nEvent: ${dto.eventRef}`,protect_content:true,disable_notification:false}),
  })} catch {throw new Error('relay_transport_failed')} // Do not log fetch errors containing the credential URL.
  if(!response.ok)throw new Error(`relay_telegram_http_${response.status}`)
  let ok=false
  try {ok=(await response.json() as {ok?:boolean}).ok===true}catch {}
  if(!ok)throw new Error('relay_delivery_failed')
  return {ok:true} // Never echo the Telegram response/chat identity back to the caller.
}

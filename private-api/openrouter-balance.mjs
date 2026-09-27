import { transitionSystemAlert } from './system-alert.mjs'

export async function readOpenRouterBalance(key,request=fetch) {
  if(!key)throw new Error('management_key_required')
  const response=await request('https://openrouter.ai/api/v1/credits',{
    headers:{Authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(10000),
  })
  if(!response.ok)throw new Error('balance_unavailable')
  const data=(await response.json()).data
  if(!data||!Number.isFinite(data.total_credits)||!Number.isFinite(data.total_usage)
    ||data.total_credits<0||data.total_usage<0)throw new Error('invalid_balance_response')
  return Math.max(0,data.total_credits-data.total_usage)
}

/** A failed check is its own alert; it never pretends the balance is healthy. */
export async function checkOpenRouterBalance(db,{key,thresholdUsd=5},request=fetch) {
  if(!key)return {status:'disabled'}
  if(!Number.isFinite(thresholdUsd)||thresholdUsd<0.01||thresholdUsd>1000)throw new Error('invalid_balance_threshold')
  let remaining
  try {remaining=await readOpenRouterBalance(key,request)}
  catch {
    await transitionSystemAlert(db,{key:'openrouter_balance_unavailable',active:true,snapshot:{},
      openedEvent:'openrouter.balance_unavailable',closedEvent:'openrouter.balance_check_recovered',
      openedMessage:'GameScout: не удалось проверить баланс OpenRouter',
      closedMessage:'GameScout: проверка баланса OpenRouter восстановлена'})
    return {status:'unavailable'}
  }
  await transitionSystemAlert(db,{key:'openrouter_balance_unavailable',active:false,snapshot:{},
    openedEvent:'openrouter.balance_unavailable',closedEvent:'openrouter.balance_check_recovered',
    openedMessage:'GameScout: не удалось проверить баланс OpenRouter',
    closedMessage:'GameScout: проверка баланса OpenRouter восстановлена'})
  const low=remaining<=thresholdUsd
  const changed=await transitionSystemAlert(db,{key:'openrouter_low_balance',active:low,
    snapshot:{remainingUsd:Math.round(remaining*100)/100,thresholdUsd},
    openedEvent:'openrouter.low_balance',closedEvent:'openrouter.balance_recovered',
    openedMessage:`GameScout: баланс OpenRouter ниже порога ${thresholdUsd} USD`,
    closedMessage:'GameScout: баланс OpenRouter выше порога'})
  return {status:low?'low':'ok',remainingUsd:remaining,changed}
}

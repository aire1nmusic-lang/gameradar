// Synthetic fixtures only. Called on a disposable database, never a provider or live account.
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import {createApp} from './app.mjs'
import {digest,token} from './crypto.mjs'

export async function rehearseVoteRisk(db){
  const origin='http://127.0.0.1:5173',results=[]
  const rules=(await db.query('SELECT * FROM gs_vote_rules WHERE id=1')).rows[0]
  try{for(const [index,kind] of ['ip','device','asn'].entries()){
    await db.query('UPDATE gs_vote_rules SET ip_daily_limit=$1,device_daily_limit=$2,asn_daily_limit=$3 WHERE id=1',
      [kind==='ip'?1:100,kind==='device'?1:100,kind==='asn'?1:100000])
    const users=[]
    for(let n=0;n<2;n++){
      const id=token(),session=token(),server=`vote-risk-${kind}-${n}-${randomBytes(4).toString('hex')}`
      await db.query('INSERT INTO gs_users(id,display_name,email_verified_at) VALUES($1,$2,now())',[id,'Disposable risk fixture'])
      await db.query("INSERT INTO gs_sessions(token_hash,user_id,expires_at,login_method) VALUES($1,$2,now()+interval '1 hour','email')",[digest(session),id])
      await db.query("INSERT INTO gs_server_registry(server_id,game_id,name,slug) VALUES($1,'minecraft',$1,$1)",[server])
      users.push({cookie:'gs_private_session='+session,server,key:token(),device:kind==='device'?`shared_risk_device_${index}`:token(),
        ip:kind==='ip'?`198.51.100.${index+10}`:`198.51.100.${index*10+n+30}`})
    }
    // Deterministic old-code reproduction: both preflight reads observe the same
    // counts before either transaction. Correct code rechecks under shared locks.
    let reads=0,release;const bothRead=new Promise(r=>release=r)
    const wrapped={...db,query:async(sql,args)=>{const result=await db.query(sql,args)
      if(sql.includes('AS ip_count')&&++reads<=2){if(reads===2)release();await bothRead}return result}}
    const app=createApp({db:wrapped,config:{origin,environment:'development',mailKey:randomBytes(32).toString('hex'),
      rateKey:'r'.repeat(64),turnstileSecret:'synthetic',turnstileSiteKey:'synthetic'},
      captchaVerify:async value=>({success:value==='valid',hostname:'127.0.0.1',action:'vote'})})
    const cast=async(user,captcha)=>{const response=await app.request(origin+'/api/v1/people-rating/votes',{
      method:'POST',headers:{Origin:origin,Cookie:user.cookie,'Content-Type':'application/json','Idempotency-Key':user.key},
      body:JSON.stringify({serverId:user.server,deviceSignal:user.device,pageAgeMs:5000,...(captcha?{captcha}:{})})},
      {clientIp:user.ip,...(kind==='asn'?{clientAsn:'64520'}:{})})
      return {status:response.status,body:await response.json()}}
    const race=await Promise.all(users.map(user=>cast(user)))
    assert.deepEqual(race.map(r=>r.status).sort(),[201,403],`${kind} risk must be rechecked after concurrent writes`)
    const loser=race.findIndex(r=>r.status===403);assert.equal(race[loser].body.error.code,'captcha_required')
    assert.equal((await cast(users[loser],'valid')).status,201)
    assert.equal((await cast(users[loser])).body.replay,true,'accepted replay must not consume another challenge')
    results.push({kind,concurrentUncheckedAccepted:1,challenged:1,verifiedChallengeAccepted:1,replay:true})
  }return results}finally{
    await db.query('UPDATE gs_vote_rules SET ip_daily_limit=$1,device_daily_limit=$2,asn_daily_limit=$3 WHERE id=1',
      [rules.ip_daily_limit,rules.device_daily_limit,rules.asn_daily_limit])
  }
}

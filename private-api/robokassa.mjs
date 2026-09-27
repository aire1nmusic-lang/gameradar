import { createHash, timingSafeEqual } from 'node:crypto'

const md5 = value => createHash('md5').update(value,'utf8').digest('hex')
const constantEqual = (a,b) => /^[a-f0-9]{32}$/i.test(a??'') && timingSafeEqual(Buffer.from(a.toLowerCase(),'hex'),Buffer.from(b,'hex'))

export function testPaymentConfig(config) {
  const r=config.robokassa
  if (!r || !['merchantLogin','testPassword1','testPassword2','receiptSno','receiptTax','receiptPaymentObject','receiptPaymentMethod','itemName']
    .every(key=>typeof r[key]==='string' && r[key].length>0)) return null
  if(!/^[a-z0-9_.-]{1,64}$/i.test(r.merchantLogin)||r.itemName.length>128||/[\u0000-\u001f]/.test(r.itemName)) return null
  if(!['osn','usn_income','usn_income_outcome','esn','patent'].includes(r.receiptSno)) return null
  if(!['none','vat0','vat10','vat110','vat20','vat22','vat120','vat122','vat5','vat7','vat105','vat107'].includes(r.receiptTax)) return null
  if(!['commodity','job','service','intellectual_activity','payment','another','property_right'].includes(r.receiptPaymentObject)) return null
  if(!['full_prepayment','prepayment','advance','full_payment','partial_payment','credit','credit_payment'].includes(r.receiptPaymentMethod)) return null
  return r
}

export function paymentReceipt(r,kopecks) {
  return {sno:r.receiptSno,items:[{name:r.itemName,quantity:1,sum:kopecks/100,
    tax:r.receiptTax,payment_method:r.receiptPaymentMethod,payment_object:r.receiptPaymentObject}]}
}

export function testCheckoutForm(r,order,email) {
  const amount=(order.amount_kopecks/100).toFixed(2)
  const receipt=encodeURIComponent(JSON.stringify(order.receipt))
  const signature=md5(`${r.merchantLogin}:${amount}:${order.id}:${receipt}:${r.testPassword1}:Shp_order=${order.nonce}`)
  return {action:'https://auth.robokassa.ru/Merchant/Index.aspx',method:'POST',fields:{MerchantLogin:r.merchantLogin,OutSum:amount,InvId:String(order.id),
    Description:`GS Coins: ${order.coins}`,Receipt:receipt,Shp_order:order.nonce,
    SignatureValue:signature,IsTest:'1',Email:email}}
}

export function parseTestResult(r,raw) {
  const params=new URLSearchParams(raw)
  for(const key of ['OutSum','InvId','SignatureValue','Shp_order']) if(params.getAll(key).length!==1) throw new Error('invalid_payment_fields')
  if([...params.keys()].some(key=>key.startsWith('Shp_') && key!=='Shp_order')) throw new Error('invalid_payment_fields')
  const amount=params.get('OutSum'),id=params.get('InvId'),nonce=params.get('Shp_order'),signature=params.get('SignatureValue')
  if(!/^\d{1,10}\.(?:\d{2}|\d{6})$/.test(amount)||!/^\d{1,15}$/.test(id)||!/^[a-f0-9]{64}$/.test(nonce))
    throw new Error('invalid_payment_fields')
  const expected=md5(`${amount}:${id}:${r.testPassword2}:Shp_order=${nonce}`)
  if(!constantEqual(signature,expected)) throw new Error('invalid_payment_signature')
  const [rub,fraction]=amount.split('.')
  if(fraction.length===6 && fraction.slice(2)!=='0000') throw new Error('invalid_payment_amount')
  const kopecks=Number(rub)*100+Number(fraction.slice(0,2))
  if(!Number.isSafeInteger(kopecks)) throw new Error('invalid_payment_amount')
  return {id,nonce,kopecks}
}

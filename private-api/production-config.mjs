import { readFile } from 'node:fs/promises'
import { mailEnabled } from '../worker/lib/mailer.ts'
import { sendSmtp } from './smtp.mjs'

/** Shared by the HTTP server and a private one-shot maintenance process. */
export async function productionConfig(env=process.env) {
  const runtime=env.PRIVATE_RUNTIME??'yandex-container'
  if(!['yandex-container','vm'].includes(runtime))throw new Error('PRIVATE_RUNTIME_invalid')
  if(!env.DATABASE_URL || (!env.PG_CA_FILE && !env.PG_CA_PEM))
    throw new Error('DATABASE_URL_and_PostgreSQL_CA_required')
  if(runtime==='vm' && (!env.PRIVATE_PROXY_SECRET||env.PRIVATE_PROXY_SECRET.length<32))
    throw new Error('PRIVATE_PROXY_SECRET_required_for_vm')
  const ca=env.PG_CA_PEM??await readFile(env.PG_CA_FILE,'utf8')
  const mailEnv={ENVIRONMENT:'production',MAIL_DRIVER:env.MAIL_DRIVER,MAIL_FROM:env.MAIL_FROM,
    RESEND_API_KEY:env.RESEND_API_KEY,UNISENDER_API_KEY:env.UNISENDER_API_KEY,
    SMTP_HOST:env.SMTP_HOST,SMTP_PORT:env.SMTP_PORT,SMTP_USER:env.SMTP_USER,SMTP_PASSWORD:env.SMTP_PASSWORD,SMTP_TLS:env.SMTP_TLS,SMTP_SEND:sendSmtp}
  const config={origin:env.PUBLIC_ORIGIN,environment:'production',mailKey:env.MAIL_ENCRYPTION_KEY,
    supabaseUrl:env.SUPABASE_AUTH_URL,supabasePublishableKey:env.SUPABASE_AUTH_PUBLISHABLE_KEY,
    rateKey:env.RATE_HASH_KEY,mailEnabled:mailEnabled(mailEnv),mailEnv,publicApi:env.PUBLIC_CATALOG_ORIGIN,
    publicProjection:env.PUBLIC_PROJECTION_URL,projectionSecret:env.PUBLIC_PROJECTION_SECRET,
    turnstileSecret:env.TURNSTILE_SECRET,turnstileSiteKey:env.TURNSTILE_SITE_KEY,
    oauth:Object.fromEntries(Object.entries(env).filter(([key])=>/^(GOOGLE|VK|YANDEX|DISCORD)_CLIENT_(ID|SECRET)$/.test(key))),
    maintenanceTriggerId:env.YANDEX_MAINTENANCE_TRIGGER_ID,folderId:env.YANDEX_FOLDER_ID,
    maintenanceTokenHash:env.YANDEX_MAINTENANCE_TOKEN_SHA256,
    // Sign-ups stay closed in production until the owner sets REGISTRATION_OPEN=true.
    registrationOpen:env.REGISTRATION_OPEN==='true',emergencyMode:env.EMERGENCY_MODE==='true'}
  config.enableTestPayments=env.ENABLE_TEST_PAYMENTS==='1'
  config.robokassa={merchantLogin:env.ROBOKASSA_TEST_LOGIN,testPassword1:env.ROBOKASSA_TEST_PASSWORD_1,
    testPassword2:env.ROBOKASSA_TEST_PASSWORD_2,receiptSno:env.ROBOKASSA_RECEIPT_SNO,
    receiptTax:env.ROBOKASSA_RECEIPT_TAX,receiptPaymentObject:env.ROBOKASSA_RECEIPT_PAYMENT_OBJECT,
    receiptPaymentMethod:env.ROBOKASSA_RECEIPT_PAYMENT_METHOD,itemName:env.ROBOKASSA_RECEIPT_ITEM_NAME}
  config.openrouter={key:env.OPENROUTER_API_KEY,model:env.OPENROUTER_NICKNAME_MODEL}
  config.copyrightAI={key:env.OPENROUTER_API_KEY,model:env.OPENROUTER_COPYRIGHT_MODEL}
  config.telegram={botToken:env.TELEGRAM_BOT_TOKEN,chatId:env.TELEGRAM_ADMIN_CHAT_ID,
    relayUrl:env.TELEGRAM_RELAY_URL,relaySecret:env.PUBLIC_PROJECTION_SECRET}
  config.openrouterBalance={key:env.OPENROUTER_MANAGEMENT_KEY,
    thresholdUsd:Number(env.OPENROUTER_LOW_BALANCE_USD??5)}
  if(!Number.isFinite(config.openrouterBalance.thresholdUsd)||config.openrouterBalance.thresholdUsd<0.01
    ||config.openrouterBalance.thresholdUsd>1000)throw new Error('OPENROUTER_LOW_BALANCE_USD_must_be_0.01_to_1000')
  const projectionAlertSeconds=Number(env.PUBLIC_PROJECTION_ALERT_SECONDS??300)
  if(!Number.isInteger(projectionAlertSeconds)||projectionAlertSeconds<60||projectionAlertSeconds>3600)
    throw new Error('PUBLIC_PROJECTION_ALERT_SECONDS_must_be_60_to_3600')
  return {runtime,proxySecret:env.PRIVATE_PROXY_SECRET,connectionString:env.DATABASE_URL,ca,config,projectionAlertSeconds}
}

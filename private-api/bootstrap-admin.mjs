import { readFile } from 'node:fs/promises'
import { postgresStore } from './db.mjs'

const { DATABASE_URL, PG_CA_FILE, ADMIN_USER_ID, ADMIN_BOOTSTRAP_REASON }=process.env
if(!DATABASE_URL||!PG_CA_FILE||!ADMIN_USER_ID||!ADMIN_BOOTSTRAP_REASON||ADMIN_BOOTSTRAP_REASON.trim().length<10)
  throw new Error('DATABASE_URL, PG_CA_FILE, ADMIN_USER_ID and a 10+ character ADMIN_BOOTSTRAP_REASON are required')
const db=postgresStore(DATABASE_URL,await readFile(PG_CA_FILE,'utf8'))
try {
  await db.transaction(async tx=>{
    await tx.query('SELECT pg_advisory_xact_lock(19770928)')
    const user=(await tx.query('SELECT id,email_verified_at,banned_at FROM gs_users WHERE id=$1 FOR UPDATE',[ADMIN_USER_ID])).rows[0]
    if(!user||!user.email_verified_at||user.banned_at) throw new Error('verified_unbanned_user_required')
    if((await tx.query("SELECT 1 FROM gs_user_roles WHERE role='ADMIN' LIMIT 1")).rows.length)
      throw new Error('admin_already_exists_use_reviewed_role_grant')
    await tx.query("INSERT INTO gs_user_roles(user_id,role) VALUES($1,'ADMIN')",[user.id])
    await tx.query("INSERT INTO gs_audit(action,target,details) VALUES('admin.bootstrapped',$1,$2)",
      [user.id,JSON.stringify({reason:ADMIN_BOOTSTRAP_REASON.trim()})])
  })
  console.log('First ADMIN role granted and audited for user ID:',ADMIN_USER_ID)
} finally { await db.close() }

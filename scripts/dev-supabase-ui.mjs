import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
// Opt-in local preview only. Production builds retain the previous backend unless explicitly configured.
const config=JSON.parse(await readFile(new URL('../output/auth-supabase-20261012/browser-config.json',import.meta.url),'utf8'))
process.env.VITE_AUTH_BACKEND='supabase'
process.env.VITE_SUPABASE_URL=config.url
process.env.VITE_SUPABASE_PUBLISHABLE_KEY=config.key
const server=await createServer({optimizeDeps:{entries:['index.html']}})
await server.listen();server.printUrls()

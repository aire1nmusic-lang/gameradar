import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {fileURLToPath,URL} from 'node:url'
const apiTarget=process.env.GS_API_TARGET??(process.env.GS_PRIVATE_CORE==='true'?'http://127.0.0.1:8789':'http://127.0.0.1:8787')
export default defineConfig({
 plugins:[react(),tailwindcss()],
 resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},
 server:{port:5173,strictPort:true,host:'127.0.0.1',proxy:{'/api':{target:apiTarget,changeOrigin:true}}},
 preview:{port:4173,host:'127.0.0.1',proxy:{'/api':{target:'http://127.0.0.1:8787',changeOrigin:true}}},
})

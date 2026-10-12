import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname,basename,resolve} from 'node:path'
import {retainEdgeAssets} from '../scripts/retain-edge-assets.mjs'
async function removeTestDirectory(dir){
  assert.equal(dirname(resolve(dir)),resolve(tmpdir()))
  assert.ok(basename(dir).startsWith('gs-edge-retain-'))
  await rm(dir,{recursive:true,force:true})
}

test('published dependency graph survives new manifests without overwriting current hashed bytes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'gs-edge-retain-'))
  const files=new Map([
    ['/', ['text/html','<script src="/assets/index-old12345.js"></script><link href="/assets/style-old12345.css">']],
    ['/assets/index-old12345.js',['text/javascript','import "./shared-old12345.js"; const deps=["assets/lazy-old12345.js"];']],
    ['/assets/shared-old12345.js',['text/javascript','export const v=1']],
    ['/assets/lazy-old12345.js',['text/javascript','export default 2']],
    ['/assets/style-old12345.css',['text/css','@font-face{src:url(./font-old12345.woff2)}']],
    ['/assets/font-old12345.woff2',['font/woff2','font-data']],
  ])
  const fetchImpl=async url=>{assert.equal(url.origin,'https://gamescout.online');const file=files.get(url.pathname);assert.ok(file,url.pathname);return new Response(file[1],{headers:{'Content-Type':file[0]}})}
  try{
    const result=await retainEdgeAssets({directory:dir,fetchImpl})
    assert.equal(result.checked,5)
    assert.equal(result.retained,5)
    assert.equal(await readFile(join(dir,'lazy-old12345.js'),'utf8'),'export default 2')
    assert.equal((await retainEdgeAssets({directory:dir,fetchImpl})).retained,0)
    await writeFile(join(dir,'shared-old12345.js'),'different-current-bytes')
    await assert.rejects(retainEdgeAssets({directory:dir,fetchImpl}),/collision/)
  }finally{await removeTestDirectory(dir)}
})

test('a SPA soft fallback cannot masquerade as a JavaScript dependency',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'gs-edge-retain-'))
  try{await assert.rejects(retainEdgeAssets({directory:dir,fetchImpl:async url=>new Response(url.pathname==='/'?'<script src="/assets/index-old12345.js"></script>':'home fallback',{headers:{'Content-Type':'text/html'}})}),/unavailable/)}finally{await removeTestDirectory(dir)}
})

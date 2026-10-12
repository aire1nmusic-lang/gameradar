import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'

/** Keep published hashed dependencies usable while clients revalidate an older HTML page. */
export async function retainEdgeAssets({origin='https://gamescout.online',directory='dist/assets',fetchImpl=fetch}={}) {
  const root=await fetchImpl(new URL('/',origin),{signal:AbortSignal.timeout(15000),headers:{'Cache-Control':'no-cache'}})
  if(!root.ok)throw new Error('Cannot read current frontend for asset continuity')
  const pending=[...await root.text().then(s=>s.matchAll(/\/assets\/([A-Za-z0-9_.-]+\.(?:js|css|woff2?))/g))].map(m=>m[1])
  if(!pending.some(x=>x.startsWith('index-')&&x.endsWith('.js')))throw new Error('Current frontend entry missing')
  const seen=new Set();let kept=0,bytes=0
  await mkdir(directory,{recursive:true})
  while(pending.length){
    const name=pending.shift()
    if(seen.has(name))continue
    if(!/^[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{6,}\.(js|css|woff2?)$/.test(name))throw new Error('Unhashed dependency refused')
    seen.add(name)
    if(seen.size>128)throw new Error('Asset continuity count exceeded')
    const response=await fetchImpl(new URL('/assets/'+name,origin),{signal:AbortSignal.timeout(15000)})
    const type=response.headers.get('Content-Type')||''
    if(!response.ok||type.includes('text/html'))throw new Error('Published dependency unavailable: '+name)
    const body=Buffer.from(await response.arrayBuffer());bytes+=body.length
    if(bytes>8*1024*1024)throw new Error('Asset continuity size exceeded')
    const file=join(directory,name)
    let existing;try{existing=await readFile(file)}catch(e){if(e.code!=='ENOENT')throw e}
    if(existing&&!existing.equals(body))throw new Error('Hashed asset collision: '+name)
    if(!existing){await writeFile(file,body,{flag:'wx'});kept++}
    if(/\.(js|css)$/.test(name)){
      const source=body.toString('utf8')
      for(const m of source.matchAll(/["'](?:\.\/|\/?assets\/)([A-Za-z0-9_.-]+\.(?:js|css|woff2?))["']/g))pending.push(m[1])
      for(const m of source.matchAll(/url\(\s*["']?(?:\.\/|\/assets\/)([A-Za-z0-9_.-]+\.woff2?)/g))pending.push(m[1])
    }
  }
  return {checked:seen.size,retained:kept,bytes}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await retainEdgeAssets()))

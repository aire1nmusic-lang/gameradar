import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {join,dirname,basename,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
const script=fileURLToPath(new URL('../scripts/check-bundle.mjs',import.meta.url))

test('retained chunks do not loosen fixture rejection or active migration-key uniqueness',async()=>{
  const root=await mkdtemp(join(tmpdir(),'gs-bundle-check-'))
  const assets=join(root,'dist/assets')
  const run=()=>spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8'})
  try{
    await mkdir(assets,{recursive:true})
    await writeFile(join(root,'dist/index.html'),'<script src="/assets/index-new12345.js"></script>')
    await writeFile(join(assets,'index-new12345.js'),'import "./shared-new12345.js";fetch("/api/v1/games")')
    await writeFile(join(assets,'shared-new12345.js'),'const key="gameradar:favorites"')
    await writeFile(join(assets,'index-old12345.js'),'const key="gameradar:favorites"')
    assert.equal(run().status,0,'One key in each generation is valid')
    await writeFile(join(assets,'index-old12345.js'),'const mockRepositories={}')
    assert.notEqual(run().status,0,'Inactive fixture code is still forbidden')
    await writeFile(join(assets,'index-old12345.js'),'const key="gameradar:favorites"')
    await writeFile(join(assets,'index-new12345.js'),'import "./shared-new12345.js";fetch("/api/v1/games");const key="gameradar:favorites"')
    assert.notEqual(run().status,0,'Two keys in the active graph remain forbidden')
  }finally{
    assert.equal(dirname(resolve(root)),resolve(tmpdir()))
    assert.ok(basename(root).startsWith('gs-bundle-check-'))
    await rm(root,{recursive:true,force:true})
  }
})

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { apiRequest, apiSend, ApiRequestError } from '@/repositories/http/client'

const KEY='gamescout:favorites',LEGACY_KEY='gameradar:favorites'
const valid=(value:unknown):string[]=>Array.isArray(value)?[...new Set(value.filter((s):s is string=>typeof s==='string'&&s.length>0&&s.length<=120))].slice(0,200):[]
function read(key:string) {try{return valid(JSON.parse(localStorage.getItem(key)??'[]'))}catch{return []}}
let account:string|null=null,epoch=0,revision=0,fetching=false,remoteAvailable=false,pending=0,queue=Promise.resolve(),snapshot={favorites:read(KEY).length?read(KEY):read(LEGACY_KEY),sync:'local' as 'local'|'loading'|'synced'|'error',error:''}
const listeners=new Set<()=>void>()
const key=()=>account?`gamescout:favorites:account:${account}`:KEY
function emit(){for(const listener of listeners)listener()}
function publish(favorites:string[],sync=snapshot.sync,error=''){snapshot={favorites,sync,error};try{localStorage.setItem(key(),JSON.stringify(favorites))}catch{}emit()}
function offlineChange(path:string,body:unknown){if(!account)return;try{const data=JSON.parse(localStorage.getItem(`${key()}:pending`)??'{"changes":{}}');if(path.endsWith('/clear')){data.clear=true;data.changes={}}else{const change=body as {slug:string;saved:boolean};data.changes[change.slug]=change.saved}localStorage.setItem(`${key()}:pending`,JSON.stringify(data))}catch{}}
function response(value:{favorites:string[]}){if(!Array.isArray(value?.favorites))throw new Error('sync_unavailable');return valid(value.favorites)}
async function refresh() {
 if(!account||fetching||pending)return
 fetching=true;const generation=epoch,start=revision
 try{const remote=response(await apiRequest<{favorites:string[]}>('/me/favorites'));if(generation!==epoch||start!==revision)return
 remoteAvailable=true;const imported=`${key()}:imported`,cached=read(key()),guest=read(KEY).length?read(KEY):read(LEGACY_KEY)
 const legacy=localStorage.getItem(imported)?[]:valid([...cached,...guest])
 let merged=legacy.length?response(await apiSend<{favorites:string[]}>('/me/favorites/import',{slugs:legacy})):remote
 const edits=JSON.parse(localStorage.getItem(`${key()}:pending`)??'{"changes":{}}');if(edits.clear)await apiSend('/me/favorites/clear',{});for(const [slug,saved] of Object.entries(edits.changes??{}))await apiSend('/me/favorites',{slug,saved});if(edits.clear||Object.keys(edits.changes??{}).length)merged=response(await apiRequest<{favorites:string[]}>('/me/favorites'));
 if(generation!==epoch||start!==revision)return
 localStorage.removeItem(`${key()}:pending`);localStorage.setItem(imported,'1');if(legacy.length){localStorage.removeItem(KEY);localStorage.removeItem(LEGACY_KEY)}
 publish(merged,'synced')
 }catch{if(generation===epoch)publish(snapshot.favorites,'error','Избранное сохранено на этом устройстве. Синхронизация пока недоступна.')}finally{if(generation===epoch)fetching=false}
}
/** One synchronizer per page, not one request per server card. */
export function FavoritesSync() {
 const {user,loading}=useAuth()
 useEffect(()=>{if(loading)return;account=user?.id??null;epoch++;revision++;fetching=false;remoteAvailable=false;pending=0;queue=Promise.resolve();publish(account?(read(key()).length?read(key()):!localStorage.getItem(`${key()}:imported`)?(read(KEY).length?read(KEY):read(LEGACY_KEY)):[]):(read(KEY).length?read(KEY):read(LEGACY_KEY)),account?'loading':'local');void refresh()
 const focus=()=>{if(document.visibilityState==='visible')void refresh()};window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);const timer=setInterval(focus,30000)
 return()=>{epoch++;clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus)}
 },[user?.id,loading]);return null
}
function mutate(next:string[],path:string,body:unknown) {
 const before=snapshot.favorites,generation=epoch,operation=++revision;publish(next,account&&remoteAvailable?'loading':account?'error':'local',account&&!remoteAvailable?'Избранное сохранено на этом устройстве. Синхронизация пока недоступна.':'');if(!account)return;if(!remoteAvailable){offlineChange(path,body);return}
 pending++;queue=queue.catch(()=>{}).then(async()=>{if(generation!==epoch)return;try{await apiSend(path,body);if(generation===epoch){publish(snapshot.favorites,'synced')}}catch(e){if(generation===epoch){if(e instanceof ApiRequestError&&(e.status===0||e.status>=500)){remoteAvailable=false;offlineChange(path,body);publish(snapshot.favorites,'error','Избранное сохранено на этом устройстве. Синхронизация пока недоступна.')}else publish(revision===operation?before:snapshot.favorites,'error','Не удалось синхронизировать избранное. Попробуйте снова.')}}finally{if(generation===epoch){pending--;if(!pending)void refresh()}}})
}
export function useFavorites() {
 const value=useSyncExternalStore(listener=>{listeners.add(listener);return()=>listeners.delete(listener)},()=>snapshot,()=>snapshot)
 const has=useCallback((slug:string)=>value.favorites.includes(slug),[value.favorites])
 const toggle=useCallback((slug:string)=>{const saved=!snapshot.favorites.includes(slug);mutate(saved?[...snapshot.favorites,slug]:snapshot.favorites.filter(s=>s!==slug),'/me/favorites',{slug,saved})},[])
 const clear=useCallback(()=>mutate([],'/me/favorites/clear',{}),[])
 return {...value,has,toggle,clear,retry:refresh}
}

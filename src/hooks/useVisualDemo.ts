import { useSyncExternalStore } from 'react'
import { useAuth } from './useAuth'
const KEY='gs.visual-demo'
const subscribe=(callback:()=>void)=>{window.addEventListener('gs-visual-demo',callback);window.addEventListener('storage',callback);return()=>{window.removeEventListener('gs-visual-demo',callback);window.removeEventListener('storage',callback)}}
const snapshot=()=>{try{return localStorage.getItem(KEY)==='1'}catch{return false}}
export function setVisualDemo(enabled:boolean){try{localStorage.setItem(KEY,enabled?'1':'0')}catch{/* session preference unavailable */}window.dispatchEvent(new Event('gs-visual-demo'))}
export function useVisualDemo(){const auth=useAuth();const requested=useSyncExternalStore(subscribe,snapshot,()=>false);return auth.user?.roles?.includes('ADMIN')===true&&requested}

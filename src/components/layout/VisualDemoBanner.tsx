import { Link } from 'react-router-dom'
import { useVisualDemo, setVisualDemo } from '@/hooks/useVisualDemo'
export function VisualDemoBanner(){const enabled=useVisualDemo();if(!enabled)return null;return <aside className="gs-demo-banner" role="status"><span><strong>Демо визуала</strong> · Голоса, поддержка и часть аватарок — примеры только в вашем браузере.</span><Link to="/lineage-2">Смотреть серверы</Link><button type="button" onClick={()=>setVisualDemo(false)}>Выключить</button></aside>}

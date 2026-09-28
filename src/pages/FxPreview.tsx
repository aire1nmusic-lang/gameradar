import { useSearchParams } from 'react-router-dom'
import { TeleportFX } from '@/components/home/TeleportFX'

/** Development only: one still frame of the teleport, e.g. /__fx?t=0.5 */
export default function FxPreview() {
  const [params] = useSearchParams()
  const t = Number(params.get('t') ?? 0.3)
  return (
    <div className="fixed inset-0 z-[80]" style={{ background: 'url(/media/hub/nave-1920.webp) center/cover' }}>
      <img src="/media/hub/card-minecraft-960.webp" alt="" className="absolute" style={{ left: 'calc(50% - 135px)', top: 'calc(50% - 200px)', width: 270, height: 400, objectFit: 'cover', borderRadius: 14 }} />
      <TeleportFX x={window.innerWidth / 2} y={window.innerHeight / 2} color="#5ee07a" duration={1350} at={t} />
    </div>
  )
}

import { WorldHall } from '@/components/home/WorldHall'
import { HighOnlineSection, OpeningsSection, RecentlyAddedSection } from '@/components/home/sections'
import { OwnerBand } from '@/components/home/bands'
import { useSeo } from '@/lib/seo'

export default function Home() {
  useSeo({ path: '/', description: 'Каталог игровых серверов Lineage 2, Minecraft и GTA RP: онлайн с указанием источника, рейтинг, открытия и голосование.' })
  return (
    <>
      <WorldHall />
      <HighOnlineSection />
      <OpeningsSection />
      <RecentlyAddedSection />
      <OwnerBand />
    </>
  )
}

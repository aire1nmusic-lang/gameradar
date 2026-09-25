import { Hero } from '@/components/home/Hero'
import { HighOnlineSection, OpeningsSection, RecentlyAddedSection } from '@/components/home/sections'
import { OwnerBand } from '@/components/home/bands'
import { useSeo } from '@/lib/seo'

export default function Home() {
  useSeo({ path: '/', description: 'Каталог игровых серверов Lineage 2, Minecraft, GTA RP, Rust, CS2 и DayZ: онлайн с указанием источника, рейтинг, открытия и голосование.' })
  return (
    <>
      <Hero />
      <HighOnlineSection />
      <OpeningsSection />
      <RecentlyAddedSection />
      <OwnerBand />
    </>
  )
}

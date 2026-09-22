import { Hero } from '@/components/home/Hero'
import {
  GamesSection,
  HighOnlineSection,
  OpeningsSection,
  PromotedSection,
  RecentlyAddedSection,
  RisingSection,
} from '@/components/home/sections'
import { OwnerBand, TrustBand } from '@/components/home/bands'
import { useSeo } from '@/lib/seo'

export default function Home() {
  useSeo({ path: '/', description: 'Каталог игровых серверов Lineage 2, Minecraft, GTA RP, Rust, CS2 и DayZ: онлайн с указанием источника, рейтинг, открытия и голосование.' })
  return (
    <>
      <Hero />
      <GamesSection />
      <OpeningsSection />
      <HighOnlineSection />
      <RisingSection />
      <PromotedSection />
      <TrustBand />
      <RecentlyAddedSection />
      <OwnerBand />
    </>
  )
}

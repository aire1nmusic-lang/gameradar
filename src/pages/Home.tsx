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

export default function Home() {
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

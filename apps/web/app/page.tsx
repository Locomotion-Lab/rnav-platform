import { HomePage } from "@/features/public-site/HomePage";
import { PublicPage } from "@/features/public-site/PublicPage";
import {
  fallbackBootstrap,
  getPublicData,
} from "@/features/public-site/data";
import {
  contactFallback,
  facilitiesFallback,
  homeFallback,
  newsFallback,
  researchFallback,
  teamFallback,
} from "@/features/public-site/fallbacks";
import { publicMetadata } from "@/lib/publicMetadata";

export const metadata = publicMetadata("RNAV Lab", "RNAV 实验室的研究方向、团队成员、科研设施与最新动态。", "/");

export default async function Page() {
  const bootstrapPromise = getPublicData("bootstrap", fallbackBootstrap);
  const [bootstrap, homepage, team] = await Promise.all([
    bootstrapPromise,
    getPublicData("homepage", {
      home: homeFallback,
      research: researchFallback,
      facilities: facilitiesFallback,
      team: teamFallback,
      news: newsFallback,
      contact: contactFallback,
    }),
    getPublicData("team", teamFallback),
  ]);
  const degraded = homepage.degraded;
  return (
    <PublicPage bootstrap={bootstrap} degraded={degraded}>
      <HomePage
        data={{
          ...homepage.data,
          team: team.degraded ? homepage.data.team : team.data,
        }}
      />
    </PublicPage>
  );
}

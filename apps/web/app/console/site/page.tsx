import { getConsoleBootstrap } from "@/features/console/bootstrap";
import { SiteContentConsole } from "@/features/console/site/SiteContentConsole";
import { PublicationRelease } from "@/features/console/site/PublicationRelease";

export default async function SitePage() {
  const result = await getConsoleBootstrap();
  const permissions = result.status === "authenticated" ? result.data.permissions : [];
  const publicOrigin = process.env.RNAV_CONSOLE_ORIGIN ? process.env.RNAV_WEB_ORIGIN : undefined;
  if (permissions.includes("site.publish") && !permissions.some((permission) => permission === "site.content.write" || permission === "site.members.write")) {
    return <PublicationRelease dirty={false} />;
  }
  return <SiteContentConsole permissions={permissions} publicOrigin={publicOrigin} />;
}

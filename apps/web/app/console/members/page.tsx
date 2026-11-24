import { getConsoleBootstrap } from "@/features/console/bootstrap";
import { MemberManagement } from "@/features/console/members/MemberManagement";

export default async function MembersPage({searchParams}:{searchParams:Promise<{profile?:string}>}) {
  const result = await getConsoleBootstrap();
  return result.status === "authenticated" ? (
    <MemberManagement
      actorId={result.data.user.id}
      isAdmin={result.data.user.tier === "super"}
      initialProfileFilter={(await searchParams).profile}
    />
  ) : null;
}

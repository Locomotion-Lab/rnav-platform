import type { Pool } from "pg";
import type { AuthenticatedUser } from "../../middleware/auth.js";
import { deriveDisplayTier, type DisplayTier } from "../auth/permissions.js";

export type ConsoleDashboardRecentItem = {
  href: string;
  id: string;
  status: string;
  title: string;
  type: "lab_usage";
  updatedAt: string;
};

export type ConsoleDashboard = {
  user: {
    id: string;
    displayName: string;
    tier: DisplayTier;
    roleLabels: string[];
  };
  tasks: {
    labUsageReviews: number;
    incompleteProfiles: number;
    staleProfiles: number;
  };
  mine: {
    labUsageOpen: number;
    assetsInUse: number;
  };
  recentItems: ConsoleDashboardRecentItem[];
};

type DashboardPool = Pick<Pool, "query">;

type MetricRow = {
  assets_in_use: string | number;
  lab_usage_open: string | number;
  lab_usage_reviews: string | number;
  incomplete_profiles: string | number;
  stale_profiles: string | number;
};

type RecentRow = {
  href: string;
  id: string;
  status: string;
  title: string;
  type: ConsoleDashboardRecentItem["type"];
  updated_at: Date | string;
};

const roleDefinitions: Array<{ label: string; permissions: string[] }> = [
  { label: "资产管理员", permissions: ["lab_assets.write"] },
  { label: "官网编辑", permissions: ["site.content.write", "site.members.write", "site.media.write"] },
  { label: "成员管理员", permissions: ["users.write", "permissions.write"] },
  { label: "系统管理员", permissions: ["system.settings.write"] },
];

export function getDashboardRoleLabels(user: AuthenticatedUser) {
  if (user.baseTier === "super") return ["超级管理员"];
  const permissions = new Set(user.permissions);
  const labels = roleDefinitions
    .filter((role) => role.permissions.some((permission) => permissions.has(permission)))
    .map((role) => role.label);
  return labels.length ? labels : ["普通成员"];
}

function numeric(value: string | number | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function createConsoleDashboardService(pool: DashboardPool) {
  return {
    async getDashboard(user: AuthenticatedUser): Promise<ConsoleDashboard> {
      const permissions = new Set(user.permissions);
      const canReviewLabUsage = permissions.has("lab_assets.write");
      const canManageMembers = permissions.has("site.members.write");

      const [metricsResult, recentResult] = await Promise.all([
        pool.query<MetricRow>(
          `SELECT
             (SELECT count(*) FROM lab_asset_usage_requests
              WHERE requester_id=$1 AND status='pending') lab_usage_open,
             (SELECT count(*) FROM lab_assets
              WHERE assigned_user_id=$1 AND status='in_use') assets_in_use,
             CASE WHEN $2::boolean THEN
               (SELECT count(*) FROM lab_asset_usage_requests WHERE status='pending')
             ELSE 0 END lab_usage_reviews,
             CASE WHEN $3::boolean THEN (SELECT count(*) FROM user_profiles WHERE COALESCE(NULLIF(name_zh,''),NULLIF(name_en,'')) IS NULL OR avatar_asset_id IS NULL OR degree_level='' OR COALESCE(NULLIF(major_zh,''),NULLIF(major_en,'')) IS NULL OR COALESCE(NULLIF(research_interests_zh,''),NULLIF(research_interests_en,'')) IS NULL) ELSE 0 END incomplete_profiles,
             CASE WHEN $3::boolean THEN (SELECT count(*) FROM user_profiles WHERE profile_content_updated_at < now()-interval '1 year') ELSE 0 END stale_profiles`,
          [user.id, canReviewLabUsage,canManageMembers],
        ),
        pool.query<RecentRow>(
          `WITH visible_usage AS (
             SELECT usage.id,
                    'lab_usage'::text type,
                    '设备使用申请 · ' || COALESCE(NULLIF(assets.name_zh,''), NULLIF(assets.name_en,''), assets.code) title,
                    usage.status,
                    '/console/lab-assets'::text href,
                    usage.updated_at
             FROM lab_asset_usage_requests usage
             JOIN lab_assets assets ON assets.id=usage.asset_id
             WHERE usage.requester_id=$1
                OR ($2::boolean AND usage.status='pending')
           )
           SELECT * FROM visible_usage
           ORDER BY updated_at DESC
           LIMIT 8`,
          [user.id, canReviewLabUsage],
        ),
      ]);

      const metrics = metricsResult.rows[0];
      return {
        user: {
          id: user.id,
          displayName: user.displayName || user.username,
          tier: deriveDisplayTier(user.baseTier, user.permissions),
          roleLabels: getDashboardRoleLabels(user),
        },
        tasks: {
          labUsageReviews: canReviewLabUsage ? numeric(metrics?.lab_usage_reviews) : 0,
          incompleteProfiles: canManageMembers ? numeric(metrics?.incomplete_profiles) : 0,
          staleProfiles: canManageMembers ? numeric(metrics?.stale_profiles) : 0,
        },
        mine: {
          labUsageOpen: numeric(metrics?.lab_usage_open),
          assetsInUse: numeric(metrics?.assets_in_use),
        },
        recentItems: recentResult.rows.map((item) => ({
          href: item.href,
          id: item.id,
          status: item.status,
          title: item.title,
          type: item.type,
          updatedAt: new Date(item.updated_at).toISOString(),
        })),
      };
    },
  };
}

export type ConsoleDashboardService = ReturnType<typeof createConsoleDashboardService>;

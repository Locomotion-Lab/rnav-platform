import type { Pool } from "pg";
import type { AdminProfileUpdate, ProfileUpdate } from "./profileSchemas.js";
import { legacyDegreeLevel, type Degree, type MemberRole } from "./memberIdentity.js";
import { profileCompleteness } from "./profileCompleteness.js";
import { personIdentityFromChineseName } from "../user-admin/memberIdentity.js";

export class ProfileConflictError extends Error {
  constructor() { super("Profile version conflict"); this.name = "ProfileConflictError"; }
}

export class ProfileAssetError extends Error {
  constructor() { super("头像资源不存在或不是有效图片"); this.name = "ProfileAssetError"; }
}

export class ProfilePublicNameError extends Error {
  constructor() { super("官网展示至少需要公开一个已填写的姓名"); this.name = "ProfilePublicNameError"; }
}

export class ProfileIdentityError extends Error {
  constructor(message = "人员账号必须使用规范中文姓名，英文名必须为“名-姓”格式") {
    super(message); this.name = "ProfileIdentityError";
  }
}

export class ProfileIdentityConflictError extends Error {
  constructor() { super("中文姓名生成的用户名已被其他账号使用"); this.name = "ProfileIdentityConflictError"; }
}

type ProfileRow = {
  user_id: string; username: string; account_kind: "person" | "system"; member_slug: string | null;
  member_status: "current" | "alumni"; member_role: MemberRole; degrees: Degree[]; public_visible: boolean;
  name_zh: string; name_en: string; email: string; phone: string;
  bio_zh: string; bio_en: string; research_interests_zh: string; research_interests_en: string;
  enrollment_year: string; graduation_year: string; major_zh: string; major_en: string;
  thesis_zh: string; thesis_en: string; destination_zh: string; destination_en: string;
  avatar_asset_id: string | null; avatar_url: string | null; personal_links: unknown;
  avatar_position_x: number; avatar_position_y: number; avatar_zoom: string;
  public_fields: string[]; version: string;
  account_email?: string | null; profile_content_updated_at?: Date; updated_at?: Date;
};

function directoryOutput(row: ProfileRow) {
  return {
    userId: row.user_id, username: row.username,
    memberStatus: row.member_status, memberRole: row.member_role, degrees: row.degrees,
    nameZh: row.name_zh, nameEn: row.name_en, publicEmail: row.email,
    phone: row.phone, bioZh: row.bio_zh, bioEn: row.bio_en,
    researchInterestsZh: row.research_interests_zh, researchInterestsEn: row.research_interests_en,
    enrollmentYear: row.enrollment_year, graduationYear: row.graduation_year,
    majorZh: row.major_zh, majorEn: row.major_en, thesisZh: row.thesis_zh, thesisEn: row.thesis_en,
    destinationZh: row.destination_zh, destinationEn: row.destination_en,
    avatarAssetId: row.avatar_asset_id, avatarUrl: row.avatar_url,
    avatarPositionX: row.avatar_position_x, avatarPositionY: row.avatar_position_y, avatarZoom: Number(row.avatar_zoom),
    personalLinks: Array.isArray(row.personal_links) ? row.personal_links : [],
  };
}

function output(row: ProfileRow) {
  return {
    ...directoryOutput(row),
    accountKind: row.account_kind, memberSlug: row.member_slug, publicVisible: row.public_visible,
    publicFields: row.public_fields, version: Number(row.version), accountEmail: row.account_email ?? "",
    updatedAt: row.updated_at ?? null, profileContentUpdatedAt: row.profile_content_updated_at ?? row.updated_at ?? null,
    completeness: profileCompleteness({ memberStatus: row.member_status, publicVisible: row.public_visible, publicFields: row.public_fields,
      nameZh: row.name_zh, nameEn: row.name_en, avatarAssetId: row.avatar_asset_id, hasGroupIdentity: row.member_role === "teacher" || Boolean(row.degrees?.length),
      enrollmentYear: row.enrollment_year, graduationYear: row.graduation_year, majorZh: row.major_zh, majorEn: row.major_en,
      researchInterestsZh: row.research_interests_zh, researchInterestsEn: row.research_interests_en,
      destinationZh: row.destination_zh, destinationEn: row.destination_en }),
  };
}

const avatarColumn = "CASE WHEN media_assets.id IS NOT NULL THEN '/api/v1/media/files/' || media_assets.id END AS avatar_url";
const profileJoin = `FROM user_profiles JOIN users ON users.id=user_profiles.user_id
  LEFT JOIN media_assets ON media_assets.id=user_profiles.avatar_asset_id AND media_assets.status='active'`;
const selectProfile = `SELECT user_profiles.*, users.username, users.account_kind, users.email AS account_email, ${avatarColumn} ${profileJoin}
  WHERE user_profiles.user_id=$1`;

export function createProfileService(pool: Pick<Pool, "query" | "connect">) {
  async function updateProfileInternal(targetUserId: string, actorUserId: string, body: ProfileUpdate | AdminProfileUpdate, admin: boolean) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<ProfileRow>(`SELECT user_profiles.*,users.username,users.account_kind,users.email AS account_email,NULL::text avatar_url FROM user_profiles JOIN users ON users.id=user_profiles.user_id WHERE user_profiles.user_id=$1 FOR UPDATE OF user_profiles`, [targetUserId]);
      if (!current.rows[0]) throw new ProfileConflictError();
      const identity = current.rows[0].account_kind === "person"
        ? personIdentityFromChineseName(body.nameZh)
        : null;
      if (current.rows[0].account_kind === "person" && (
        !identity || body.nameZh !== identity.nameZh || body.nameEn !== identity.nameEn
      )) throw new ProfileIdentityError(identity
        ? `英文名必须为“名-姓”格式：${identity.nameEn}`
        : "中文姓名必须为 2–6 个汉字，不得包含头衔、空格或字母");
      if (body.avatarAssetId) {
        const asset = await client.query("SELECT 1 FROM media_assets WHERE id=$1 AND status='active' AND mime_type LIKE 'image/%' AND ($3::boolean OR owner_user_id=$2 OR id=$4::uuid) FOR SHARE", [body.avatarAssetId, actorUserId, admin, current.rows[0].avatar_asset_id]);
        if (!asset.rowCount) throw new ProfileAssetError();
      }
      const before = output(current.rows[0]) as Record<string, unknown>;
      const memberStatus = admin ? (body as AdminProfileUpdate).memberStatus : current.rows[0].member_status;
      const memberRole = admin ? (body as AdminProfileUpdate).memberRole : current.rows[0].member_role;
      const degrees = admin ? (body as AdminProfileUpdate).degrees : current.rows[0].degrees;
      const publicVisible = admin ? (body as AdminProfileUpdate).publicVisible : current.rows[0].public_visible;
      if (publicVisible && !(
        (body.nameZh.trim() && body.publicFields.includes("name_zh"))
        || (body.nameEn.trim() && body.publicFields.includes("name_en"))
      )) throw new ProfilePublicNameError();
      const updated = await client.query(
        `UPDATE user_profiles SET member_status=$3,degree_level=$4,name_zh=$5,name_en=$6,email=$7,phone=$8,bio_zh=$9,bio_en=$10,
           research_interests_zh=$11,research_interests_en=$12,enrollment_year=$13,graduation_year=$14,
           major_zh=$15,major_en=$16,thesis_zh=$17,thesis_en=$18,destination_zh=$19,destination_en=$20,
           avatar_asset_id=$21,avatar_position_x=$22,avatar_position_y=$23,avatar_zoom=$24,
           personal_links=$25::jsonb,public_fields=$26,public_visible=$27,member_role=$28,degrees=$29,version=version+1,
           profile_content_updated_at=now(),updated_at=now()
         WHERE user_id=$1 AND version=$2`,
        [targetUserId, body.version, memberStatus, legacyDegreeLevel(memberRole, degrees), body.nameZh, body.nameEn, body.publicEmail, body.phone, body.bioZh, body.bioEn,
          body.researchInterestsZh, body.researchInterestsEn, body.enrollmentYear, body.graduationYear,
          body.majorZh, body.majorEn, body.thesisZh, body.thesisEn, body.destinationZh, body.destinationEn,
          body.avatarAssetId, body.avatarPositionX, body.avatarPositionY, body.avatarZoom,
          JSON.stringify(body.personalLinks), body.publicFields, publicVisible, memberRole, degrees]
      );
      if (!updated.rowCount) throw new ProfileConflictError();
      try {
        await client.query(
          "UPDATE users SET username=COALESCE($4,username),display_name=COALESCE(NULLIF($2,''),NULLIF($3,''),username),updated_at=now() WHERE id=$1",
          [targetUserId, body.nameZh, body.nameEn, identity?.username ?? null],
        );
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new ProfileIdentityConflictError();
        throw error;
      }
      const after = { ...body, memberStatus, memberRole, degrees, publicVisible, username: identity?.username ?? current.rows[0].username } as Record<string, unknown>;
      const changedFields = Object.keys(after).filter((key) => key !== "version" && JSON.stringify(before[key]) !== JSON.stringify(after[key]));
      await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,$2,'user',$3::text,$4::jsonb)",
        [actorUserId, admin ? "profile.admin_update" : "profile.update", targetUserId, JSON.stringify({ changedFields })]);
      const result = await client.query<ProfileRow>(selectProfile, [targetUserId]);
      await client.query("COMMIT");
      return output(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  return {
    async listDirectory() {
      const result = await pool.query<ProfileRow>(
        `SELECT user_profiles.*, users.username, ${avatarColumn} ${profileJoin}
           WHERE users.account_kind='person' ORDER BY user_profiles.name_zh, users.username`,
      );
      return result.rows.map(directoryOutput);
    },
    async getProfile(userId: string) {
      const result = await pool.query<ProfileRow>(selectProfile, [userId]);
      return result.rows[0] ? output(result.rows[0]) : null;
    },
    async updateProfile(userId: string, body: ProfileUpdate) {
      return updateProfileInternal(userId, userId, body, false);
    },
    async updateProfileAsAdmin(userId: string, actorUserId: string, body: AdminProfileUpdate) {
      return updateProfileInternal(userId, actorUserId, body, true);
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;

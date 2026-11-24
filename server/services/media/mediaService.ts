import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { detectMediaType } from "./contentType.js";
import { mediaMimeTypes, type MediaCategory } from "./mediaSchemas.js";
import type { StorageProvider } from "../storage/provider.js";

export class MediaError extends Error {
  constructor(message: string, readonly code: string, readonly status = 400) {
    super(message);
    this.name = "MediaError";
  }
}

type MediaInput = {
  filename: string; mimeType: string; body: Buffer; maxBytes: number;
  publicBaseUrl: string; pathPrefix: string; category?: MediaCategory; avatarUserId?: string;
};
type MediaRow = {
  id: string; filename: string; object_key: string; url: string; mime_type: string;
  size_bytes: string; checksum_sha256: string; status: string; category: MediaCategory;
  recycled_at: string | null; created_at: string; storage_provider?: "local" | "cos";
  owner_user_id?: string; member_avatar?: boolean; asset_linked?: boolean; references?: number;
};

const safeFilename = (filename: string) => filename.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-180) || "upload";

function mapMedia(row: MediaRow) {
  return {
    id: row.id, filename: row.filename, objectKey: row.object_key, url: row.url,
    mimeType: row.mime_type, sizeBytes: Number(row.size_bytes), checksumSha256: row.checksum_sha256,
    status: row.status, category: row.category, recycledAt: row.recycled_at,
    createdAt: row.created_at, references: Number(row.references ?? 0),
  };
}

async function references(client: Pick<Pool | PoolClient, "query">, id: string) {
  const result = await client.query<{ count: string }>("SELECT rnav_media_reference_count($1)::text count", [id]);
  return Number(result.rows[0]?.count ?? 0);
}

async function audit(client: Pick<Pool | PoolClient, "query">, actorId: string | null, action: string, id: string, detail: object = {}) {
  await client.query("INSERT INTO audit_logs(actor_id,action,target_type,target_id,detail) VALUES($1,$2,'media_asset',$3,$4::jsonb)",
    [actorId, action, id, JSON.stringify(detail)]);
}

export function createMediaService(pool: Pick<Pool, "query" | "connect">, storage: StorageProvider) {
  const providerFor = (row: MediaRow) => storage.forProvider?.(row.storage_provider ?? "cos") ?? storage;

  async function permanentDelete(id: string, actorId: string | null) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<MediaRow>(
        "SELECT * FROM media_assets WHERE id=$1 AND status='recycled' AND recycled_at <= now()-interval '3 days' FOR UPDATE", [id],
      );
      const row = result.rows[0];
      if (!row) throw new MediaError("资源未满足三天保留期", "MEDIA_RETENTION", 409);
      if (await references(client, id) > 0) throw new MediaError("资源仍被业务引用，不能删除", "MEDIA_REFERENCED", 409);
      await client.query("DELETE FROM media_assets WHERE id=$1", [id]);
      await audit(client, actorId, actorId ? "media.delete" : "media.auto_delete", id);
      try {
        await providerFor(row).deleteObject(row.object_key);
      } catch {
        throw new MediaError("存储删除失败，已保留资源等待重试", "MEDIA_DELETE_FAILED", 502);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  return {
    async list(input: { search?: string; status: string; category?: MediaCategory }) {
      const result = await pool.query<MediaRow>(`SELECT selected.*, rnav_media_reference_count(selected.id) references
        FROM (SELECT * FROM media_assets
          WHERE status=$1 AND ($2='' OR filename ILIKE '%'||$2||'%' OR object_key ILIKE '%'||$2||'%')
          AND ($3::text IS NULL OR category=$3) ORDER BY created_at DESC LIMIT 200) selected
        ORDER BY created_at DESC`, [input.status, input.search ?? "", input.category ?? null]);
      return result.rows.map(mapMedia);
    },
    async readFile(id: string, actorId: string, permissions: string[]) {
      const result = await pool.query<MediaRow>(`SELECT m.*,
        EXISTS(SELECT FROM user_profiles p JOIN users u ON u.id=p.user_id
          WHERE p.avatar_asset_id=m.id AND u.account_kind='person') member_avatar,
        (EXISTS(SELECT FROM lab_asset_public_profiles a WHERE a.image_asset_id=m.id)
          OR EXISTS(SELECT FROM lab_platform_public_profiles p WHERE p.image_asset_id=m.id)) asset_linked
        FROM media_assets m WHERE m.id=$1 AND m.status='active'`, [id]);
      const row = result.rows[0];
      const canRead = row && (
        row.owner_user_id === actorId
        || (row.member_avatar && permissions.includes("console.access"))
        || (row.asset_linked && permissions.includes("lab_assets.read"))
        || permissions.includes("site.media.write")
      );
      if (!canRead) throw new MediaError("文件不存在或不可访问", "MEDIA_NOT_FOUND", 404);
      const provider = providerFor(row);
      if (!provider.getObject) throw new MediaError("历史对象请使用原存储地址", "MEDIA_PROVIDER_UNSUPPORTED", 409);
      return { bytes: await provider.getObject(row.object_key), contentType: row.mime_type };
    },
    async getReferences(id: string) {
      return { id, count: await references(pool, id) };
    },
    async upload(input: MediaInput, actorId: string) {
      const category = input.category ?? "other";
      if (!mediaMimeTypes.includes(input.mimeType as never)) throw new MediaError("不支持的媒体类型", "MEDIA_TYPE_INVALID");
      const extension = input.filename.toLowerCase().split(".").pop() ?? "";
      const validExtension = input.mimeType === "application/pdf" ? extension === "pdf" : ["jpg", "jpeg", "png", "webp"].includes(extension);
      if (!validExtension) throw new MediaError("文件扩展名与媒体类型不匹配", "MEDIA_EXTENSION_INVALID");
      if (input.body.length < 1 || input.body.length > input.maxBytes) throw new MediaError("媒体文件超过大小限制", "MEDIA_SIZE_INVALID");
      if (detectMediaType(input.body) !== input.mimeType) throw new MediaError("文件内容与类型不匹配", "MEDIA_TYPE_INVALID");

      let filename = input.filename;
      if (category === "avatar") {
        if (!input.mimeType.startsWith("image/")) throw new MediaError("头像必须为图片", "MEDIA_TYPE_INVALID");
        const owner = await pool.query<{ username: string }>("SELECT username FROM users WHERE id=$1 AND account_kind='person'", [input.avatarUserId ?? actorId]);
        if (!owner.rows[0]) throw new MediaError("未找到头像所属成员", "MEDIA_OWNER_INVALID", 404);
        filename = `${safeFilename(owner.rows[0].username)}.${extension === "jpeg" ? "jpg" : extension}`;
      }

      const checksum = createHash("sha256").update(input.body).digest("hex");
      const id = randomUUID();
      const key = `${input.pathPrefix.replace(/\/$/, "")}/${category}/${id}/${safeFilename(filename)}`;
      const url = storage.name === "local" ? `/api/media/files/${id}` : `${input.publicBaseUrl.replace(/\/$/, "")}/${key}`;
      const client = await pool.connect();
      let uploaded = false;
      try {
        try {
          await storage.putObject({ key, body: input.body, contentType: input.mimeType });
          uploaded = true;
        } catch {
          throw new MediaError("媒体存储服务不可用", "MEDIA_STORAGE_FAILED", 502);
        }
        await client.query("BEGIN");
        const result = await client.query<MediaRow>(`INSERT INTO media_assets
          (id,bucket,filename,object_key,url,mime_type,size_bytes,checksum_sha256,status,storage_provider,owner_user_id,category)
          VALUES($1,'',$2,$3,$4,$5,$6,$7,'active',$8,$9,$10) RETURNING *`,
          [id, filename, key, url, input.mimeType, input.body.length, checksum, storage.name ?? "cos", category === "avatar" ? input.avatarUserId ?? actorId : actorId, category]);
        await audit(client, actorId, "media.upload", id, { filename, category, mimeType: input.mimeType, sizeBytes: input.body.length });
        await client.query("COMMIT");
        return mapMedia(result.rows[0]);
      } catch (error) {
        if (uploaded) {
          await client.query("ROLLBACK");
          await storage.deleteObject(key).catch(() => undefined);
        }
        throw error;
      } finally { client.release(); }
    },
    async recycle(id: string, actorId: string) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query("SELECT id FROM media_assets WHERE id=$1 AND status='active' FOR UPDATE", [id]);
        if (!result.rowCount) throw new MediaError("媒体资源不存在", "MEDIA_NOT_FOUND", 404);
        if (await references(client, id) > 0) throw new MediaError("资源仍被业务引用，不能删除", "MEDIA_REFERENCED", 409);
        await client.query("UPDATE media_assets SET status='recycled',auto_delete=false,recycled_at=now(),updated_at=now() WHERE id=$1", [id]);
        await audit(client, actorId, "media.recycle", id);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    },
    async restore(id: string, actorId: string) {
      const result = await pool.query<MediaRow>(`UPDATE media_assets SET
        status='active',auto_delete=false,recycled_at=NULL,delete_error=NULL,updated_at=now()
        WHERE id=$1 AND status='recycled' RETURNING *`, [id]);
      if (!result.rows[0]) throw new MediaError("回收站资源不存在", "MEDIA_NOT_FOUND", 404);
      await audit(pool, actorId, "media.restore", id);
      return mapMedia(result.rows[0]);
    },
    permanentDelete,
    async pruneReplacedImages() {
      const result = await pool.query<{ id: string }>(`SELECT id FROM media_assets
        WHERE status='recycled' AND auto_delete AND recycled_at<=now()-interval '3 days'
          AND rnav_media_reference_count(id)=0 ORDER BY recycled_at LIMIT 100`);
      let deleted = 0;
      let failed = 0;
      for (const { id } of result.rows) {
        try { await permanentDelete(id, null); deleted++; }
        catch (error) {
          if (!(error instanceof MediaError && ["MEDIA_RETENTION", "MEDIA_REFERENCED"].includes(error.code))) failed++;
        }
      }
      return { deleted, failed };
    },
  };
}
export type MediaService = ReturnType<typeof createMediaService>;

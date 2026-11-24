import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { requireLogin } from "../middleware/auth.js";
import { requirePasswordChanged } from "../middleware/requirePasswordChanged.js";
import { requirePermission } from "../middleware/requirePermission.js";
import type { createLabAssetsService } from "../services/lab-assets/labAssetsService.js";
import { assetSchema } from "../services/lab-assets/schemas.js";

const equipmentItem = z.object(assetSchema.shape).pick({
  code: true, name: true, manufacturer: true, model: true, condition: true, currentPlatformCode: true,
});
export const assistantEquipmentSchema = z.object({ items: z.array(equipmentItem) });

export const assistantCapabilitiesSchema = z.object({
  sources: z.array(z.object({
    id: z.enum(["equipment", "yuque", "remote-use"]),
    status: z.enum(["available", "forbidden", "unconfigured"]),
    href: z.string().optional(),
  })),
  canRequestChanges: z.boolean(),
  writeToolsEnabled: z.literal(false),
});

export function createAssistantRouter(auth: RequestHandler, assets: Pick<ReturnType<typeof createLabAssetsService>, "getSnapshot">) {
  const router = Router();
  router.use("/api/assistant", auth, requireLogin, requirePasswordChanged, requirePermission("console.access"));

  router.get("/api/assistant/capabilities", (request, response) => {
    const user = request.authUser!;
    const equipment = user.permissions.some((permission) => permission === "lab_assets.read" || permission === "lab_assets.write");
    response.set("Cache-Control", "no-store").json({
      sources: [
        equipment ? { id: "equipment", status: "available", href: "/api/v1/assistant/equipment" } : { id: "equipment", status: "forbidden" },
        { id: "yuque", status: "unconfigured" },
        { id: "remote-use", status: "unconfigured" },
      ],
      canRequestChanges: user.baseTier === "super",
      writeToolsEnabled: false,
    } satisfies z.infer<typeof assistantCapabilitiesSchema>);
  });

  router.get("/api/assistant/equipment", async (request, response) => {
    const user = request.authUser!;
    if (!user.permissions.some((permission) => permission === "lab_assets.read" || permission === "lab_assets.write")) {
      response.status(403).json({ error: "Permission denied" });
      return;
    }
    const { assets: items } = await assets.getSnapshot({ id: user.id, canManage: false });
    response.set("Cache-Control", "no-store").json({
      items: items.map(({ code, name, manufacturer, model, condition, currentPlatformCode }: z.infer<typeof equipmentItem>) => ({
        code, name, manufacturer, model, condition, currentPlatformCode,
      })),
    });
  });
  return router;
}

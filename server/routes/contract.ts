import { Router } from "express";
import { readFile } from "node:fs/promises";
export function createContractRouter() {
  const router = Router();
  router.get("/api/openapi.json",async (_request,response,next)=>{
    try { response.type("application/json").send(await readFile(new URL("../contracts/openapi.json",import.meta.url),"utf8")); } catch(error) { next(error); }
  });
  return router;
}

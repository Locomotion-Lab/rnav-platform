import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export async function buildContract() {
  const directory = new URL("../../server/routes/",import.meta.url);
  const paths: Record<string,Record<string,unknown>> = {};
  const add = (method:string, path:string, source:string) => {
    path = path.replace(/^\/api\//,"/api/v1/").replace(/:([A-Za-z]+)/g,"{$1}");
    const publicRoute = path.startsWith("/api/v1/public/") || path === "/api/v1/auth/login" || path === "/api/v1/health" || path === "/api/v1/openapi.json";
    const parameters = [...path.matchAll(/\{(\w+)\}/g)].map(match=>({name:match[1],in:"path",required:true,schema:{type:"string"}}));
    paths[path] ??= {};
    paths[path][method] = { operationId: `${method}_${path.replace(/[^a-zA-Z0-9]/g,"_")}`, parameters, security:publicRoute?[]:[{sessionCookie:[]}], "x-validation-source":source, responses:{"2XX":{description:"Success (status depends on operation); see validation source for domain DTO"},"400":{description:"Validation failed"},"401":{description:"Login required"},"403":{description:"Permission, password-change or same-origin restriction"},"409":{description:"Version conflict or referenced historical record"}} };
  };
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
    const source = await readFile(new URL(name,directory),"utf8");
    for (const match of source.matchAll(/\.(get|post|put|patch|delete)\(\s*["'](\/api\/[^"']+)["']/g)) add(match[1],match[2],`server/routes/${name}`);
  }
  for (const key of ["bootstrap","home","directions","homepage","research","news","team","facilities","contact"]) add("get",`/api/public/${key}`,"server/services/public-site/service.ts");
  for (const key of ["recycle","restore","delete"]) add("post",`/api/media/:id/${key}`,"server/routes/media.ts");
  add("get","/api/health","server/app.ts");
  const contract = {openapi:"3.1.0",info:{title:"RNAV business API",version:"1.0.0",description:"Session-based v1 API. Legacy /api aliases are transitional. Agent and miniapp token authentication are reserved, not implemented. Route inventory is checked against source; detailed domain validation remains in the linked Zod schemas/services."},servers:[{url:"/"}],paths,components:{securitySchemes:{sessionCookie:{type:"apiKey",in:"cookie",name:"rnav_session"}}}};
  return contract;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const contents=JSON.stringify(await buildContract(),null,2)+"\n";
  const destination=resolve("server/contracts/openapi.json");
  if (process.argv.includes("--check")) {
    if(await readFile(destination,"utf8")!==contents) throw Error("OpenAPI inventory drift: npm run api:contract");
  } else await writeFile(destination,contents);
}

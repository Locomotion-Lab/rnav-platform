import {timingSafeEqual} from "node:crypto";
import express, { type Router } from "express";

type Options = { routers: Router[]; health: { database(): Promise<boolean> }; gatewayToken?:string; writeEnabled?:boolean };

export function createApp({ routers, health, gatewayToken, writeEnabled = true }: Options) {
  const app = express();
  app.disable("x-powered-by");
  // The service binds only to a private/loopback interface or Compose network.
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  const healthHandler: express.RequestHandler = async (_request, response) => {
    try {
      if (!await health.database()) throw new Error("Database unavailable");
      response.json({ status: "ok", database: "ok", timestamp: new Date().toISOString() });
    } catch {
      response.status(503).json({ status: "error", database: "error", timestamp: new Date().toISOString() });
    }
  };
  app.get(["/api/health", "/api/v1/health"], healthHandler);
  app.use((request,response,next)=>{
    if (gatewayToken) {
      const actual=Buffer.from(request.get('x-rnav-gateway-token')??''); const expected=Buffer.from(gatewayToken);
      if(actual.length!==expected.length||!timingSafeEqual(actual,expected)){response.status(403).json({code:'GATEWAY_REQUIRED',error:'Trusted gateway required'});return;}
    }
    if(!writeEnabled && !['GET','HEAD','OPTIONS'].includes(request.method)){response.status(503).json({code:'WRITE_FROZEN',error:'Business writes frozen'});return;}
    next();
  });
  // Preserve legacy /api aliases while every business router also serves /api/v1.
  const v1 = express.Router();
  v1.use((request, _response, next) => { request.url = `/api${request.url}`; next(); });
  for (const router of routers) v1.use(router);
  app.use("/api/v1", v1);
  for (const router of routers) app.use(router);
  app.use((_request, response) => response.status(404).json({ error: "Not found" }));
  app.use(((error, _request, response, _next) => {
    console.error({type:error instanceof Error?error.name:"Error",code:(error as {code?:string})?.code??"INTERNAL_ERROR"});
    if (!response.headersSent) response.status(500).json({ code:"INTERNAL_ERROR", error: "Internal server error" });
  }) as express.ErrorRequestHandler);
  return app;
}

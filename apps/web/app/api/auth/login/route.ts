import {proxyInternalApi} from "@/lib/server/proxy";
export function POST(request:Request){return proxyInternalApi(request,"/api/auth/login","Authentication service unavailable");}

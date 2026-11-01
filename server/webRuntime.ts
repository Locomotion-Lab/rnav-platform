import type { Request, Response } from "express";
import type { NextServerOptions } from "next/dist/server/next.js";
import { resolveWebDir } from "./webDir.js";

type Handler = (request: Request, response: Response) => unknown;
type CreateNext = (options: NextServerOptions) => {
  prepare(): Promise<void>;
  getRequestHandler(): Handler;
};
type RuntimeOptions = {
  serverMode: "unified" | "api";
  nodeEnv: string;
  host: string;
  port: number;
};

async function loadNext(): Promise<CreateNext> {
  const module = await import("next/dist/server/next.js");
  const exported = module.default as unknown as CreateNext | { default: CreateNext };
  return (typeof exported === "function" ? exported : exported.default) as CreateNext;
}

export async function prepareWebHandler(
  options: RuntimeOptions,
  dependencies = { loadNext, resolveWebDir: () => resolveWebDir(import.meta.url) },
): Promise<Handler | undefined> {
  // API containers neither import Next at runtime nor need a web build/directory.
  if (options.serverMode === "api") return undefined;
  const createNext = await dependencies.loadNext();
  const web = createNext({
    dev: options.nodeEnv !== "production",
    dir: dependencies.resolveWebDir(),
    hostname: options.host,
    port: options.port,
  });
  await web.prepare();
  return web.getRequestHandler();
}

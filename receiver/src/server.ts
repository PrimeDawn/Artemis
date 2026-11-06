import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ReceiverConfig } from "./config.js";

export interface RunningReceiver {
  server: Server;
  address: AddressInfo;
  close(): Promise<void>;
}

export function createReceiverServer(): Server {
  // writer/plan.html section 3.2: exact URL and method boundaries, no signaling yet.
  return createServer((request, response) => {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    if (request.url !== "/healthz") {
      response.writeHead(404).end(JSON.stringify({ error: "not_found" }));
    } else if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      response.writeHead(405).end(JSON.stringify({ error: "method_not_allowed" }));
    } else {
      response.writeHead(200).end(JSON.stringify({ service: "artemis-receiver", status: "ok", version: "0.1.0-dev" }));
    }
  });
}

export async function startReceiver(config: ReceiverConfig): Promise<RunningReceiver> {
  const server = createReceiverServer();
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(config.port, config.host, () => {
      server.off("error", onError);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Receiver did not expose a TCP address");
  let closing: Promise<void> | undefined;
  return {
    server,
    address,
    close() {
      // Share one promise so repeated/concurrent close calls cannot close twice.
      closing ??= new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      return closing;
    },
  };
}

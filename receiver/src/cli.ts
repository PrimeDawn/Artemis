import { pathToFileURL } from "node:url";
import { parsePort } from "./config.js";
import { startReceiver } from "./server.js";

// writer/plan.html section 3.2: a local development CLI, not a LAN receiver.
export async function main(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  try {
    const running = await startReceiver({ host: "127.0.0.1", port: parsePort(env.PORT) });
    console.log(JSON.stringify({ event: "receiver_started", host: running.address.address, port: running.address.port }));
    const shutdown = () => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      void running.close().then(() => {
        console.log(JSON.stringify({ event: "receiver_stopped" }));
      }).catch(reportError);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  } catch (error) {
    reportError(error);
  }
}

function reportError(error: unknown): void {
  const failure = error as NodeJS.ErrnoException;
  console.error(JSON.stringify({ event: "receiver_error", code: failure.code ?? failure.name ?? "Error", message: failure.message ?? String(error) }));
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

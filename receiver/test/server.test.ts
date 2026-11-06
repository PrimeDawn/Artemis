import assert from "node:assert/strict";
import { test } from "node:test";
import { startReceiver } from "../src/server.js";

async function openReceiver(port = 0) {
  let result: Awaited<ReturnType<typeof startReceiver>> | undefined;
  await assert.doesNotReject(async () => { result = await startReceiver({ host: "127.0.0.1", port }); });
  assert.ok(result);
  return result;
}

test("public server API serves the exact health contract and route boundaries", async () => {
  const running = await openReceiver();
  try {
    assert.equal(running.address.address, "127.0.0.1");
    assert.ok(running.address.port > 0);
    const base = `http://127.0.0.1:${running.address.port}`;
    const healthy = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(3000) });
    assert.equal(healthy.status, 200);
    assert.match(healthy.headers.get("content-type") ?? "", /^application\/json/);
    assert.deepEqual(await healthy.json(), { service: "artemis-receiver", status: "ok", version: "0.1.0-dev" });
    for (const path of ["/missing", "/healthz?x=1"]) {
      const response = await fetch(base + path, { signal: AbortSignal.timeout(3000) });
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "not_found" });
    }
    const post = await fetch(`${base}/healthz`, { method: "POST", signal: AbortSignal.timeout(3000) });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get("allow"), "GET");
    assert.deepEqual(await post.json(), { error: "method_not_allowed" });
  } finally {
    await running.close();
  }
});

test("public close is concurrent-safe and releases the listening port", async () => {
  const first = await openReceiver();
  await Promise.all([first.close(), first.close()]);
  await first.close();
  const second = await openReceiver(first.address.port);
  await second.close();
});

test("startup rejects with the original EADDRINUSE code", async () => {
  const first = await openReceiver();
  try {
    await assert.rejects(startReceiver({ host: "127.0.0.1", port: first.address.port }),
      (error: NodeJS.ErrnoException) => error.code === "EADDRINUSE");
  } finally {
    await first.close();
  }
});

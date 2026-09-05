import { createServer } from "node:http";
import { once } from "node:events";
import { test, expect } from "@playwright/test";
import { exploreSiteFlow } from "../src/generator/flowExplorer.js";

test("flow explorer stays same-origin and respects page limits", async () => {
  const server = createServer((request, response) => {
    const page = request.url === "/two" ? "Two" : "One";
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html><title>${page}</title><h1>${page}</h1><a href="/two">Next</a><a href="https://outside.example/">Outside</a><button>Save</button>`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
    const result = await exploreSiteFlow(`http://127.0.0.1:${address.port}/one`, { maxPages: 2, maxDepth: 3, timeoutMs: 30_000, pageTimeoutMs: 5_000 });
    expect(result.pages.map((page) => new URL(page.url).pathname)).toEqual(["/one", "/two"]);
    expect(result.pages).toHaveLength(2);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

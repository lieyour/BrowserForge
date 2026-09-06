import { createServer } from "node:http";
import { once } from "node:events";
import { test, expect } from "@playwright/test";
import { exploreSiteFlow } from "../src/generator/flowExplorer.js";

test("flow explorer visits every distinct same-origin page by default", async () => {
  const server = createServer((request, response) => {
    const pages: Record<string, { title: string; next?: string }> = {
      "/one": { title: "One", next: "/two" },
      "/two": { title: "Two", next: "/three" },
      "/three": { title: "Three", next: "/four" },
      "/four": { title: "Four" }
    };
    const page = pages[request.url ?? "/one"] ?? pages["/one"];
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html><title>${page.title}</title><h1>${page.title}</h1>${page.next ? `<a href="${page.next}">Next</a>` : ""}<a href="https://outside.example/">Outside</a><button>Save</button>`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
    const result = await exploreSiteFlow(`http://127.0.0.1:${address.port}/one`, { pageTimeoutMs: 5_000 });
    expect(result.pages.map((page) => new URL(page.url).pathname)).toEqual(["/one", "/two", "/three", "/four"]);
    expect(result.pages).toHaveLength(4);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("flow explorer captures first-level SPA routes without clicking deeper or write buttons", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html>
      <title>Home</title>
      <script>
        function goProducts() {
          history.pushState({}, "", "/products");
          document.title = "Products";
          document.body.innerHTML = '<h1>Products</h1><button type="button" id="details" onclick="location.hash=&quot;/details&quot;">Details</button>';
        }
        function goReports() {
          location.hash = "/reports";
          document.title = "Reports";
          document.body.innerHTML = '<h1>Reports</h1><button type="button" id="report-detail" onclick="location.hash=&quot;/report-detail&quot;">Report detail</button>';
        }
        function save() { location.href = "/saved"; }
      </script>
      <h1>Home</h1>
      <button type="button" id="products" onclick="goProducts()">Products</button>
      <button type="button" id="reports" onclick="goReports()">Reports</button>
      <button type="button" id="save" onclick="save()">Save</button>`);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
    const result = await exploreSiteFlow(`http://127.0.0.1:${address.port}/`, { pageTimeoutMs: 5_000, spaNavigationWaitMs: 500 });
    expect(result.pages.map((page) => new URL(page.url).pathname + new URL(page.url).hash)).toEqual(["/", "/products", "/#/reports"]);
    expect(result.spaRoutes).toBe(2);
    expect(result.pages[1].elements).toEqual(expect.arrayContaining([expect.objectContaining({ text: "Details" })]));
    expect(result.pages.map((page) => page.url)).not.toContain(`http://127.0.0.1:${address.port}/saved`);
    expect(result.pages.map((page) => page.url)).not.toContain(`http://127.0.0.1:${address.port}/products#/details`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

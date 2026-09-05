import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileSkill } from "./compiler/skillCompiler.js";
import { exploreForm } from "./explorer/exploreForm.js";
import { runSkill } from "./runtime/skillRunner.js";

function option(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }

async function main() {
  const command = process.argv[2];
  if (command === "explore") {
    const url = process.argv[3];
    if (!url) throw new Error("Usage: npm run explore -- <url> [--out skills/site]");
    const exploration = await exploreForm(url);
    const out = option("--out") || resolve("skills", new URL(url).hostname || "local-form");
    const generated = await compileSkill(exploration, out);
    console.log(JSON.stringify({ exploration, generated: { name: generated.name, directory: generated.directory } }, null, 2));
    return;
  }
  if (command === "run") {
    const directory = option("--skill"); const action = option("--action"); const inputFile = option("--input");
    if (!directory || !action || !inputFile) throw new Error("Usage: npm run run -- --skill <directory> --action <name> --input <json>");
    console.log(JSON.stringify(await runSkill({ skillDirectory: directory, action, input: JSON.parse(await readFile(inputFile, "utf8")) }), null, 2));
    return;
  }
  throw new Error("Usage: npm run explore | npm run run");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

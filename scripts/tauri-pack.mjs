/**
 * Copy the Vite/Nitro static client into dist-tauri/ so Tauri 2 can
 * load a local build (not a public URL). TanStack Start is SSR on Vercel;
 * this writes a small HTML shell that boots the client bundle.
 */
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const src = join(root, ".vercel/output/static");
const dest = join(root, "dist-tauri");

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });

const assets = await readdir(join(dest, "assets"));
const css = assets.find((f) => f.startsWith("styles-") && f.endsWith(".css"));
const js = assets
  .filter((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f))
  .sort()
  .at(-1);
if (!css || !js) {
  throw new Error(`tauri-pack: missing client assets in ${dest}/assets`);
}

const html = `<!DOCTYPE html>
<html lang="en" class="dark antialiased">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#0E1116" />
    <title>Holdplan</title>
    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />
    <link rel="stylesheet" href="./assets/${css}" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" />
  </head>
  <body class="bg-background text-foreground">
    <div id="app"></div>
    <script type="module" src="./assets/${js}"></script>
  </body>
</html>
`;
await writeFile(join(dest, "index.html"), html);
console.log(`[tauri-pack] wrote dist-tauri/index.html → ${js} + ${css}`);

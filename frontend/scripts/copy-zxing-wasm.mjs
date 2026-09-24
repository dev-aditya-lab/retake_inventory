// Copies the barcode decoder's WebAssembly file from node_modules into public/wasm/
// so the app serves it from its OWN origin instead of the library's default CDN:
// scanning then works on a weak market connection, and the service worker can keep
// it for offline use.
//
// The copy is named by the file's hash (zxing_reader.<hash>.wasm). The app builds
// the same name from the library's exported hash (see src/lib/scanner/engine.ts),
// so a library upgrade can never pair a stale cached .wasm with new JavaScript.
//
// Runs after `npm install` and before `dev` / `build`. Never fails the install.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "zxing-wasm", "dist", "reader", "zxing_reader.wasm");
const targetDir = join(root, "public", "wasm");

if (!existsSync(source)) {
  console.warn("[zxing-wasm] Not installed yet, so the barcode decoder file was not copied. Run `npm install`.");
  process.exit(0);
}

const hash = createHash("sha256").update(readFileSync(source)).digest("hex").slice(0, 12);
const target = join(targetDir, `zxing_reader.${hash}.wasm`);

mkdirSync(targetDir, { recursive: true });
if (!existsSync(target)) copyFileSync(source, target);

// Drop copies from older library versions.
for (const file of readdirSync(targetDir)) {
  if (file.startsWith("zxing_reader.") && file.endsWith(".wasm") && file !== basename(target)) rmSync(join(targetDir, file));
}

console.log(`[zxing-wasm] Decoder ready at public/wasm/${basename(target)}`);

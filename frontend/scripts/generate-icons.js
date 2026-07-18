// Generates the PWA icon set from public/brand/logo.png. Re-run this
// whenever the source logo changes:
//   node scripts/generate-icons.js
const path = require("node:path");
const sharp = require("sharp");

const SOURCE = path.resolve(__dirname, "../public/brand/logo.png");
const OUT_DIR = path.resolve(__dirname, "../public/icons");

async function plainIcon(size, filename) {
  await sharp(SOURCE).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(OUT_DIR, filename));
}

// Maskable icons get cropped to arbitrary shapes (circle, squircle, ...) by
// the OS, so content must sit inside the ~80% "safe zone" on a solid
// background — a transparent maskable icon shows broken/inconsistent
// backgrounds across devices.
async function maskableIcon(size, filename) {
  const contentSize = Math.round(size * 0.8);
  const logo = await sharp(SOURCE).resize(contentSize, contentSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#ffffff" } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path.join(OUT_DIR, filename));
}

async function main() {
  await plainIcon(192, "icon-192.png");
  await plainIcon(512, "icon-512.png");
  await maskableIcon(192, "icon-maskable-192.png");
  await maskableIcon(512, "icon-maskable-512.png");
  // iOS renders apple-touch-icon opaque regardless — give it a solid backing.
  await maskableIcon(180, "apple-touch-icon.png");
  console.log("Generated PWA icon set in", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

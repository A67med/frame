// Renders Frame's brand assets from one set of shapes: the app icon master, the favicon,
// the NSIS installer art and the SVGs. Run with `node scripts/generate-brand.mjs`, then
// `pnpm tauri icon src-tauri/icons/source.png` to regenerate the platform icon sizes.
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const INK = "#f4f4f5";
const CANVAS = "#0c1217";
const ACCENT = "#f3ae69";

const markShapes = (bracket, play) => `
  <path fill="${bracket}" d="M12 46V24A12 12 0 0 1 24 12H62V26H26V46Z"/>
  <path fill="${bracket}" d="M88 54V76A12 12 0 0 1 76 88H38V74H74V54Z"/>
  <path fill="${play}" d="M41 36.6C41 34.4 43.4 33 45.3 34.2L66.2 47.4C68 48.5 68 51.2 66.2 52.3L45.3 65.8C43.4 67 41 65.6 41 63.4Z"/>`;

const wordShapes = (color) => `
  <g fill="none" stroke="${color}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 88V14H56M12 49H48"/>
    <path d="M78 88V42M78 62C78 49 87 42 103 42"/>
    <circle cx="137" cy="65" r="23"/><path d="M160 42V88"/>
    <path d="M184 88V42M184 60C184 49 192 42 202 42C212 42 218 49 218 60V88M218 60C218 49 226 42 236 42C246 42 252 49 252 60V88"/>
    <path d="M274 65H318C318 52 308 42 296 42C283 42 272 52 272 65C272 78 283 88 297 88C306 88 313 84 317 78"/>
  </g>`;

const markSvg = (bracket, play = bracket) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${markShapes(bracket, play)}</svg>\n`;
const wordSvg = (color) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 330 100">${wordShapes(color)}</svg>\n`;

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#1b2a34"/><stop offset="1" stop-color="${CANVAS}"/>
  </linearGradient></defs>
  <rect x="32" y="32" width="960" height="960" rx="216" fill="url(#bg)"/>
  <g transform="translate(152 152) scale(7.2)">${markShapes(INK, ACCENT)}</g>
</svg>\n`;

const renderPng = (svg, width) =>
  new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();

function writeBmp24(path, svg, width, height) {
  const image = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render();
  const rgba = image.pixels;
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const buf = Buffer.alloc(54 + rowSize * height);
  buf.write("BM", 0);
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(rowSize * height, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++) {
    let off = 54 + y * rowSize;
    const srcY = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const si = (srcY * width + x) * 4;
      buf[off++] = rgba[si + 2];
      buf[off++] = rgba[si + 1];
      buf[off++] = rgba[si];
    }
  }
  writeFileSync(path, buf);
}

const out = (...parts) => join(root, ...parts);

writeFileSync(out("src-tauri", "icons", "source.png"), renderPng(iconSvg, 1024));
writeFileSync(out("public", "favicon.png"), renderPng(iconSvg, 256));
writeFileSync(out("src", "assets", "frame-wordmark.svg"), wordSvg(INK));
writeFileSync(out("docs", "media", "frame-mark.svg"), markSvg(ACCENT));
writeFileSync(out("docs", "media", "frame-wordmark-dark.svg"), wordSvg("#11141a"));
writeFileSync(out("docs", "media", "frame-wordmark-light.svg"), wordSvg(INK));

writeBmp24(
  out("src-tauri", "installer", "sidebar.bmp"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 164 314" width="164" height="314">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b2a34"/><stop offset="1" stop-color="${CANVAS}"/>
    </linearGradient></defs>
    <rect width="164" height="314" fill="url(#bg)"/>
    <g transform="translate(40 92) scale(0.84)">${markShapes(INK, ACCENT)}</g>
    <g transform="translate(26 196) scale(0.34)">${wordShapes(INK)}</g>
  </svg>`,
  164,
  314,
);
writeBmp24(
  out("src-tauri", "installer", "header.bmp"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 57" width="150" height="57">
    <rect width="150" height="57" fill="#ffffff"/>
    <g transform="translate(12 10) scale(0.37)">${markShapes(CANVAS, "#c97a2e")}</g>
    <g transform="translate(58 18) scale(0.22)">${wordShapes(CANVAS)}</g>
  </svg>`,
  150,
  57,
);
console.log("brand assets written");

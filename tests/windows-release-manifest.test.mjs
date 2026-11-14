import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const script = join(root, "scripts/updater-manifest.mjs");
const downloads = join(root, "scripts/release-assets.mjs");

test("the updater manifest publishes Windows x64 only and references its signed NSIS installer", () => {
  const dir = mkdtempSync(join(tmpdir(), "frame-windows-release-"));
  try {
    const upload = join(dir, "upload");
    const sigs = join(dir, "sigs");
    mkdirSync(upload);
    mkdirSync(sigs);
    writeFileSync(join(upload, "Frame_0.2.1_x64-setup.exe"), "dummy-installer");
    writeFileSync(join(sigs, "Frame_0.2.1_x64-setup.exe.sig"), "fixture-signature");
    writeFileSync(join(dir, "notes.md"), "Windows fixes");
    execFileSync(process.execPath, [script, "0.2.1", upload, sigs, join(dir, "notes.md")]);
    const manifest = JSON.parse(readFileSync(join(upload, "latest.json"), "utf8"));
    assert.deepEqual(Object.keys(manifest.platforms), ["windows-x86_64"]);
    assert.match(
      manifest.platforms["windows-x86_64"].url,
      /A67med\/frame\/releases\/download\/v0\.2\.1\/Frame_0\.2\.1_x64-setup\.exe$/,
    );
    assert.equal(manifest.platforms["windows-x86_64"].signature, "fixture-signature");
    const rows = execFileSync(process.execPath, [downloads, "0.2.1", "Frame_0.2.1_x64-setup.exe"], {
      encoding: "utf8",
    });
    assert.match(rows, /\| Windows \| x64 \|/);
    assert.doesNotMatch(rows, /macOS|Linux|abdallahkattriah-sketch/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the updater manifest refuses unsigned or missing Windows installer", () => {
  const dir = mkdtempSync(join(tmpdir(), "frame-unsigned-release-"));
  try {
    const upload = join(dir, "upload");
    const sigs = join(dir, "sigs");
    mkdirSync(upload);
    mkdirSync(sigs);
    writeFileSync(join(upload, "Frame_0.2.1_x64-setup.exe"), "dummy-installer");
    writeFileSync(join(dir, "notes.md"), "Windows fixes");
    const result = spawnSync(
      process.execPath,
      [script, "0.2.1", upload, sigs, join(dir, "notes.md")],
      { encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing Frame_0\.2\.1_x64-setup\.exe or its signature/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

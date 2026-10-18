const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { findPrism, readInstances, verifyPack, prismArgs } = require("../desktop/core.cjs");

test("pack verifier detects tampering before import", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mini-pack-"));
  try {
    const pack = path.join(dir, "demo.mrpack");
    const manifest = path.join(dir, "manifest.json");
    fs.writeFileSync(pack, "valid archive bytes");
    fs.writeFileSync(manifest, JSON.stringify({ pack: "demo.mrpack", packSha256: crypto.createHash("sha256").update("valid archive bytes").digest("hex") }));
    assert.equal(verifyPack(pack, manifest).ok, true);
    fs.writeFileSync(pack, "different archive bytes");
    assert.deepEqual(verifyPack(pack, manifest), { ok: false, message: "Modpack verification failed." });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("Prism import and launch stay inside a dedicated instance root", () => {
  const root = path.resolve(os.tmpdir(), "mini-prism-root");
  const pack = path.join(root, "pack.mrpack");
  assert.deepEqual(prismArgs(root, "import", pack), ["--dir", root, "--import", pack]);
  assert.deepEqual(prismArgs(root, "launch", "YOHaku"), ["--dir", root, "--launch", "YOHaku"]);
  assert.throws(() => prismArgs(root, "launch", "../world"), /Invalid instance ID/);
});

test("instance detection only includes Prism instance folders", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mini-instance-"));
  try {
    fs.mkdirSync(path.join(dir, "instances", "YOHaku"), { recursive: true });
    fs.writeFileSync(path.join(dir, "instances", "YOHaku", "instance.cfg"), "name=YOHaku 26.3\n");
    fs.mkdirSync(path.join(dir, "instances", "incomplete"));
    assert.deepEqual(readInstances(dir), [{ id: "YOHaku", name: "YOHaku 26.3" }]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("configured Prism executable must exist and have the expected name", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mini-prism-"));
  try {
    const binary = path.join(dir, process.platform === "win32" ? "prismlauncher.exe" : "prismlauncher");
    fs.writeFileSync(binary, "binary");
    assert.equal(findPrism(binary), binary);
    assert.equal(findPrism(path.join(dir, "other.exe"), "linux", { PROGRAMFILES: dir, LOCALAPPDATA: dir }), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

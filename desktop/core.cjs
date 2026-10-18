const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function isPrismExecutable(candidate) {
  if (typeof candidate !== "string" || !candidate) return false;
  const name = path.basename(candidate).toLowerCase();
  if (!["prismlauncher.exe", "prismlauncher"].includes(name)) return false;
  try { return fs.statSync(candidate).isFile(); } catch { return false; }
}

function findPrism(savedPath, platform = process.platform, env = process.env) {
  const roots = platform === "win32"
    ? [
        path.join(env.PROGRAMFILES || "C:\\Program Files", "PrismLauncher", "prismlauncher.exe"),
        path.join(env.LOCALAPPDATA || "", "Programs", "PrismLauncher", "prismlauncher.exe"),
      ]
    : ["/Applications/Prism Launcher.app/Contents/MacOS/prismlauncher"];
  return [savedPath, ...roots].find(isPrismExecutable) || null;
}

function readInstances(dataRoot) {
  const instances = path.join(dataRoot, "instances");
  if (!fs.existsSync(instances)) return [];
  return fs.readdirSync(instances, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => {
      const configPath = path.join(instances, entry.name, "instance.cfg");
      if (!fs.existsSync(configPath)) return null;
      const config = fs.readFileSync(configPath, "utf8");
      const title = config.match(/^name=(.*)$/m)?.[1]?.trim() || entry.name;
      return { id: entry.name, name: title };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function verifyPack(packPath, manifestPath) {
  if (!fs.existsSync(packPath) || !fs.existsSync(manifestPath)) return { ok: false, message: "缺少本地整合包" };
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const expected = manifest.packSha256;
    if (!/^[a-f0-9]{64}$/i.test(expected) || manifest.pack !== path.basename(packPath)) {
      return { ok: false, message: "整合包清单无效" };
    }
    const actual = crypto.createHash("sha256").update(fs.readFileSync(packPath)).digest("hex");
    return actual === expected
      ? { ok: true, message: "整合包校验通过", manifest }
      : { ok: false, message: "整合包校验失败" };
  } catch {
    return { ok: false, message: "无法读取整合包" };
  }
}

function prismArgs(dataRoot, action, value) {
  if (!["import", "launch"].includes(action)) throw new Error("Unsupported Prism action");
  if (typeof dataRoot !== "string" || !path.isAbsolute(dataRoot)) throw new Error("Invalid instance directory");
  if (action === "import") {
    if (!value || !path.isAbsolute(value) || !value.endsWith(".mrpack")) throw new Error("Invalid pack path");
    return ["--dir", dataRoot, "--import", value];
  }
  if (typeof value !== "string" || !/^[^/\\.][^/\\]*$/.test(value) || value === "..") throw new Error("Invalid instance ID");
  return ["--dir", dataRoot, "--launch", value];
}

module.exports = { findPrism, isPrismExecutable, readInstances, verifyPack, prismArgs };

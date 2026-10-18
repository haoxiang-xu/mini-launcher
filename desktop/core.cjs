const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function isPrismExecutable(candidate) {
  if (typeof candidate !== "string" || !path.isAbsolute(candidate)) return false;
  const name = path.basename(candidate).toLowerCase();
  if (!["prismlauncher.exe", "prismlauncher"].includes(name)) return false;
  try { return fs.statSync(candidate).isFile(); } catch { return false; }
}

function findPrism(savedPath, platform = process.platform, env = process.env) {
  const value = (name) => Object.entries(env).find(([key, item]) => key.toLowerCase() === name.toLowerCase() && item)?.[1];
  const home = value("USERPROFILE") || value("HOME");
  const binary = platform === "win32" ? "prismlauncher.exe" : "prismlauncher";
  const roots = [];
  if (platform === "win32") {
    const folders = [
      value("PROGRAMFILES") || "C:\\Program Files", value("PROGRAMFILES(X86)"),
      value("LOCALAPPDATA"), value("LOCALAPPDATA") && path.join(value("LOCALAPPDATA"), "Programs"),
      home, home && path.join(home, "Downloads"), home && path.join(home, "scoop", "apps", "prismlauncher", "current"),
    ].filter(Boolean);
    for (const folder of folders) {
      for (const name of ["PrismLauncher", "Prism Launcher", ""]) roots.push(path.join(folder, name, binary));
    }
  } else if (platform === "darwin") {
    for (const folder of ["/Applications", home && path.join(home, "Applications")].filter(Boolean)) {
      roots.push(path.join(folder, "Prism Launcher.app", "Contents", "MacOS", binary));
    }
    roots.push("/opt/homebrew/bin/prismlauncher", "/usr/local/bin/prismlauncher");
  } else {
    roots.push("/usr/bin/prismlauncher", "/usr/local/bin/prismlauncher");
    if (home) roots.push(path.join(home, ".local", "bin", binary));
  }
  for (const folder of (value("PATH") || "").split(platform === "win32" ? ";" : ":")) {
    const unquoted = folder.trim().replace(/^"(.*)"$/, "$1");
    if (path.isAbsolute(unquoted)) roots.push(path.join(unquoted, binary));
  }
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
  if (!fs.existsSync(packPath) || !fs.existsSync(manifestPath)) return { ok: false, message: "Local modpack not found." };
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const expected = manifest.packSha256;
    if (!/^[a-f0-9]{64}$/i.test(expected) || manifest.pack !== path.basename(packPath)) {
      return { ok: false, message: "Invalid modpack manifest." };
    }
    const actual = crypto.createHash("sha256").update(fs.readFileSync(packPath)).digest("hex");
    return actual === expected
      ? { ok: true, message: "Modpack verified.", manifest }
      : { ok: false, message: "Modpack verification failed." };
  } catch {
    return { ok: false, message: "Unable to read the modpack." };
  }
}

function prismArgs(dataRoot, action, value, serverAddress) {
  if (!["import", "launch"].includes(action)) throw new Error("Unsupported Prism action");
  if (typeof dataRoot !== "string" || !path.isAbsolute(dataRoot)) throw new Error("Invalid instance directory");
  if (action === "import") {
    if (!value || !path.isAbsolute(value) || !value.endsWith(".mrpack")) throw new Error("Invalid pack path");
    return ["--dir", dataRoot, "--import", value];
  }
  if (typeof value !== "string" || !/^[^/\\.][^/\\]*$/.test(value) || value === "..") throw new Error("Invalid instance ID");
  const args = ["--dir", dataRoot, "--launch", value];
  if (serverAddress !== undefined) {
    if (typeof serverAddress !== "string" || !/^[a-zA-Z0-9.-]+:[0-9]{1,5}$/.test(serverAddress)) throw new Error("Invalid server address");
    const port = Number(serverAddress.split(":")[1]);
    if (port < 1 || port > 65535) throw new Error("Invalid server address");
    args.push("--server", serverAddress);
  }
  return args;
}

module.exports = { findPrism, isPrismExecutable, readInstances, verifyPack, prismArgs };

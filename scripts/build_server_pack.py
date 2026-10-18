"""Create the private server bundle from the verified client pack and real Fabric metadata."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import urllib.request
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
INSTALLER = "1.1.2"


def server_mod(data):
    with ZipFile(io.BytesIO(data)) as jar:
        metadata = json.loads(jar.read("fabric.mod.json"))
    return metadata.get("environment", "*") in ("*", "server")


def build(client_pack, mods_dir, output):
    manifest = json.loads(client_pack.with_name("manifest.json").read_text())
    if hashlib.sha256(client_pack.read_bytes()).hexdigest() != manifest["packSha256"]:
        raise ValueError("Client pack verification failed")
    output.mkdir(parents=True, exist_ok=True)
    files, excluded = [], []

    def save(name, data, source):
        destination = output / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        files.append(dict(path=name, sha256=hashlib.sha256(data).hexdigest(), source=source))

    with ZipFile(client_pack) as archive:
        index = json.loads(archive.read("modrinth.index.json"))
        for item in index["files"]:
            name = item["path"]
            if not name.startswith("mods/") or not name.endswith(".jar"):
                continue
            if Path(name).name != name.removeprefix("mods/"):
                raise ValueError("Unsafe mod path")
            local = mods_dir / Path(name).name
            if local.is_file():
                data = local.read_bytes()
            else:
                url = item["downloads"][0]
                if not url.startswith("https://cdn.modrinth.com/"):
                    raise ValueError("Unexpected mod download host")
                data = urllib.request.urlopen(url, timeout=60).read()
            expected = item["hashes"]["sha512"]
            if hashlib.sha512(data).hexdigest() != expected:
                raise ValueError(f"Mod verification failed: {name}")
            if server_mod(data):
                save(name, data, item["downloads"][0])
            else:
                excluded.append(Path(name).name)
        for name in archive.namelist():
            if not name.startswith("overrides/mods/") or not name.endswith(".jar"):
                continue
            basename = name.removeprefix("overrides/mods/")
            if Path(basename).name != basename or "\\" in basename:
                raise ValueError("Unsafe override path")
            data = archive.read(name)
            if server_mod(data):
                save("mods/" + basename, data, "private-client-pack")
            else:
                excluded.append(basename)
    url = f"https://meta.fabricmc.net/v2/versions/loader/{manifest['minecraft']}/{manifest['fabricLoader']}/{INSTALLER}/server/jar"
    launcher = urllib.request.urlopen(url, timeout=60).read()
    with ZipFile(io.BytesIO(launcher)) as jar:
        jar.getinfo("META-INF/MANIFEST.MF")
    save("server-launch.jar", launcher, url)
    result = dict(minecraft=manifest["minecraft"], fabricLoader=manifest["fabricLoader"], javaMajor=manifest["javaMajor"], distribution="private-local-test-only", files=files, excludedClientMods=excluded)
    (output / "manifest.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client-pack", type=Path, default=ROOT / "pack/local/Mini-Local-26.3.mrpack")
    parser.add_argument("--mods-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "pack/server-local")
    args = parser.parse_args()
    result = build(args.client_pack, args.mods_dir, args.output_dir)
    print(json.dumps({"files": len(result["files"]), "excluded": result["excludedClientMods"]}, indent=2))

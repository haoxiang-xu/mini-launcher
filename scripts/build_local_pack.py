"""Build a private, locally testable Modrinth pack from verified installed files.

The generated archive includes the owner's adapted purchased assets. It is ignored
by Git and must not be attached to a public release without distribution rights.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_pack_contents(archive: Path) -> dict:
    """Inventory package files, excluding configuration and unrelated overrides."""
    with ZipFile(archive) as source:
        index = json.loads(source.read("modrinth.index.json"))
        files = {}

        def add(path, delivery):
            folder, _, name = path.partition("/")
            extension = {"mods": ".jar", "shaderpacks": ".zip", "resourcepacks": ".zip"}.get(folder)
            if extension and name.lower().endswith(extension) and "/" not in name:
                files[path] = {"path": path, "delivery": delivery}

        for item in index["files"]:
            add(item["path"], "download")
        for member in source.namelist():
            for prefix in ("overrides/", "client-overrides/"):
                if member.startswith(prefix):
                    add(member[len(prefix):], "bundled")
        return {
            "minecraft": index["dependencies"]["minecraft"],
            "fabricLoader": index["dependencies"]["fabric-loader"],
            "javaMajor": 25,
            "files": sorted(files.values(), key=lambda item: item["path"].casefold()),
        }


def balanced_settings(name: str, content: bytes) -> bytes:
    desired = {
        "client-overrides/options.txt": {
            "renderDistance": "12",
            "simulationDistance": "6",
            "resourcePacks": '["vanilla"]',
        },
        "client-overrides/config/iris.properties": {"enableShaders": "false"},
    }.get(name)
    if not desired:
        return content
    lines = content.decode("utf-8").splitlines()
    separator = ":" if name.endswith("options.txt") else "="
    seen = set()
    for index, line in enumerate(lines):
        key = line.split(separator, 1)[0]
        if key in desired:
            lines[index] = key + separator + desired[key]
            seen.add(key)
    if seen != set(desired):
        raise ValueError(f"Missing expected visual setting in {name}: {set(desired) - seen}")
    return ("\n".join(lines) + "\n").encode("utf-8")


def build_pack(visual_pack: Path, mods_dir: Path, output_dir: Path) -> dict:
    requested = json.loads((ROOT / "pack/local-mods.json").read_text(encoding="utf-8"))["mods"]
    missing = [name for name in requested if not (mods_dir / name).is_file()]
    if missing:
        raise FileNotFoundError("Missing required local mods: " + ", ".join(missing))
    if not visual_pack.is_file():
        raise FileNotFoundError(f"Missing visual profile: {visual_pack}")

    output_dir.mkdir(parents=True, exist_ok=True)
    archive = output_dir / "Mini-Local-26.3.mrpack"
    with ZipFile(visual_pack) as source:
        base = json.loads(source.read("modrinth.index.json"))
        expected = {entry["path"] for entry in base["files"]}
        if base["dependencies"] != {"minecraft": "26.3", "fabric-loader": "0.19.5"}:
            raise ValueError("Visual profile targets a different Minecraft or Fabric version")
        duplicates = expected & {"mods/" + name for name in requested}
        if duplicates:
            raise ValueError("Mod appears in both official downloads and local overrides: " + ", ".join(duplicates))
        base["name"] = "mini"
        base["versionId"] = "2026.10.18-local.2"
        base["summary"] = "Private local test pack: mini furniture collection, elevator, visual profile and matching Fabric mods."
        base["formatVersion"] = 1
        members = [info for info in source.infolist() if info.filename != "modrinth.index.json"]
        for info in members:
            if info.filename.startswith("/") or ".." in Path(info.filename).parts:
                raise ValueError(f"Unsafe visual profile path: {info.filename}")
        with ZipFile(archive, "w", ZIP_DEFLATED, compresslevel=6) as target:
            target.writestr("modrinth.index.json", json.dumps(base, ensure_ascii=False, indent=2))
            for info in members:
                target.writestr(info.filename, balanced_settings(info.filename, source.read(info.filename)))
            for name in requested:
                target.write(mods_dir / name, "overrides/mods/" + name)

    manifest = {
        "pack": archive.name,
        "packSha256": sha256(archive),
        "minecraft": "26.3",
        "fabricLoader": "0.19.5",
        "javaMajor": 25,
        "officialDownloads": len(base["files"]),
        "localMods": [{"name": name, "sha256": sha256(mods_dir / name)} for name in requested],
        "contents": read_pack_contents(archive),
        "distribution": "private-local-test-only",
        "defaultGraphics": "balanced: 12 chunk render, shaders off, PBR available but not selected",
        "knownGaps": [
            "Arcade models are previews, not a game mod yet.",
            "The current EC furniture jar still registers legacy Gym items alongside the current Gym collection.",
            "Purchased Cafe/Office assets need redistribution permission before a public release.",
        ],
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    if output_dir.resolve() == (ROOT / "pack/local").resolve():
        (ROOT / "pack/contents.json").write_text(json.dumps(manifest["contents"], indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--visual-pack", required=True, type=Path)
    parser.add_argument("--mods-dir", required=True, type=Path)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "pack/local")
    args = parser.parse_args()
    print(json.dumps(build_pack(args.visual_pack, args.mods_dir, args.output_dir), ensure_ascii=False, indent=2))

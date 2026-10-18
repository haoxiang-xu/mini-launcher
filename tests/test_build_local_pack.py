import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile


SOURCE = Path(__file__).resolve().parents[1] / "scripts/build_local_pack.py"
SPEC = importlib.util.spec_from_file_location("build_local_pack", SOURCE)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class BuildLocalPackTests(unittest.TestCase):
    def make_fixture(self, root):
        mods = root / "mods"
        mods.mkdir()
        names = json.loads((MODULE.ROOT / "pack/local-mods.json").read_text(encoding="utf-8"))["mods"]
        for name in names:
            (mods / name).write_bytes(("jar:" + name).encode())
        visual = root / "visual.mrpack"
        with ZipFile(visual, "w") as archive:
            archive.writestr("modrinth.index.json", json.dumps({
                "formatVersion": 1,
                "name": "Visual",
                "dependencies": {"minecraft": "26.3", "fabric-loader": "0.19.5"},
                "files": [{"path": "mods/fabric-api.jar", "downloads": ["https://example.invalid/fabric-api.jar"], "hashes": {"sha1": "123"}}],
            }))
            archive.writestr("client-overrides/options.txt", 'renderDistance:32\nsimulationDistance:6\nresourcePacks:["vanilla","file/VibrantPBR-R1.15.zip"]\n')
            archive.writestr("client-overrides/config/iris.properties", "enableShaders=true\nshaderPack=BSL_v10.1.8.zip\n")
        return visual, mods, names

    def test_builds_isolated_pack_with_official_urls_and_local_verified_mods(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            visual, mods, names = self.make_fixture(root)
            manifest = MODULE.build_pack(visual, mods, root / "out")
            archive_path = root / "out" / manifest["pack"]
            self.assertEqual(MODULE.sha256(archive_path), manifest["packSha256"])
            with ZipFile(archive_path) as archive:
                paths = set(archive.namelist())
                index = json.loads(archive.read("modrinth.index.json"))
                self.assertEqual(index["files"][0]["downloads"], ["https://example.invalid/fabric-api.jar"])
                self.assertIn("client-overrides/options.txt", paths)
                self.assertIn("renderDistance:12", archive.read("client-overrides/options.txt").decode())
                self.assertIn('resourcePacks:["vanilla"]', archive.read("client-overrides/options.txt").decode())
                self.assertIn("enableShaders=false", archive.read("client-overrides/config/iris.properties").decode())
                self.assertEqual({"overrides/mods/" + name for name in names}, {p for p in paths if p.startswith("overrides/mods/")})
                self.assertNotIn("overrides/mods/Axiom-6.1.3-for-MC26.3.jar", paths)

    def test_refuses_missing_required_mod_before_writing_archive(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            visual, mods, names = self.make_fixture(root)
            (mods / names[0]).unlink()
            with self.assertRaisesRegex(FileNotFoundError, names[0].replace("+", "\\+")):
                MODULE.build_pack(visual, mods, root / "out")
            self.assertFalse((root / "out").exists())


if __name__ == "__main__":
    unittest.main()

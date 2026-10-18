# Minecraft Mini Launcher

Local Windows MVP for the **mini** Minecraft 26.3 client pack. The desktop UI is React + the actual Mini UI source at `vendor/mini-ui`. Electron holds a small, isolated bridge for file selection, pack verification and game launch. This version delegates Microsoft sign-in, Java installation and Minecraft launching to Prism Launcher through its documented CLI.

The launcher is a standalone mini product. Its black-and-white start screen uses the OFL-licensed Monocraft font, shows only the title and Play action, and keeps Prism and pack controls in Settings. It does not display the model portfolio.

## What is in the local pack

`pack/local/Mini-Local-26.3.mrpack` is generated from the installed local 26.3 client and the verified visual profile. It is ignored by Git and included in the **local** Windows Setup build. Its SHA-256 and all local JAR hashes are recorded in `pack/local/manifest.json`.

- Minecraft 26.3, Fabric Loader 0.19.5, Java 25.
- Eight pinned official downloads: Fabric API, Kotlin, Fzzy Config, Iris, Particle Core, Sodium, BSL and VibrantPBR.
- Nine locally supplied JARs: EC Furniture Blocks (Gym and Bar collections plus adapted Cafe and Office), PTS Deco, Skniro Furniture, Mona Lisa Painting, Lithostitched, Tectonic, Mod Menu, the latest Elevator mod and Furniture Manager. Some file names still contain the previous technical ID for world compatibility.
- Balanced first launch defaults: 12 chunk render distance, six chunk simulation distance, vanilla resource pack selected and Iris shaders disabled. BSL and VibrantPBR are present for optional activation.
- Axiom is a staff building tool, outside the player pack.

The installed EC Furniture JAR still registers older Gym entries in addition to the current Gym collection. Arcade models and the React inventory UI remain previews; neither has a playable game mod in this pack. Those differences are shown inside the launcher. Cafe and Office source assets are purchased material; the generated `.mrpack` and Windows installer are **private local test artifacts**. Check redistribution rights and replace/remove legacy Gym entries before a public player release.

## Build a local pack

Use Python 3.11+ and the local files saved from the current game installation:

```powershell
python scripts/build_local_pack.py `
  --visual-pack "C:/Minecraft/Packs/visual-profile.mrpack" `
  --mods-dir "%APPDATA%/.minecraft/mods"
```

The builder checks all requested files before creating an archive and refuses a different Minecraft/Fabric baseline. It copies the visual pack's verified URLs and configuration, then inserts owner-local mod JARs under `overrides/mods/`. The pack is meant to import into a *new* instance.

## Run and build the app

```powershell
git clone --recurse-submodules <this-repository>
cd minecraft-mini-launcher
npm ci
npm test
python -m unittest discover -s tests -p "test_*.py" -v
npm run desktop
```

`npm run dev` serves only the React preview at `http://127.0.0.1:5187/`; installing and launching require the Electron desktop app. Run `python scripts/make_icon.py` before packaging. `npm run package:win` produces a Windows NSIS setup program and bundles the single generated pack. On this machine the F: repository drive denied Electron Builder's directory rename, so the verified local installer was built with:

```powershell
npx electron-builder --win nsis --x64 --config.directories.output="C:/Minecraft/Builds/build-mini-0.1.2"
```

The macOS target is configured but has not been built or tested on a Mac.

## First run

1. Choose the Prism Launcher executable in **Settings**. Prism supports importing `.mrpack`, running a separate application data root and launching a specific instance by ID.
2. Optionally change the independent instance directory. Its default is the launcher's own app-data folder, under `PrismData`.
3. Click **Install pack**. The launcher verifies the private pack and opens Prism's import flow. Prism handles official downloads, Microsoft sign-in and Java. Finish any Prism prompts there.
4. When the imported instance appears in the launcher's **Start** view, click **Play**. The launcher invokes Prism with `--dir <isolated-root> --launch <instance-id>`.

The first version has no automatic update server or its own Microsoft authentication. The packaged installer is unsigned for public trust purposes. The user can verify the local pack from **Settings** at any time.

## References

- [Prism command line](https://www.prismlauncher.org/wiki/getting-started/command-line-interface/)
- [Modrinth pack format](https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack)

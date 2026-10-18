# Minecraft Mini Launcher

Windows MVP for the **mini** Minecraft 26.3 player and server editions. The desktop UI is React + the actual Mini UI source at `vendor/mini-ui`. Electron holds a small, isolated bridge for file selection, pack verification and game launch. This version delegates Microsoft sign-in, Java installation and Minecraft launching to Prism Launcher through its documented CLI.

The launcher is a standalone mini product. Its animated grass-green and warm-beige start screen uses a transparent render of Minecraft Ten and Minecraft Five Bold 3D letter models for the heading, with actual Mini UI buttons. The title's perspective and side faces are part of the rendered artwork; the page does not approximate them with CSS text shadows. Source credits and render settings are recorded in `src/assets/TITLE-SOURCE.txt`. Prism and pack controls live in Settings.

Mini UI is pinned as a Git submodule. Clone with `--recurse-submodules`; `npm ci` reapplies the saved `patches/mini-ui-background-frame.patch` automatically and leaves an already patched checkout unchanged. This preserves the earlier WebGL fix and its regression tests; the launcher's current background uses CSS. No separate push to the Mini UI repository is needed.

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
npx electron-builder --win nsis --x64 --config.directories.output="C:/Minecraft/Builds/build-mini-0.1.3"
```

The macOS target is configured but has not been built or tested on a Mac.

## First run

1. The desktop app automatically looks for Prism Launcher in common install folders and PATH. On Windows it also checks registered installs, Prism shortcuts in the Start menu and on the desktop, and running Prism processes. A manually selected executable takes priority. Use **Auto-detect** in Settings to retry after installing or moving Prism, or **Choose manually** for a portable copy outside those locations. OS discovery runs asynchronously and caches misses for 30 seconds; normal status polling does not repeatedly scan Windows. Prism supports importing `.mrpack`, running a separate application data root and launching a specific instance by ID.
2. Optionally change the independent instance directory. Its default is the launcher's own app-data folder, under `PrismData`.
3. Click **Install pack**. The launcher verifies the private pack and opens Prism's import flow. Prism handles official downloads, Microsoft sign-in and Java. Finish any Prism prompts there.
4. When the imported instance appears in the launcher's **Start** view, click **Play**. The launcher invokes Prism with `--dir <isolated-root> --launch <instance-id>`.

The first version has no automatic update server or its own Microsoft authentication. The packaged installer is unsigned for public trust purposes. The user can verify the local pack from **Settings** at any time.

## Player and server editions

Both editions install and launch the same private client pack through Prism. The server edition adds server controls to **Settings** and uses a separate app-data directory. Packaged player builds cannot enable server operations with a URL or command-line flag, and omit the server-management modules and server bundle.

The home screen contains Play and Settings. Both editions have **Launcher** and **Packages** settings. Packages lists the client pack's exact mod, shader and resource-pack files, distinguishes bundled files from downloads, and identifies collection previews. Its inventory comes from the generated manifest; `pack/contents.json` is the same metadata snapshot for browser previews, not a report of installed software. The builder refreshes it when generating the default local pack. The server edition also includes **Server** for configuration, start/stop controls, the collapsible console, client joining and world backups, and **playit** for its agent controls and public address.

```powershell
python scripts/build_server_pack.py --mods-dir "%APPDATA%/.minecraft/mods"
npm run desktop:server
# Independent Windows installers:
npm run package:win
npm run package:server:win
```

The server bundle includes the shared furniture, elevator and world-generation mods plus dependencies. Client-only menus, renderers, resource packs and shaders are excluded using each JAR's Fabric environment metadata. The generated bundle has a file hash manifest; **Prepare server** verifies every file before copying it and refuses to overwrite changed files. World files stay outside the bundle. Updating an existing profile to a different pack version is not automated yet.

### Local testing

1. Open **Settings → Server** in the server edition. **Local test** is selected by default.
2. Use **Prepare server**. Java 25+ is auto-detected where available; **Choose** supports a manually installed runtime. The server does not bundle Java.
3. Read the Minecraft EULA and accept it yourself before **Start server** becomes available. Preparation never accepts it. The Fabric launcher downloads its official Minecraft server and runtime libraries on first launch, so internet access is required then.
4. Wait for **Running**, then use **Launch & join** with a matching 26.3 Prism instance. A game exit does not stop the server.
5. **Stop** sends Minecraft's normal `stop` command and waits for process exit. **Restart** performs the same save first. Closing mini while a server is active offers to save and stop it; a timeout never force-kills a saving server.
6. Use **Back up** while stopped. It copies the generated `world` and `server.properties` into a timestamped backup directory. Restoration is manual in this version.

Local test defaults to `127.0.0.1:25565`, live to `127.0.0.1:25566`. Both bind to loopback and keep `online-mode=true`, RCON off and query off. Each profile has its own world, settings, log buffer and server memory allocation (default 4 GB). Memory is independent of the client. Configurable ports are checked before launch. Console commands are host-only and limited to one line per submission.

On Windows, host state lives under `%APPDATA%/minecraft-mini-launcher-server/`: `Servers/local-test`, `Servers/live`, `Servers/backups` and `Playit`. These paths and worlds are never included in the player installer.

### Optional playit access

The **Live server** profile includes manual integration with the official standalone **playit 0.17.1** agent. Choose its executable, start the live Minecraft server, then explicitly **Start playit**. **Link account** opens the agent claim page when available. In the playit dashboard, point a Minecraft Java tunnel at the displayed local address, then save the public hostname in mini.

The UI distinguishes **Agent running** from confirmed public reachability; the latter must currently be verified in the dashboard and from another connection. Stopping the agent does not stop Minecraft. Stopping/restarting the live server through its controls also stops the agent. Credentials remain under the host's `Playit` directory and sensitive setup messages are filtered out of visible logs. playit 1.x service management, automatic tunnel creation and automatic agent downloads are not implemented.

### Verification

`npm test` covers file verification, edition/sender isolation, Prism launch arguments, port conflicts, independent profiles, duplicate-start rejection and graceful process shutdown/backup. The process lifecycle integration test uses a real TCP child-process fixture, not a Minecraft client. Browser UI previews are explicit previews and never claim to have started a real server. Preview the server layout at `http://127.0.0.1:5187/?edition=server`.

On 2026-10-18, the Windows server bundle completed a real Java 25 / Fabric 0.19.5 preflight: 69 modules loaded (including nested dependencies), 242 EC furniture blocks registered, and Minecraft exited normally at its unaccepted-EULA check. Furniture collision initialization took about a minute on this host. No world was generated or game client joined during that preflight. Windows performance-counter and Skniro data-fixer warnings were logged; neither stopped this loading check. Both Windows editions were packaged and checked for resource separation; 23 Node tests and two existing Python pack tests passed.

After the host explicitly accepted the EULA, a local test on the same date reached Running at `127.0.0.1:25565` in 54.3 seconds. Minecraft status and ping returned version 26.3 (protocol 777); `list`, `save-all flush`, normal shutdown and the saved `world/level.dat` all passed. The first immediate status probe timed out; a second run confirmed a console response before querying and passed. The existing Windows performance-counter and Skniro data-fixer diagnostics remain. No authenticated player login, furniture interaction or public playit connection was tested. The local test server was left stopped. Local evidence is in `out/local-server-smoke-result.json` and `out/local-server-smoke.log`.

macOS packaging is configured (`npm run package:server:mac`) but has not been built or tested on a Mac. End-to-end account sign-in, joining through Prism and a public playit tunnel require the host's account setup.

## References

- [Prism command line](https://www.prismlauncher.org/wiki/getting-started/command-line-interface/)
- [Modrinth pack format](https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack)

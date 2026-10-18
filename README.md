# Minecraft Mini Launcher

The **mini** Minecraft 26.3 player and server editions. The desktop UI is React + the actual Mini UI source at `vendor/mini-ui`. Electron holds a small, isolated bridge for file selection, pack verification and game launch. Mini controls a modified Prism 11.1.1 background engine over a versioned JSON pipe. Microsoft sign-in, import/download progress, launch and errors belong to Mini; the upstream launcher UI is never a fallback.

The launcher is a standalone mini product. Its animated grass-green and warm-beige start screen uses a transparent render of Minecraft Ten and Minecraft Five Bold 3D letter models for the heading, with actual Mini UI buttons. The title's perspective and side faces are part of the rendered artwork; the page does not approximate them with CSS text shadows. Source credits and render settings are recorded in `src/assets/TITLE-SOURCE.txt`. Account, game folder and pack controls live in Settings.

Mini UI is pinned as a Git submodule. The Mini UI dependency repository currently requires collaborator access; making this launcher repository public does not grant access to that separate repository. Clone with `--recurse-submodules`; `npm ci` reapplies the saved `patches/mini-ui-background-frame.patch` automatically and leaves an already patched checkout unchanged. This preserves the earlier WebGL fix and its regression tests; the launcher's current background uses CSS. No separate push to the Mini UI repository is needed.

The engine is built from the pinned upstream source in `build/prism-release.json`, with adaptations under `native/prism/`. `npm run build:backend` downloads only the hash-checked source, builds the native service, deploys Qt dependencies, signs the local Mac bundle and writes a complete file inventory under ignored `runtime/backend/<platform>/`. Successful verified builds are reused until the adaptation changes. Packaging rejects missing, changed or wrong-architecture engines. Players never install, choose or download Prism separately. The former official-GUI download/discovery utilities remain developer references and are not used by the desktop app.

The service rejects direct invocation without its parent arguments, skips setup/migration dialogs and uses device-code Microsoft authentication. Import installs the modpack; the launch pipeline performs the official Minecraft/runtime downloads and checks, so import does not pre-download the entire game separately. It imports verified `.mrpack` files and launches with Prism's game task directly, bypassing its window-based launch controller. Unexpected upstream dialogs are rejected and reported to Mini; they cannot silently wait for input. Only selected public account/status fields cross the pipe. Raw native/auth logs are not forwarded. Closing Mini while the game is running lets the game continue. Microsoft authorization itself opens Microsoft's site in the user's browser.

Modified engine source, build scripts, GPL-3.0 text and upstream dependency notices accompany the engine under `backend/source/`. This is a modified build, not an official Prism release. This packaging is not a legal determination about whether the independently developed Mini frontend and engine constitute a combined work; settle that licensing scope before public distribution.
macOS uses the original local Minecraft Launcher's multi-resolution ICNS in the app bundle, rather than replacing its Dock icon with a Windows image or a resized PNG. Development Electron runs use its exported Mac PNG. The native traffic lights have a 20px top and left inset, centered at 27px alongside the optically trimmed `mini` wordmark in the 54px header.

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

`npm run dev` serves only the React preview at `http://127.0.0.1:5187/`; installing and launching require Electron. `npm run desktop` builds/verifies the native engine and opens Mini. Production packaging still requires the private pack and its verified manifest. `npm run package:preview:mac` creates a local `.app` without that private pack, for UI/engine integration checks.

For macOS native builds, install Homebrew dependencies: `qtbase qtnetworkauth qtsvg qtimageformats cmake ninja extra-cmake-modules openjdk@17 cmark qrencode tomlplusplus libarchive`. Builds use the host architecture and currently installed SDK; the verified local engine targets this Mac's OS, not all older macOS versions. Windows builds require the native compiler/Ninja toolchain, JDK 17 via `JAVA_HOME`, and Qt/dependency paths via `CMAKE_PREFIX_PATH`. Windows source builds and production installers have not been verified on this Mac; no official GUI runtime is substituted if a native build is missing.

## Microsoft sign-in configuration

Prism's [custom-build policy](https://github.com/PrismLauncher/PrismLauncher#forkingredistributingcustom-builds-policy) requests that code-changing forks use their own API identifiers or clear them. This is described as a courtesy, not a GPL prohibition on modification. There is no explicit permission there for Mini to use Prism's Microsoft registration. We leave it empty by default; obtain upstream authorization before deliberately using their identity. Merely being public does not establish permission to use an application's Client ID.

To register Mini's own identity:

1. Use [Microsoft Entra admin center](https://entra.microsoft.com/), **Entra ID → App registrations → New registration**. Name it **Mini Launcher**. The Minecraft review form forbids new application names containing Minecraft, Mojang, Microsoft, Live, Xbox, Discord or Hypixel. Choose **Personal Microsoft accounts only** for Xbox/Minecraft consumer sign-in. Microsoft's [registration guide](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app) currently lists an Azure account with an active subscription, an appropriate tenant and at least Application Developer access as prerequisites. This is separate from a Microsoft Store developer account.
2. Copy **Application (client) ID** from Overview. It is an application identifier, not a player's account ID or password.
3. In **Authentication → Advanced settings**, enable **Allow public client flows**. Our engine uses device-code flow, which does not require a redirect URI. Do not create or bundle a client secret. If converting an existing single-tenant registration to personal accounts, Microsoft may reject the change until `api.requestedAccessTokenVersion` is set to `2` in the Microsoft Graph app manifest; keep all other settings intact. See [Microsoft's desktop configuration guide](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-desktop-app-configuration#enable-public-client-flow). The pinned upstream device-code implementation requests `XboxLive.SignIn XboxLive.offline_access` against the consumer endpoint.
4. Request Minecraft Services application approval through the [Minecraft application review entry point](https://aka.ms/mce-reviewappid). On 2026-10-18 the form was inspected in a real browser. It asks for EULA/Usage Guidelines acknowledgement, a valid contact email matching the Azure registration, request type **New AppID for Approval**, application name, Application (client) ID, Directory (tenant) ID, a website/domain, and a justification. It states that submissions are reviewed weekly; that is not an approval-time guarantee. A Client ID alone is not proof of Minecraft API approval. Do not treat Entra registration or successful Xbox sign-in as a completed game-login test.
5. Put the approved ID in `build/engine-config.json` as `microsoftClientId`, or set `MINI_MICROSOFT_CLIENT_ID` for a local run. Restart Mini. The value is shipped by the app publisher; players do not register applications or enter IDs.

The owner registered Mini Launcher on 2026-10-18. Its own public client ID is configured in `build/engine-config.json`; the registration supports personal Microsoft accounts, public client flows are enabled, and the access-token version is 2. A real isolated native-backend check successfully received a Microsoft device code, then deliberately cancelled without account sign-in. This does not establish Minecraft Services approval. Microsoft login cannot be completed here until the user signs in and the necessary Minecraft application review is approved. Registration, any terms acceptance and application review must be completed by the application owner; nothing has been submitted on the user's behalf.

## First run

1. Open Mini. Its bundled service starts without setup or Prism windows.
2. Sign in under **Settings → Launcher → Microsoft account**. Mini displays the device code and opens the official Microsoft authorization page when requested. Missing publisher configuration is shown explicitly.
3. The private pack is verified before installation. All installation progress, cancellation and errors remain in Mini.
4. **Play** starts the installed game. Game exit returns Mini to idle. **Change folder** is blocked while a login, install or game is active.

Local Mac builds are ad-hoc signed for local testing, not Developer ID signed/notarized for public distribution. There is no automatic game update server yet.

## Player and server editions

Both editions install and launch the same private client pack through the bundled background engine. The server edition adds server controls to **Settings** and uses a separate app-data directory. Packaged player builds cannot enable server operations with a URL or command-line flag, and omit the server-management modules and server bundle.

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
4. Wait for **Running**, then use **Launch & join** with a matching installed 26.3 instance. A game exit does not stop the server.
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

Mac verification (2026-10-18): the ARM64 preview app was packaged with the modified service, opened in Electron, and the Mini account page reported the backend ready with sign-in explicitly pending publisher configuration. Both the prepared engine and the copy inside the packaged app passed the real-process smoke test and strict native signature verification. Static dependency inspection and actual loader output confirmed the engine uses bundled libraries rather than Homebrew paths. The app was left open.

Background-engine verification is performed with `npm run test:native` against a real native process and isolated temporary data. This covers protocol startup, no upstream dialogs, missing login configuration, rejected unauthenticated launch, failed invalid imports and successful import of a small synthetic `.mrpack`. It does not authenticate a real account, download the full private Mini pack, launch Minecraft, or join a server. The complete private pack is absent on this Mac. All 32 Node tests and three Python pack tests passed. `npm test` also covers the pipe/controller boundary and verifies engine integrity before packaging. Browser preview never claims a real game was launched.

## References

- [Prism command line](https://www.prismlauncher.org/wiki/getting-started/command-line-interface/)
- [Modrinth pack format](https://support.modrinth.com/en/articles/8802351-modrinth-modpack-format-mrpack)

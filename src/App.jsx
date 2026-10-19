import { useCallback, useEffect, useState } from "react";
import {
  RiArrowLeftLine, RiArrowRightUpLine, RiCheckLine, RiCloseLine,
  RiFolderLine, RiShieldCheckLine, RiPlayFill, RiSettings3Line,
  RiToolsLine, RiServerLine, RiGlobalLine, RiStackLine,
} from "@remixicon/react";
import { Button, MiniProvider, Tooltip } from "./mini.jsx";
import titleArtwork from "./assets/mini-launcher-title-3d.png";
import WindowControls from "./WindowControls.jsx";
import LauncherBackground from "./LauncherBackground.jsx";
import ServerSettings from "./ServerSettings.jsx";
import useServer from "./useServer.js";
import PackageSettings from "./PackageSettings.jsx";
import { AccountSettings, EngineProgress, SignInModal } from './GameSession.jsx';
import catalog from "../pack/catalog.json";
import previewContents from "../pack/contents.json";

const bridge = window.miniLauncher;
const serverEdition = bridge ? bridge.edition === 'server' : new URLSearchParams(window.location.search).get('edition') === 'server';
const windowInset = 12;
const titlebarHeight = 54;
const homeControlScale = 0.6;
const preview = {
  catalog,
  engine: { available: false, phase: bridge ? 'connecting' : 'preview', accounts: [], instances: [], loginConfigured: false, authorization: null, progress: null, error: '' },
  instanceRoot: "Available in the desktop app",
  instances: [],
  pack: { present: false, officialDownloads: 0, localMods: 0, contents: bridge ? null : previewContents },
};

const homeButtonStyle = {
  root: { paddingVertical: 0, paddingHorizontal: 0, width: 56 * homeControlScale, height: 56 * homeControlScale, borderRadius: 7 * homeControlScale, backgroundColor: "transparent", border: "none" },
  content: { children: { display: "flex", alignItems: "center", justifyContent: "center" } },
};

function App() {
  const [page, setPage] = useState('home');
  const [data, setData] = useState(preview);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [verification, setVerification] = useState(null);
  const [settingsSection, setSettingsSection] = useState('launcher');
  const server = useServer(bridge, serverEdition, setNotice);

  function openSettings(section = 'launcher') {
    setSettingsSection(section);
    setPage('settings');
  }

  const refresh = useCallback(async () => {
    if (!bridge) return;
    try { setData(await bridge.status()); }
    catch (error) { setNotice(error.message); }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 4000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  useEffect(() => bridge?.engine?.onStateChange(engine => setData(current => ({ ...current, engine, instances: engine.instances || [] }))), []);
  const engine = data.engine || preview.engine;
  const engineWorking = ['login', 'install', 'launch', 'playing'].includes(engine.phase);

  async function run(task, success) {
    if (!bridge) {
      setNotice("Preview only. Open the desktop app to install and play.");
      return;
    }
    setBusy(true);
    try {
      const result = await task();
      if (result?.ok === false) throw new Error(result.message);
      if (success) setNotice(success);
      await refresh();
    } catch (error) {
      setNotice(error.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function startGame() {
    if (!bridge) {
      setNotice("Preview only. Open the desktop app to install and play.");
    } else if (!engine.available) {
      openSettings();
      setNotice("The game component is unavailable. Please restart Mini.");
    } else if (!engine.accounts.length) {
      openSettings();
      if (engine.loginConfigured) run(() => bridge.engine.login());
      else setNotice("Microsoft sign-in is being configured for this build.");
    } else if (!data.pack.present) {
      openSettings();
      setNotice("The local modpack is not ready yet.");
    } else if (data.instances.length) {
      run(() => bridge.play(data.instances[0].id));
    } else {
      run(async () => {
        await bridge.install();
        const installed = await bridge.status();
        if (!installed.instances.length) throw new Error('Your game could not be prepared. Please retry.');
        return bridge.play(installed.instances[0].id);
      });
    }
  }

  return (
    <MiniProvider>
      <div
        className={`launcher-shell${bridge?.windowControls ? ` desktop-shell desktop-${bridge.windowControls.platform}` : ""}`}
        style={{ "--window-inset": `${windowInset}px`, "--titlebar-height": `${titlebarHeight}px` }}
      >
        <LauncherBackground />
        <header className="launcher-header">
          <WindowControls api={bridge?.windowControls} onError={setNotice} />
        </header>

        <div className="launcher-content-frame">
          <div
            className={`launcher-content${page === 'home' ? '' : ' launcher-content-settings'}`}
            key={page}
            tabIndex={page !== "home" ? 0 : undefined}
            data-sb-edge-top={titlebarHeight + windowInset}
            data-sb-edge-bottom={40}
            data-sb-wall={5}
          >
        {page === "home" ? (
          <main className="home-screen">
            <div className="home-center">
              <h1 className="launcher-title" aria-label="Mini Launcher — for Minecraft">
                <svg viewBox="68 387 1785 285" aria-hidden="true" focusable="false">
                  <image href={titleArtwork} width="1920" height="1080" />
                </svg>
              </h1>
              <div className="home-actions">
                <Tooltip label="Play" position="right" trigger={["hover", "focus"]}>
                  <Button aria-label="Play" disabled={busy || engineWorking || engine.phase === 'connecting'} onClick={startGame} style={homeButtonStyle}>
                    <RiPlayFill size={24 * homeControlScale} aria-hidden="true" />
                  </Button>
                </Tooltip>
                <Tooltip label="Settings" position="right" trigger={["hover", "focus"]}>
                  <Button aria-label="Settings" onClick={() => openSettings()} style={homeButtonStyle}>
                    <RiSettings3Line size={24 * homeControlScale} aria-hidden="true" />
                  </Button>
                </Tooltip>
              </div>
            </div>
          </main>
        ) : (
          <main className="settings-screen settings-with-sidebar">
            <div className="settings-navigation">
            <button className="back-link" onClick={() => setPage('home')}>
              <RiArrowLeftLine size={18} /> Back
            </button>
            <h1>Settings</h1>
              <nav className="settings-sidebar" aria-label="Settings sections">
                {[
                  {id:'launcher', label:'Launcher', Icon:RiToolsLine},
                  {id:'packages', label:'Packages', Icon:RiStackLine},
                  ...(serverEdition ? [
                  {id:'server', label:'Server', Icon:RiServerLine},
                  {id:'playit', label:'playit', Icon:RiGlobalLine},
                  ] : []),
                ].map(({id,label,Icon}) => <Button key={id} aria-pressed={settingsSection === id} onClick={()=>setSettingsSection(id)} style={{
                  root:{width:'100%',justifyContent:'flex-start',fontSize:14,paddingVertical:10,paddingHorizontal:13,lineHeight:'20px',color:settingsSection===id?'#f0f0f0':'#a3a3a3',backgroundColor:settingsSection===id?'#0b0b0b':'transparent'},
                  content:{children:{display:'flex',alignItems:'center',gap:10,lineHeight:'20px'}},
                }}><Icon size={17} aria-hidden="true"/><span>{label}</span></Button>)}
              </nav>
            </div>
            <div className="settings-scroll-viewport">
              <div className="settings-scroll-region scrollable" tabIndex={0} data-sb-edge={32} data-sb-wall={5} aria-label="Settings content">
              <div className="settings-panels">
            <section className="settings-list settings-panel" hidden={settingsSection !== 'launcher'} aria-label="Launcher settings">
              <AccountSettings engine={engine} onSignIn={() => run(() => bridge.engine.login())} onSignOut={id => run(() => bridge.engine.logout(id))}/>

              <div className="setting-row">
                <div className="setting-icon"><RiFolderLine size={20} /></div>
                <div className="setting-main">
                  <h2>Game folder</h2>
                  <p>Modpacks and saves are stored in separate instances.</p>
                  <div className="path-value">{data.instanceRoot}</div>
                  <div className="setting-actions">
                    <Button label="Change folder" disabled={engineWorking} onClick={() => run(() => bridge.selectRoot())} />
                  </div>
                </div>
              </div>

              <div className="setting-row">
                <div className="setting-icon"><RiShieldCheckLine size={20} /></div>
                <div className="setting-main">
                  <h2>Game files</h2>
                  <p>{data.pack.present ? "Local modpack ready" : "Waiting for the local modpack"}</p>
                  <div className="setting-actions">
                    <Button label="Verify files" onClick={() => run(async () => {
                      const result = await bridge.verify();
                      setVerification(result);
                      return result;
                    }, "Files verified.")} />
                    <button onClick={() => run(() => bridge.openPackFolder())}>Open folder <RiArrowRightUpLine size={15} /></button>
                    <button onClick={() => setSettingsSection('packages')}>View packages <RiArrowRightUpLine size={15} /></button>
                  </div>
                  {verification && <small className={verification.ok ? "verified" : "failed"}>
                    {verification.ok && <RiCheckLine size={14} />} {verification.message}
                  </small>}
                </div>
              </div>
            </section>
                <PackageSettings pack={data.pack} catalog={data.catalog} preview={!bridge} hidden={settingsSection !== 'packages'}/>
                {serverEdition && <ServerSettings server={server} section={settingsSection} bridge={bridge} client={data} onNotice={setNotice} onLauncherSettings={()=>setSettingsSection('launcher')}/>}
              </div>
            </div>
            </div>
          </main>
        )}

          </div>
        </div>
        <footer className="launcher-footer"><span>mini</span><span>0.1.4</span></footer>
        {notice && <div className="toast" role="status">
          <span>{notice}</span>
          <button aria-label="Dismiss notification" onClick={() => setNotice("")}><RiCloseLine size={17} /></button>
        </div>}
      </div>
      <EngineProgress engine={engine} onCancel={() => run(() => bridge.engine.cancel())}/>
      <SignInModal engine={engine} onOpenBrowser={() => run(() => bridge.engine.openAuthorization())} onCancel={() => run(() => bridge.engine.cancel())}/>
    </MiniProvider>
  );
}

export default App;

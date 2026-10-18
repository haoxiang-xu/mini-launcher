import { useCallback, useEffect, useState } from "react";
import {
  RiArrowRightUpLine, RiCheckLine, RiCloseLine, RiDownload2Line,
  RiExternalLinkLine, RiFolderLine, RiGamepadLine, RiInformationLine,
  RiPlayFill, RiRefreshLine, RiSettings3Line, RiShieldCheckLine,
  RiStackLine, RiToolsLine,
} from "@remixicon/react";
import { Button, MiniProvider } from "./mini.jsx";
import catalog from "../pack/catalog.json";

const bridge = window.miniLauncher;
const preview = {
  appName: "Minecraft Mini Launcher",
  catalog,
  prismPath: null,
  instanceRoot: "桌面版会在这里显示独立实例目录",
  instances: [],
  pack: { present: false, officialDownloads: 8, localMods: 9, knownGaps: [] },
};

const navItems = [
  { id: "home", label: "开始", icon: RiGamepadLine },
  { id: "content", label: "内容", icon: RiStackLine },
  { id: "settings", label: "设置", icon: RiSettings3Line },
];

function App() {
  const [tab, setTab] = useState("home");
  const [data, setData] = useState(preview);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [verification, setVerification] = useState(null);

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

  async function run(task, success) {
    if (!bridge) { setNotice("当前是网页预览。请打开桌面程序使用安装与启动功能。"); return; }
    setBusy(true);
    try {
      const result = await task();
      if (result?.ok === false) throw new Error(result.message);
      if (success) setNotice(success);
      await refresh();
    } catch (error) { setNotice(error.message || "操作失败"); }
    finally { setBusy(false); }
  }

  const instance = data.instances[0];
  const canInstall = data.pack.present && Boolean(data.prismPath);
  const readyCount = data.catalog.components.filter((component) => component.status === "installed").length;

  return (
    <MiniProvider>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="wordmark" aria-label="mini launcher">
            <div className="wordmark-square"><span>mini</span></div>
            <div className="wordmark-name"><strong>mini</strong><span>launcher</span></div>
          </div>
          <div className="sidebar-section-label">WORKSPACE</div>
          <nav className="nav-list" aria-label="主导航">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button key={id} className={`nav-item ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
                <Icon size={19} /><span>{label}</span>{tab === id && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-info"><span className="status-light" /> 本地测试版 · 0.1.1</div>
            <div className="sidebar-caption">Minecraft Java 26.3<br />Fabric 0.19.5</div>
          </div>
        </aside>

        <main className="main-content">
          <header className="topbar"><span>MINECRAFT MINI LAUNCHER</span><span className="topbar-right">26.3 <span className="topbar-sep">/</span> FABRIC 0.19.5</span></header>
          {tab === "home" && (
            <div className="page home-page">
              <section className="hero">
                <div className="hero-copy">
                  <div className="eyebrow"><span className="eyebrow-line" /> MINI COLLECTION</div>
                  <h1>进入我们<br /><em>建造的世界。</em></h1>
                  <p>家具、器械与空间，集中在一个游戏实例里。</p>
                  <div className="hero-actions">
                    {instance ? (
                      <Button className="primary-action" disabled={busy} onClick={() => run(() => bridge.play(instance.id), "正在启动游戏") }><RiPlayFill size={20} /> 开始游戏</Button>
                    ) : (
                      <Button className="primary-action" disabled={busy || !canInstall} onClick={() => run(() => bridge.install(), "已打开安装界面；完成导入后即可启动") }><RiDownload2Line size={18} /> 安装整合包</Button>
                    )}
                    <button className="text-action" onClick={() => setTab("content")}>查看内容 <RiArrowRightUpLine size={18} /></button>
                  </div>
                  {!bridge && <p className="hero-note">网页预览 · 安装与启动需要桌面程序</p>}
                  {bridge && !data.prismPath && <p className="hero-note">先在「设置」中选择 Prism Launcher 启动核心。</p>}
                  {bridge && data.prismPath && !data.pack.present && <p className="hero-note">本地整合包尚未生成。</p>}
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="hero-grid" />
                  <img className="hero-main-image" src="./previews/treadmill.webp" alt="" />
                  <div className="hero-art-label">01 / GYM<br /><strong>TREADMILL</strong></div>
                </div>
              </section>

              <section className="summary-line">
                <div><span className="summary-number">{readyCount.toString().padStart(2, "0")}</span><span>已接入的内容组</span></div>
                <div><span className="summary-number">{data.pack.localMods.toString().padStart(2, "0")}</span><span>本地模组文件</span></div>
                <div><span className="summary-number">{data.pack.officialDownloads.toString().padStart(2, "0")}</span><span>官方来源文件</span></div>
                <div className="summary-state"><span className={`state-badge ${instance ? "ready" : ""}`}>{instance ? "可以开始" : data.pack.present ? "等待导入" : "准备中"}</span></div>
              </section>

              <section className="section-block">
                <div className="section-heading"><div><span className="section-kicker">SELECTED CONTENT</span><h2>本次包含</h2></div><button onClick={() => setTab("content")}>查看全部 <RiArrowRightUpLine size={16} /></button></div>
                <div className="preview-grid">
                  <PreviewCard image="treadmill.webp" category="GYM" title="Gym Collection" />
                  <PreviewCard image="smith.webp" category="FITNESS" title="Smith Machine" />
                  <PreviewCard image="pool-table.webp" category="ARCADE" title="模型预览 · 待适配" pending />
                </div>
              </section>
            </div>
          )}

          {tab === "content" && (
            <div className="page content-page">
              <div className="page-intro"><span className="section-kicker">THE COLLECTION</span><h1>整合包内容</h1><p>以下是当前已接入的模组，以及仍在制作中的组件。</p></div>
              <div className="catalog-grid">
                {data.catalog.components.map((component, index) => (
                  <div className="catalog-card" key={component.id}>
                    <span className="catalog-index">{String(index + 1).padStart(2, "0")}</span>
                    <div className="catalog-body"><strong>{component.name}</strong><small>{component.source}</small></div>
                    <span className={`catalog-status ${component.status === "installed" ? "included" : "pending"}`}>{component.status === "installed" ? "已接入" : component.status === "model-only" ? "模型阶段" : "界面原型"}</span>
                  </div>
                ))}
              </div>
              <div className="content-note"><RiInformationLine size={19} /><p>Cafe、Office 家具已包含在当前 EC Furniture 模组中。本机测试包含原有 Gym 条目；发布给玩家前会清理旧条目并核对购买素材的分发许可。</p></div>
            </div>
          )}

          {tab === "settings" && (
            <div className="page settings-page">
              <div className="page-intro"><span className="section-kicker">YOUR SETUP</span><h1>安装与设置</h1><p>安装到独立实例目录，现有 Minecraft 文件不会被改动。</p></div>
              <div className="settings-grid">
                <div className="settings-card"><div className="setting-icon"><RiToolsLine size={21} /></div><div><h2>启动核心</h2><p>基础版通过 Prism 完成微软登录、Java 安装和游戏启动。</p><div className="path-value">{data.prismPath || "尚未选择 Prism Launcher"}</div><div className="setting-actions"><Button label="选择程序" onClick={() => run(() => bridge.selectPrism())} /><button onClick={() => run(() => bridge.downloadPrism())}>官方下载 <RiExternalLinkLine size={15} /></button></div></div></div>
                <div className="settings-card"><div className="setting-icon"><RiFolderLine size={21} /></div><div><h2>游戏实例目录</h2><p>整合包放在独立目录，便于更新和修复。</p><div className="path-value">{data.instanceRoot}</div><div className="setting-actions"><Button label="更改目录" onClick={() => run(() => bridge.selectRoot())} /></div></div></div>
                <div className="settings-card"><div className="setting-icon"><RiShieldCheckLine size={21} /></div><div><h2>本地整合包</h2><p>{data.pack.present ? `${data.pack.localMods} 个本地模组 · ${data.pack.officialDownloads} 个官方来源文件` : "等待生成本地整合包"}</p><div className="setting-actions"><Button label="校验文件" onClick={() => run(async () => { const result = await bridge.verify(); setVerification(result); return result; }, "文件校验通过")} /><button onClick={() => run(() => bridge.openPackFolder())}>打开目录 <RiArrowRightUpLine size={15} /></button></div>{verification && <small className={verification.ok ? "verified" : "failed"}>{verification.message}</small>}</div></div>
              </div>
              <div className="settings-footnote">Minecraft Java 26.3 · Fabric Loader 0.19.5 · Java 25</div>
            </div>
          )}
        </main>
        {notice && <div className="toast" role="status"><span>{notice}</span><button aria-label="关闭提示" onClick={() => setNotice("")}><RiCloseLine size={17} /></button></div>}
      </div>
    </MiniProvider>
  );
}

function PreviewCard({ image, category, title, pending = false }) {
  return <div className="preview-card"><div className="preview-image"><img src={`./previews/${image}`} alt="" /></div><div className="preview-text"><span>{category} {pending && <small>PREVIEW</small>}</span><strong>{title}</strong></div><RiArrowRightUpLine size={17} /></div>;
}

export default App;

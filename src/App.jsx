import { useCallback, useEffect, useState } from "react";
import {
  RiArrowLeftLine, RiArrowRightUpLine, RiCheckLine, RiCloseLine,
  RiFolderLine, RiSettings3Line, RiShieldCheckLine,
  RiToolsLine,
} from "@remixicon/react";
import { Button, MiniProvider } from "./mini.jsx";

const bridge = window.miniLauncher;
const preview = {
  prismPath: null,
  instanceRoot: "桌面程序中显示游戏实例目录",
  instances: [],
  pack: { present: false, officialDownloads: 0, localMods: 0 },
};

function App() {
  const [page, setPage] = useState("home");
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
    if (!bridge) {
      setNotice("网页仅供预览；安装和启动请打开桌面程序。");
      return;
    }
    setBusy(true);
    try {
      const result = await task();
      if (result?.ok === false) throw new Error(result.message);
      if (success) setNotice(success);
      await refresh();
    } catch (error) {
      setNotice(error.message || "操作失败");
    } finally {
      setBusy(false);
    }
  }

  function startGame() {
    if (!bridge) {
      setNotice("网页仅供预览；安装和启动请打开桌面程序。");
    } else if (!data.prismPath) {
      setPage("settings");
      setNotice("首次使用请先选择 Prism Launcher。");
    } else if (!data.pack.present) {
      setPage("settings");
      setNotice("本地整合包尚未生成。");
    } else if (data.instances.length) {
      run(() => bridge.play(data.instances[0].id), "正在启动游戏");
    } else {
      run(() => bridge.install(), "已打开整合包导入界面");
    }
  }

  return (
    <MiniProvider>
      <div className="launcher-shell">
        <header className="launcher-header">
          <span className="header-wordmark">mini</span>
          <button
            className="header-control"
            aria-label={page === "home" ? "打开设置" : "返回开始"}
            title={page === "home" ? "设置" : "返回"}
            onClick={() => setPage(page === "home" ? "settings" : "home")}
          >
            {page === "home" ? <RiSettings3Line size={21} /> : <RiCloseLine size={21} />}
          </button>
        </header>

        {page === "home" ? (
          <main className="home-screen">
            <div className="home-center">
              <h1 className="minecraft-title" aria-label="Minecraft Mini Launcher">
                <span className="title-main" data-text="MINECRAFT">MINECRAFT</span>
                <span className="title-sub">MINI LAUNCHER</span>
              </h1>
              <Button
                label="开始游戏"
                disabled={busy}
                onClick={startGame}
                style={{ root: { fontSize: 18, paddingVertical: 16, paddingHorizontal: 42, minWidth: 224, backgroundColor: "#151515", border: "1px solid #343434" } }}
              />
            </div>
          </main>
        ) : (
          <main className="settings-screen">
            <button className="back-link" onClick={() => setPage("home")}>
              <RiArrowLeftLine size={18} /> 返回
            </button>
            <h1>设置</h1>
            <p className="settings-intro">游戏安装在独立目录中。</p>

            <section className="settings-list" aria-label="启动器设置">
              <div className="setting-row">
                <div className="setting-icon"><RiToolsLine size={20} /></div>
                <div className="setting-main">
                  <h2>启动核心</h2>
                  <p>使用 Prism 登录 Microsoft 账号并启动 Minecraft。</p>
                  <div className="path-value">{data.prismPath || "尚未选择 Prism Launcher"}</div>
                  <div className="setting-actions">
                    <Button label="选择程序" onClick={() => run(() => bridge.selectPrism())} />
                    <button onClick={() => run(() => bridge.downloadPrism())}>官方下载 <RiArrowRightUpLine size={15} /></button>
                  </div>
                </div>
              </div>

              <div className="setting-row">
                <div className="setting-icon"><RiFolderLine size={20} /></div>
                <div className="setting-main">
                  <h2>游戏实例目录</h2>
                  <p>整合包和存档保存在独立实例中。</p>
                  <div className="path-value">{data.instanceRoot}</div>
                  <div className="setting-actions">
                    <Button label="更改目录" onClick={() => run(() => bridge.selectRoot())} />
                  </div>
                </div>
              </div>

              <div className="setting-row">
                <div className="setting-icon"><RiShieldCheckLine size={20} /></div>
                <div className="setting-main">
                  <h2>游戏文件</h2>
                  <p>{data.pack.present ? "本地整合包已就绪" : "等待本地整合包"}</p>
                  <div className="setting-actions">
                    <Button label="校验文件" onClick={() => run(async () => {
                      const result = await bridge.verify();
                      setVerification(result);
                      return result;
                    }, "文件校验通过")} />
                    <button onClick={() => run(() => bridge.openPackFolder())}>打开目录 <RiArrowRightUpLine size={15} /></button>
                  </div>
                  {verification && <small className={verification.ok ? "verified" : "failed"}>
                    {verification.ok && <RiCheckLine size={14} />} {verification.message}
                  </small>}
                </div>
              </div>
            </section>
          </main>
        )}

        <footer className="launcher-footer"><span>mini</span><span>0.1.4</span></footer>
        {notice && <div className="toast" role="status">
          <span>{notice}</span>
          <button aria-label="关闭提示" onClick={() => setNotice("")}><RiCloseLine size={17} /></button>
        </div>}
      </div>
    </MiniProvider>
  );
}

export default App;

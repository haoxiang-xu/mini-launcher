import { useEffect, useRef, useState } from 'react';
import { RiFolderLine, RiPlayFill, RiStopFill, RiRestartLine, RiDownloadLine, RiFileCopyLine, RiArrowRightLine } from '@remixicon/react';
import { Button, Select } from './mini.jsx';
import { serverLabels, serverButtonStyle as compact } from './useServer.js';
import './server-settings.css';

export default function ServerSettings({ server, section, bridge, client, onNotice, onLauncherSettings }) {
  const { api, data, selected, setSelected, profile, locked, running, busy, act } = server;
  const [port, setPort] = useState(profile.port);
  const [memory, setMemory] = useState(profile.memoryMb / 1024);
  const [publicAddress, setPublicAddress] = useState(data.playit.publicAddress || '');
  const [accepted, setAccepted] = useState(false);
  const [command, setCommand] = useState('');
  const [instance, setInstance] = useState('');
  const consoleRef = useRef(null);
  const agentLocked = ['starting', 'running', 'stopping'].includes(data.playit.status);
  const liveRunning = data.profiles.find(item => item.id === 'live')?.status === 'running';

  useEffect(() => {
    setPort(profile.port);
    setMemory(profile.memoryMb / 1024);
  }, [selected, profile.port, profile.memoryMb]);
  useEffect(() => setPublicAddress(data.playit.publicAddress || ''), [data.playit.publicAddress]);
  useEffect(() => { setAccepted(false); setCommand(''); }, [selected]);
  useEffect(() => {
    if (!client.instances.some(item => item.id === instance)) setInstance(client.instances[0]?.id || '');
  }, [client.instances, instance]);
  useEffect(() => {
    const element = consoleRef.current;
    if (element && element.scrollHeight - element.scrollTop - element.clientHeight < 100) element.scrollTop = element.scrollHeight;
  }, [profile.logs.at(-1)?.time, selected]);

  async function submitCommand(event) {
    event.preventDefault();
    if (await act(() => api.command(selected, command))) setCommand('');
  }

  return <>
    <section className="settings-panel server-settings-panel" hidden={section !== 'server'} aria-label="Server settings">
      <div className="settings-section-heading server-settings-heading"><div><h2>Server</h2><p>Manage your local and live worlds.</p></div><span className={`server-status status-${profile.status}`} role="status"><i/>{serverLabels[profile.status]}</span></div>
      <div className="server-profile-tabs" role="group" aria-label="Configure server profile">
        {data.profiles.map(item => <button key={item.id} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>{item.name}</button>)}
      </div>
      <div className="server-card">
        <div className="server-card-heading"><h3>{profile.name}</h3><Button aria-label="Open server folder" style={compact} onClick={() => act(() => api.openFolder(selected))}><RiFolderLine size={17}/></Button></div>
        <div className="server-address"><code>{profile.address}</code><Button aria-label="Copy local address" style={compact} onClick={() => act(() => api.copyAddress(selected), 'Local address copied.')}><RiFileCopyLine size={15}/></Button></div>
        <p className="server-hint">{selected === 'local-test' ? 'Only this computer can connect. No playit needed.' : 'An independent world. Configure public access in playit.'}</p>
        {!profile.prepared && <p className="server-hint">{data.bundleReady ? 'The matching server pack is ready to install.' : 'Generate or bundle the server pack before preparing this profile.'}</p>}
        {profile.prepared && !profile.eulaAccepted && <div className="server-eula"><label><input type="checkbox" checked={accepted} disabled={busy} onChange={event => setAccepted(event.target.checked)}/> I accept the Minecraft EULA.</label><button onClick={() => act(() => api.openEula())}>Read EULA ↗</button></div>}
        <div className="server-actions">
          {!profile.prepared
            ? <Button style={compact} disabled={busy || locked || (!data.bundleReady && Boolean(api))} onClick={() => act(() => api.prepare(selected), 'Server prepared.')}><RiDownloadLine size={16}/><span>Prepare server</span></Button>
            : <Button style={compact} disabled={busy || locked || (!profile.eulaAccepted && !accepted)} onClick={() => act(() => api.start(selected, accepted))}><RiPlayFill size={16}/><span>Start server</span></Button>}
          <Button style={compact} disabled={busy || !['running', 'starting'].includes(profile.status)} onClick={() => act(() => api.stop(selected))}><RiStopFill size={16}/><span>Stop</span></Button>
          <Button aria-label="Restart server" style={compact} disabled={busy || !running} onClick={() => act(() => api.restart(selected))}><RiRestartLine size={16}/></Button>
        </div>
        {profile.error && <p className="server-error" role="alert">{profile.error}</p>}
        <div className="server-config-divider"/>
        <div className="server-settings-fields">
          <label>Port<input type="number" min="1024" max="65535" value={port} disabled={locked || busy} onChange={event => setPort(Number(event.target.value))}/></label>
          <label>Memory · GB<input type="number" min="1" max="64" step="1" value={memory} disabled={locked || busy} onChange={event => setMemory(Number(event.target.value))}/></label>
        </div>
        <div className="server-java"><span>Java</span><span className="server-path" title={profile.javaPath}>{profile.javaPath || 'Choose Java 25 or newer'}</span><Button label="Choose Java" style={compact} disabled={locked || busy} onClick={() => act(() => api.selectJava(selected))}/></div>
        {locked && <p className="server-hint">Stop the server to change its configuration.</p>}
        <div className="server-actions"><Button label="Save settings" style={compact} disabled={locked || busy} onClick={() => act(() => api.configure(selected, { port, memoryMb: memory * 1024 }), 'Server settings saved.')}/></div>
      </div>
      <details className="server-card server-console-details" onToggle={event => { if (event.currentTarget.open && consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight; }}>
        <summary>Console</summary>
        <div className="server-console scrollable" ref={consoleRef} role="log" aria-label="Server console" aria-live="off" data-sb-wall={5}>
          {profile.logs.length ? profile.logs.map((line, index) => <div key={`${line.time}-${index}`}><time>{line.time.slice(11, 19)}</time><span>{line.message}</span></div>) : <p>Server output will appear here.</p>}
        </div>
        <form className="server-command" onSubmit={submitCommand}><input aria-label="Server command" placeholder={running ? 'Command, e.g. list' : 'Start the server to send commands'} value={command} onChange={event => setCommand(event.target.value)} disabled={!running || busy} maxLength={500}/><button aria-label="Send command" disabled={!running || busy || !command.trim()}><RiArrowRightLine size={17}/></button></form>
      </details>
      <div className="server-card">
        <h3>Play here</h3><p className="server-hint">Launch a matching client and join this server.</p>
        {client.instances.length > 0 ? <Select options={client.instances.map(item => ({ label: item.name, value: item.id }))} value={instance} set_value={setInstance} filterable={false} style={{ fontSize: 13, width: '100%' }}/> : <p className="server-hint">No client instance is installed yet.</p>}
        <div className="server-actions">
          <Button style={compact} label="Launch & join" disabled={busy || !running || !instance || !client.engine?.available || !client.engine?.accounts.length} onClick={() => act(() => api.join(selected, instance))}/>
          {!client.engine?.accounts.length ? <Button style={compact} label="Sign in to play" onClick={onLauncherSettings}/> : !client.instances.length && <Button style={compact} label="Install client pack" onClick={() => act(() => bridge.install())}/>}
        </div>
      </div>
      <div className="server-card server-backup"><div><h3>World backup</h3><p className="server-hint">Stop the server before saving a backup.</p></div><Button style={compact} label="Back up" disabled={busy || locked} onClick={() => act(async () => { const result = await api.backup(selected); onNotice(`Backup saved: ${result.path}`); })}/></div>
      {!api && <p className="server-preview-note">Browser preview · Settings are saved in the desktop app.</p>}
    </section>

    <section className="settings-panel server-settings-panel" hidden={section !== 'playit'} aria-label="playit settings">
      <div className="settings-section-heading"><h2>playit</h2><p>Optional public access for the live server.</p></div>
      <div className="server-card">
        <div className="server-card-heading"><h3>Agent</h3><span>{data.playit.status === 'running' ? 'Agent running' : data.playit.status}</span></div>
        <div className="server-actions">
          <Button style={compact} label="Start playit" disabled={busy || !liveRunning || !data.playit.binary || agentLocked} onClick={() => act(() => api.startPlayit())}/>
          <Button style={compact} label="Stop playit" disabled={busy || data.playit.status !== 'running'} onClick={() => act(() => api.stopPlayit())}/>
          {data.playit.claimUrl && <Button style={compact} label="Link account" onClick={() => act(() => api.linkPlayit())}/>}
        </div>
        {!liveRunning && <p className="server-hint">Start the live server before enabling public access.</p>}
        {data.playit.error && <p className="server-error">{data.playit.error}</p>}
        <p className="server-hint">Use the standalone playit 0.17.1 agent.</p>
        <p className="server-path" title={data.playit.binary}>{data.playit.binary || 'No agent selected'}</p>
        <div className="server-actions">
          <Button style={compact} label="Choose agent" disabled={busy || agentLocked} onClick={() => act(() => api.selectPlayit())}/>
          <Button style={compact} label="Download" onClick={() => act(() => api.downloadPlayit())}/>
        </div>
        <label className="server-public-address">Public address<input value={publicAddress} disabled={busy || agentLocked} placeholder="From your playit dashboard" onChange={event => setPublicAddress(event.target.value)}/></label>
        <p className="server-hint">Point a Minecraft Java tunnel to {data.profiles.find(item => item.id === 'live')?.address}.</p>
        <div className="server-actions">
          <Button style={compact} label="Save address" disabled={busy || agentLocked} onClick={() => act(() => api.configurePlayit({ publicAddress }), 'Public address saved.')}/>
          <Button style={compact} label="Dashboard ↗" onClick={() => act(() => api.playitDashboard())}/>
          {data.playit.publicAddress && <Button style={compact} label="Copy address" onClick={() => act(() => api.copyPublicAddress(), 'Public address copied.')}/>}
        </div>
        {agentLocked && <p className="server-hint">Stop the agent to change its settings.</p>}
      </div>
    </section>
  </>;
}

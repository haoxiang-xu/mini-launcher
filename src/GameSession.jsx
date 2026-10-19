import { RiMicrosoftFill, RiCheckLine, RiLoader4Line } from '@remixicon/react';
import { Button, Modal } from './mini.jsx';

export function AccountSettings({ engine, onSignIn, onSignOut }) {
  const account = engine.accounts?.[0];
  const working = ['login', 'install', 'launch', 'playing'].includes(engine.phase);
  return <div className="setting-row">
    <div className="setting-icon"><RiMicrosoftFill size={20}/></div>
    <div className="setting-main">
      <h2>Microsoft account</h2>
      <p>Sign in once. Mini takes care of preparing and starting your game.</p>
      <div className="account-status" role="status">
        {account ? <><RiCheckLine size={15}/><span>{account.name}</span></> : <span>{engine.phase === 'connecting' ? 'Preparing Mini…' : engine.available ? 'Ready when you are' : engine.phase === 'preview' ? 'Sign-in is available in the desktop app' : 'Game component unavailable'}</span>}
      </div>
      {account && !account.ownsMinecraft && <p>This account needs Minecraft Java Edition to play.</p>}
      {!account && <div className="setting-actions"><Button label="Sign in with Microsoft" disabled={!engine.available || !engine.loginConfigured || working} onClick={onSignIn}/></div>}
      {account && <div className="setting-actions"><Button label="Sign out" disabled={working} onClick={() => onSignOut(account.id)}/></div>}
      {!account && engine.available && !engine.loginConfigured && <p className="account-note">Microsoft sign-in is being configured for this build.</p>}
      {engine.error && <p className="failed" role="alert">{engine.error}</p>}
    </div>
  </div>;
}

export function EngineProgress({ engine, onCancel }) {
  if (!['install', 'launch', 'playing'].includes(engine.phase)) return null;
  const total = engine.progress?.total, current = engine.progress?.current;
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round(current / total * 100))) : undefined;
  const playing = engine.phase === 'playing';
  return <section className="game-progress" aria-label="Game progress" aria-live="polite">
    <div><span>{playing ? 'Minecraft is running' : engine.phase === 'install' ? 'Preparing your game' : 'Starting Minecraft'}</span>{!playing && <span>{percent !== undefined ? `${percent}%` : 'Just a moment…'}</span>}</div>
    {!playing && <progress aria-label="Game preparation" max="100" value={percent}/>}
    {!playing && <button onClick={onCancel}>Cancel</button>}
  </section>;
}

export function SignInModal({ engine, onOpenBrowser, onCancel }) {
  const authorization = engine.authorization;
  return <Modal open={engine.phase === 'login'} onClose={onCancel}
    style={{ padding: 0, width: 'min(400px, calc(100vw - 32px))', borderRadius: 16, backgroundColor: '#0c0c0c', border: '1px solid #ffffff26' }}
    overlayStyle={{ backgroundColor: '#00000099', backdropFilter: 'blur(8px)' }}>
    <section className="signin-dialog" role="dialog" aria-modal="true" aria-labelledby="signin-title">
      <RiMicrosoftFill size={28} aria-hidden="true"/>
      <h2 id="signin-title">Sign in to Mini</h2>
      {authorization ? <>
        <p>Open Microsoft's sign-in page, then enter this code if asked.</p>
        <div className="signin-code" aria-label="Microsoft sign-in code">{authorization.code}</div>
        <Button autoFocus label="Continue in browser" onClick={onOpenBrowser}/>
        <p className="signin-waiting"><RiLoader4Line size={15}/>Waiting for you to finish signing in…</p>
      </> : <p className="signin-waiting"><RiLoader4Line size={15}/>Preparing secure sign-in…</p>}
      <button className="signin-cancel" onClick={onCancel}>Cancel</button>
    </section>
  </Modal>;
}

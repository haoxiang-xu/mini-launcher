import { useCallback, useEffect, useState } from 'react';

const preview = {
  bundleReady: false, minecraft: '26.3', javaMajor: 25,
  playit: { status: 'stopped', binary: '', publicAddress: '', logs: [] },
  profiles: [
    { id: 'local-test', name: 'Local test', port: 25565 },
    { id: 'live', name: 'Live server', port: 25566 },
  ].map(profile => ({
    ...profile, address: `127.0.0.1:${profile.port}`,
    directory: 'Available in the desktop app', memoryMb: 4096, javaPath: '',
    status: 'stopped', prepared: false, eulaAccepted: false, logs: [],
  })),
};

export const serverLabels = {
  stopped: 'Stopped', preparing: 'Preparing', starting: 'Starting',
  running: 'Running', stopping: 'Saving & stopping', error: 'Needs attention',
  'backing-up': 'Backing up',
};
export const serverButtonStyle = {
  root: { fontSize: 13, paddingVertical: 7, paddingHorizontal: 12, lineHeight: '18px' },
  content: { children: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, lineHeight: '18px' } },
};

export default function useServer(bridge, enabled, onNotice) {
  const api = enabled ? bridge?.server : undefined;
  const [data, setData] = useState(preview);
  const [selected, setSelected] = useState('local-test');
  const [busy, setBusy] = useState(false);
  const profile = data.profiles.find(item => item.id === selected) || data.profiles[0];
  const locked = ['preparing', 'starting', 'running', 'stopping', 'backing-up'].includes(profile.status);
  const refresh = useCallback(async () => {
    if (api) setData(await api.status());
  }, [api]);

  useEffect(() => {
    if (!api) return;
    let active = true, pending = false;
    async function poll() {
      if (pending) return;
      pending = true;
      try {
        const next = await api.status();
        if (active) setData(next);
      } catch (error) {
        if (active) onNotice(error.message);
      } finally { pending = false; }
    }
    poll();
    const timer = setInterval(poll, 1000);
    return () => { active = false; clearInterval(timer); };
  }, [api, onNotice]);

  async function act(action, message) {
    if (!api) {
      onNotice('Open the server edition of the desktop app to use these controls.');
      return false;
    }
    setBusy(true);
    try {
      await action();
      if (message) onNotice(message);
      return true;
    } catch (error) {
      onNotice(error.message);
      return false;
    } finally {
      try { await refresh(); } catch (error) { onNotice(error.message); }
      setBusy(false);
    }
  }

  return { api, data, selected, setSelected, profile, locked, busy, act, running: profile.status === 'running' };
}

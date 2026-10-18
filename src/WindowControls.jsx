import { useEffect, useState } from "react";
import { Button, Tooltip } from "./mini.jsx";

function controlStyle(close) {
  return {
    root: {
      width: 40, height: 30, borderRadius: 3, border: "none",
      backgroundColor: "transparent", color: "#34412f", iconSize: 14,
      paddingVertical: 0, paddingHorizontal: 0,
      iconOnlyPaddingVertical: 0, iconOnlyPaddingHorizontal: 0,
      WebkitAppRegion: "no-drag",
    },
    background: {
      hoverBackgroundColor: close ? "rgba(229,57,53,0.92)" : "rgba(45,64,38,0.08)",
      activeBackgroundColor: close ? "rgba(210,48,43,0.95)" : "rgba(45,64,38,0.14)",
    },
    state: { hover: { root: { color: close ? "#fff" : "#263522" } } },
  };
}

export default function WindowControls({ api, onError }) {
  const [state, setState] = useState({ isMaximized: false, isFullScreen: false });

  useEffect(() => {
    if (!api) return;
    let active = true;
    const update = (next) => { if (active) setState(next); };
    const unsubscribe = api.onStateChange(update);
    api.getState().then(update).catch((error) => { if (active) onError(error.message); });
    return () => { active = false; unsubscribe(); };
  }, [api, onError]);

  if (!api || api.platform === "darwin") return null;

  const controls = [
    { id: "minimize", label: "Minimize", icon: "windows_minimize_button", action: api.minimize },
    { id: "maximize", label: state.isMaximized ? "Restore" : "Maximize", icon: state.isMaximized ? "windows_restore_button" : "windows_maximize_button", action: api.toggleMaximize },
    { id: "close", label: "Close window", icon: "windows_close_button", action: api.close, close: true },
  ];

  return <div className="window-controls" role="group" aria-label="Window controls">
    {controls.map(({ id, label, icon, action, close }) => (
      <Tooltip key={id} label={label} position="bottom" trigger={["hover", "focus"]}>
        <Button aria-label={label} prefix_icon={icon} style={controlStyle(close)}
          onClick={() => action().catch((error) => onError(error.message))} />
      </Tooltip>
    ))}
  </div>;
}

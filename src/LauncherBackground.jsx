import "./launcher-background.css";

// Keep this outside the keyed page content so navigation never restarts it.
export default function LauncherBackground() {
  return (
    <div className="launcher-background" aria-hidden="true">
      <div className="launcher-mesh launcher-mesh-primary" />
      <div className="launcher-mesh launcher-mesh-secondary" />
      <div className="launcher-background-shade" />
    </div>
  );
}

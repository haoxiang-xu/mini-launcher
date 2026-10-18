import './package-settings.css';

const packageNames = [
  ['fabric-api-', 'Fabric API'], ['fabric-language-kotlin-', 'Fabric Language Kotlin'],
  ['fzzy_config-', 'Fzzy Config'], ['iris-fabric-', 'Iris'], ['sodium-fabric-', 'Sodium'],
  ['particle_core-', 'Particle Core'], ['EC-Furniture-Blocks-', 'EC Furniture Blocks'],
  ['lithostitched-', 'Lithostitched'], ['modmenu-', 'Mod Menu'],
  ['Mona-Lisa-Painting-', 'Mona Lisa Painting'], ['PTS-Deco-', 'PTS Deco'],
  ['SkniroFurniture-', 'Skniro Furniture'], ['tectonic-', 'Tectonic'],
  ['YOHaku-Elevator-', 'Elevator'], ['YOHaku-Furniture-Manager-', 'Furniture Manager'],
  ['BSL_', 'BSL'], ['VibrantPBR-', 'VibrantPBR'],
];

function PackageList({ title, files }) {
  if (!files.length) return null;
  return <section className="package-group" aria-label={title}>
    <h3>{title}<span>{files.length}</span></h3>
    <ul className="package-list">
      {files.map(file => {
        const filename = file.path.split('/').at(-1);
        const name = packageNames.find(([prefix]) => filename.startsWith(prefix))?.[1] || filename;
        return <li key={file.path}>
          <div><strong>{name}</strong><small>{filename}</small></div>
          <span className="package-badge">{file.delivery === 'bundled' ? 'Bundled' : 'Download on install'}</span>
        </li>;
      })}
    </ul>
  </section>;
}

export default function PackageSettings({ pack, catalog, preview, hidden }) {
  const contents = pack.contents;
  const files = contents?.files || [];
  const collections = catalog?.components || [];
  return <section className="settings-panel package-settings" hidden={hidden} aria-label="Package settings">
    <div className="settings-section-heading"><h2>Packages</h2><p>Client pack contents.</p></div>
    <div className="package-overview">
      <div><strong>{files.length ? `${files.length} package files` : 'No package inventory'}</strong><span className="package-badge">{preview ? 'Preview' : pack.present ? 'Pack ready' : 'Pack unavailable'}</span></div>
      {contents && <p>Minecraft {contents.minecraft} · Fabric {contents.fabricLoader} · Java {contents.javaMajor}</p>}
      <p>{preview ? 'Build preview. Installation status is available in the desktop app.' : 'Files in the client pack; this is not a scan of an installed game.'}</p>
    </div>
    {!contents && <p className="package-note">Generate the client pack to see its complete file list.</p>}
    <PackageList title="Mods & dependencies" files={files.filter(file => file.path.startsWith('mods/'))}/>
    <PackageList title="Shaders & resource packs" files={files.filter(file => !file.path.startsWith('mods/'))}/>
    {files.some(file => file.path.startsWith('shaderpacks/')) && <p className="package-note">Shaders are off by default. The vanilla resource pack is selected on first launch.</p>}
    {collections.length > 0 && <section className="package-group" aria-label="Collections">
      <h3>Collections<span>{collections.length}</span></h3>
      <ul className="package-list">
        {collections.map(item => <li key={item.id}><div><strong>{item.name}</strong><small>{item.source}</small></div><span className="package-badge">{item.status === 'installed' ? 'In client pack' : item.status === 'model-only' ? 'Model preview' : 'Prototype'}</span></li>)}
      </ul>
    </section>}
  </section>;
}

const fs = require('node:fs');
const path = require('node:path');

function applyBackend(root) {
  function replace(file, before, after) {
    const target = path.join(root, file);
    const source = fs.readFileSync(target, 'utf8');
    if (source.includes(after)) return;
    if (source.split(before).length !== 2) throw new Error(`Pinned Prism source does not match: ${file}`);
    fs.writeFileSync(target, source.replace(before, after));
  }
  replace('launcher/CMakeLists.txt', '    Application.cpp\n', '    Application.cpp\n    MiniBackend.cpp\n');
  replace('launcher/main.cpp', '    // initialize Qt\n', `    // Modified by mini, 2026-10-18: this binary is exclusively a pipe service.
    // Reject accidental GUI/CLI invocation before constructing QApplication.
    bool backend = false, directory = false;
    for (int i = 1; i < argc; i++) {
        backend |= std::string(argv[i]) == "--mini-backend";
        directory |= std::string(argv[i]) == "--dir" && i + 1 < argc;
    }
    if (!backend || !directory) { std::cerr << "mini background service requires its parent launcher."; return 2; }
    qputenv("QT_QPA_PLATFORM", "offscreen");
    // initialize Qt
`);
  replace('launcher/CMakeLists.txt', '    set_target_properties(${Launcher_Name} PROPERTIES OUTPUT_NAME "${Launcher_APP_BINARY_NAME}")', '    if(APPLE)\n        set_target_properties(${Launcher_Name} PROPERTIES OUTPUT_NAME "${Launcher_Name}")\n    else()\n        set_target_properties(${Launcher_Name} PROPERTIES OUTPUT_NAME "${Launcher_APP_BINARY_NAME}")\n    endif()');
  replace('launcher/Application.cpp', '#include "ui/setupwizard/SetupWizard.h"', '#include "ui/setupwizard/SetupWizard.h"\n#include "MiniBackend.h"');
  replace('launcher/Application.cpp', '        qInstallMessageHandler(appDebugOutput);', '        if (arguments().contains("--mini-backend")) qInstallMessageHandler([](QtMsgType, const QMessageLogContext&, const QString&) {});\n        else qInstallMessageHandler(appDebugOutput);');
  replace('launcher/Application.cpp', '    QString nomigratePath = FS::PathCombine(currentData, name + "_nomigrate.txt");', '    if (arguments().contains("--mini-backend")) return true; // mini manages its own data, never prompt for migrations.\n    QString nomigratePath = FS::PathCombine(currentData, name + "_nomigrate.txt");');
  replace('launcher/Application.cpp', '{ "show-window", "Show the main launcher window (useful in combination with --launch)" },', '{ "show-window", "Show the main launcher window (useful in combination with --launch)" },\n          { "mini-backend", "Run the mini JSON pipe backend without launcher UI" },');
  replace('launcher/Application.cpp', '    detectLibraries();\n', '    detectLibraries();\n\n    if (arguments().contains("--mini-backend")) {\n        new MiniBackend(this);\n        return;\n    }\n');
  replace('launcher/Application.cpp', 'QString Application::getMSAClientID()\n{', 'QString Application::getMSAClientID()\n{\n    if (arguments().contains("--mini-backend")) return qEnvironmentVariable("MINI_MICROSOFT_CLIENT_ID");');
  replace('launcher/Application.cpp', 'void Application::showFatalErrorMessage(const QString& title, const QString& content)\n{', 'void Application::showFatalErrorMessage(const QString& title, const QString& content)\n{\n    // Modified by mini, 2026-10-18: startup failures must never wait on a dialog.\n    if (arguments().contains("--mini-backend")) { m_status = Application::Failed; return; }');
  // Cover unexpected paths such as "close after game" without constructing a
  // launcher window. The dedicated service bypasses LaunchController entirely.
  replace('launcher/Application.cpp', 'MainWindow* Application::showMainWindow(bool minimized)\n{', 'MainWindow* Application::showMainWindow(bool minimized)\n{\n    if (arguments().contains("--mini-backend")) return nullptr;');
  replace('launcher/modplatform/modrinth/ModrinthInstanceCreationTask.cpp', '                if (showOptionalDialog) {', '                if (showOptionalDialog && !APPLICATION->arguments().contains("--mini-backend")) {');
  // Empty packs/tasks may finish synchronously before exec() starts. Entering
  // a nested loop afterwards would wait forever with no remaining completion.
  replace('launcher/modplatform/modrinth/ModrinthInstanceCreationTask.cpp', '    loop.exec();\n\n    if (!endedWell)', '    if (downloadMods->isRunning()) loop.exec();\n\n    if (!endedWell)');
  replace('launcher/modplatform/modrinth/ModrinthInstanceCreationTask.cpp', '    ensureMetaLoop.exec();', '    if (ensureMetadataTask->isRunning()) ensureMetaLoop.exec();');
  replace('launcher/InstanceCreationTask.cpp', '#include "InstanceCreationTask.h"', '#include "InstanceCreationTask.h"\n#include "Application.h"');
  // Import installs the modpack. The normal launch task performs all official
  // game/runtime downloads and validation afterwards, under Mini's launch flow.
  replace('launcher/InstanceCreationTask.cpp', '    if (!m_abort) {', '    if (APPLICATION->arguments().contains("--mini-backend") && !m_abort) {\n        emitSucceeded();\n        return;\n    }\n    if (!m_abort) {');
  replace('program_info/CMakeLists.txt', 'set(Launcher_DisplayName "Prism Launcher")', 'set(Launcher_DisplayName "mini Background Engine")');
  replace('program_info/CMakeLists.txt', 'set(Launcher_CommonName "PrismLauncher")', 'set(Launcher_CommonName "MiniBackend")');
  replace('program_info/CMakeLists.txt', 'set(Launcher_AppID "org.prismlauncher.PrismLauncher")', 'set(Launcher_AppID "studio.mini.minecraftengine")');
  // Upstream artwork/resource filenames must keep resolving after renaming.
  for (const [from, to] of [['PrismLauncher.icon', 'MiniBackend.icon'], ['org.prismlauncher.PrismLauncher.svg', 'studio.mini.minecraftengine.svg'], ['org.prismlauncher.PrismLauncher.desktop.in', 'studio.mini.minecraftengine.desktop.in'], ['org.prismlauncher.PrismLauncher.metainfo.xml.in', 'studio.mini.minecraftengine.metainfo.xml.in'], ['org.prismlauncher.PrismLauncher.mime.xml', 'studio.mini.minecraftengine.mime.xml']]) {
    const source = path.join(root, 'program_info', from), target = path.join(root, 'program_info', to);
    if (fs.existsSync(source) && !fs.existsSync(target)) fs.cpSync(source, target, { recursive: true });
  }
  for (const file of ['MiniBackend.cpp', 'MiniBackend.h']) {
    const source = path.join(__dirname, file), target = path.join(root, 'launcher', file);
    if (!fs.existsSync(target) || !fs.readFileSync(source).equals(fs.readFileSync(target))) fs.copyFileSync(source, target);
  }
}
module.exports = { applyBackend };

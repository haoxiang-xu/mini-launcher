// SPDX-License-Identifier: GPL-3.0-only
// mini backend adaptation of Prism Launcher; not affiliated with Prism Launcher.
#include "MiniBackend.h"
#include "Application.h"
#include "InstanceList.h"
#include "InstanceImportTask.h"
#include "BaseInstance.h"
#include "launch/LaunchTask.h"
#include "minecraft/auth/AccountList.h"
#include "settings/SettingsObject.h"
#include <QJsonArray>
#include <QJsonDocument>
#include <QFile>
#include <QFileInfo>
#include <QDialog>
#include <QEvent>
#include <QTimer>
#include <QUrl>
#include <cstdio>
#include <functional>
#include <iostream>
#include <thread>
#include <csignal>
#include <QRegularExpression>

MiniBackend::MiniBackend(QObject* parent) : QObject(parent) {
#ifndef Q_OS_WIN
    std::signal(SIGPIPE, SIG_IGN);
#endif
    // Upstream debug logs can include authentication responses. The pipe only
    // carries the deliberately selected protocol fields below; never raw logs.
    qInstallMessageHandler([](QtMsgType, const QMessageLogContext&, const QString&) {});
    APPLICATION->setQuitOnLastWindowClosed(false);
    APPLICATION->installEventFilter(this);
    auto settings = APPLICATION->settings();
    settings->set("AutomaticJavaDownload", true);
    settings->set("AutomaticJavaSwitch", true);
    settings->set("IgnoreJavaWizard", true);
    settings->set("ShowConsole", false);
    settings->set("CloseAfterLaunch", false);
    send({{"event", "ready"}, {"protocol", 1}, {"backend", "mini-prism"}});
    std::thread([this] {
        std::string line;
        while (std::getline(std::cin, line)) {
            if (line.size() > 65536) { QMetaObject::invokeMethod(APPLICATION, [] { QCoreApplication::exit(2); }, Qt::QueuedConnection); return; }
            const auto request = QJsonDocument::fromJson(QByteArray::fromStdString(line)).object();
            QMetaObject::invokeMethod(this, [this, request] { receive(request); }, Qt::QueuedConnection);
        }
        QMetaObject::invokeMethod(this, [this] {
            parentDisconnected = true;
            if (qobject_cast<LaunchTask*>(active.data())) {
                connect(active, &Task::finished, APPLICATION, &QCoreApplication::quit);
            } else {
                if (active) active->abort();
                QCoreApplication::quit();
            }
        }, Qt::QueuedConnection);
    }).detach();
}

bool MiniBackend::eventFilter(QObject* object, QEvent* event) {
    // Fail closed if an upstream path still requests a dialog. Normal backend
    // operations construct no widgets. The offscreen Qt platform is an extra
    // guard, not a way to leave a modal dialog silently waiting for input.
    if (event->type() == QEvent::Show) {
        if (auto dialog = qobject_cast<QDialog*>(object)) {
            send({{"event", "interaction-required"}, {"id", busy}});
            QTimer::singleShot(0, dialog, &QDialog::reject);
        }
    }
    return QObject::eventFilter(object, event);
}

void MiniBackend::send(QJsonObject message) {
    if (parentDisconnected) return;
    const auto bytes = QJsonDocument(message).toJson(QJsonDocument::Compact);
    std::fwrite(bytes.constData(), 1, bytes.size(), stdout);
    std::fputc('\n', stdout); std::fflush(stdout);
}
void MiniBackend::reply(QString id, QJsonObject result) { send({{"id", id}, {"result", result}}); }
void MiniBackend::fail(QString id, QString code, QString message) { send({{"id", id}, {"error", QJsonObject{{"code", code}, {"message", message}}}}); }

QJsonObject MiniBackend::snapshot() {
    QJsonArray accounts, instances;
    for (int i = 0; i < APPLICATION->accounts()->count(); i++) {
        const auto account = APPLICATION->accounts()->at(i);
        accounts.append(QJsonObject{{"id", account->profileId()}, {"name", account->profileName()}, {"ownsMinecraft", account->ownsMinecraft()}});
    }
    for (int i = 0; i < APPLICATION->instances()->count(); i++) {
        const auto instance = APPLICATION->instances()->at(i);
        instances.append(QJsonObject{{"id", instance->id()}, {"name", instance->name()}});
    }
    return {{"accounts", accounts}, {"instances", instances}, {"loginConfigured", !qEnvironmentVariable("MINI_MICROSOFT_CLIENT_ID").isEmpty()}, {"busy", !busy.isEmpty()}};
}

void MiniBackend::watch(Task* task, QString id, QString action, std::function<void()> success) {
    active = task; busy = id;
    connect(task, &Task::progress, this, [this, id, action](qint64 current, qint64 total) {
        send({{"event", "progress"}, {"id", id}, {"action", action}, {"current", double(current)}, {"total", double(total)}});
    });
    connect(task, &Task::succeeded, this, [this, success] { active = nullptr; busy.clear(); success(); });
    connect(task, &Task::failed, this, [this, id, action](const QString&) {
        active = nullptr; busy.clear();
        fail(id, action == "login" ? "LOGIN_FAILED" : "TASK_FAILED", action == "login" ? "Microsoft sign-in did not complete. Please try again." : "The operation failed. Check your connection and game files, then retry.");
    });
    connect(task, &Task::aborted, this, [this, id] { active = nullptr; busy.clear(); fail(id, "CANCELLED", "Operation cancelled."); });
    task->start();
}

void MiniBackend::launch(QString id, QJsonObject params, MinecraftAccountPtr account) {
    if (!account->ownsMinecraft() || !account->hasProfile()) { fail(id, "OWNERSHIP_REQUIRED", "A Microsoft account with a Minecraft Java profile is required."); return; }
    auto instance = APPLICATION->instances()->getInstanceById(params.value("instanceId").toString());
    if (!instance) { fail(id, "INSTANCE_MISSING", "The game instance is not installed."); return; }
    auto session = std::make_shared<AuthSession>();
    session->launchMode = LaunchMode::Normal;
    account->fillSession(session);
    MinecraftTarget::Ptr target;
    const auto address = params.value("serverAddress").toString();
    if (!address.isEmpty()) {
        if (!QRegularExpression("^[A-Za-z0-9.-]+:[0-9]{1,5}$").match(address).hasMatch() || address.section(':', -1).toInt() > 65535 || address.section(':', -1).toInt() < 1) {
            fail(id, "INVALID_SERVER", "Invalid server address."); return;
        }
        target.reset(new MinecraftTarget(MinecraftTarget::parse(address, false)));
    }
    auto task = instance->createLaunchTask(session, target);
    if (!task) { fail(id, "LAUNCH_FAILED", "Could not prepare the game."); return; }
    connect(task, &LaunchTask::readyForLaunch, task, &LaunchTask::proceed);
    auto running = new QTimer(task);
    running->setInterval(100);
    connect(running, &QTimer::timeout, this, [this, task, running, id] {
        if (task->pid() > 0) { send({{"event", "running"}, {"id", id}}); running->stop(); }
    });
    running->start();
    connect(task, &LaunchTask::requestProgress, this, [this, id](Task* step) {
        connect(step, &Task::progress, this, [this, id](qint64 current, qint64 total) { send({{"event", "progress"}, {"id", id}, {"action", "launch"}, {"current", double(current)}, {"total", double(total)}}); });
    });
    // The instance owns this task through its unique_ptr launch process.
    // Stop our observer on completion; deleting the task would double-free it.
    connect(task, &Task::finished, running, &QTimer::stop);
    watch(task, id, "launch", [this, id] { reply(id, snapshot()); });
}

void MiniBackend::receive(QJsonObject request) {
    const auto id = request.value("id").toString();
    const auto method = request.value("method").toString();
    const auto params = request.value("params").toObject();
    if (id.isEmpty()) { fail(id, "INVALID_REQUEST", "Missing request ID."); return; }
    if (method == "status") { reply(id, snapshot()); return; }
    if (method == "cancel") {
        const bool stopped = active && active->abort();
        reply(id, {{"cancelled", stopped}}); return;
    }
    if (method == "shutdown") {
        if (!busy.isEmpty()) { fail(id, "BUSY", "Finish the current operation first."); return; }
        reply(id, {{"ok", true}}); QCoreApplication::quit(); return;
    }
    if (!busy.isEmpty()) { fail(id, "BUSY", "Another operation is running."); return; }
    if (method == "auth.logout") {
        auto accounts = APPLICATION->accounts();
        const auto index = accounts->findAccountByProfileId(params.value("accountId").toString());
        if (index < 0) { fail(id, "ACCOUNT_MISSING", "This account is no longer signed in."); return; }
        accounts->removeAccount(accounts->index(index, 0)); accounts->saveList();
        QFile::setPermissions("accounts.json", QFileDevice::ReadOwner | QFileDevice::WriteOwner);
        reply(id, snapshot()); return;
    }
    if (method == "auth.login") {
        if (qEnvironmentVariable("MINI_MICROSOFT_CLIENT_ID").isEmpty()) { fail(id, "CLIENT_ID_REQUIRED", "Microsoft sign-in is not configured for this build yet."); return; }
        loginAccount = MinecraftAccount::createBlankMSA();
        auth = loginAccount->login(true);
        connect(auth.get(), &AuthFlow::authorizeWithBrowserWithExtra, this, [this, id](QString url, QString code, int expiresIn) {
            send({{"event", "authorize"}, {"id", id}, {"url", url}, {"code", code}, {"expiresIn", expiresIn}});
        });
        watch(auth.get(), id, "login", [this, id] {
            auto accounts = APPLICATION->accounts();
            accounts->addAccount(loginAccount); accounts->setDefaultAccount(loginAccount); accounts->saveList();
            QFile::setPermissions("accounts.json", QFileDevice::ReadOwner | QFileDevice::WriteOwner);
            reply(id, snapshot());
        }); return;
    }
    if (method == "instance.import") {
        const auto file = params.value("path").toString();
        if (!QFileInfo(file).isAbsolute() || !QFileInfo(file).isFile() || !file.endsWith(".mrpack")) { fail(id, "PACK_MISSING", "The modpack is not ready yet."); return; }
        auto import = new InstanceImportTask(QUrl::fromLocalFile(file), true);
        import->setName("mini"); import->setConfirmUpdate(false);
        auto task = APPLICATION->instances()->wrapInstanceTask(import);
        connect(task, &Task::finished, task, &QObject::deleteLater);
        watch(task, id, "install", [this, id] { APPLICATION->instances()->loadList(); reply(id, snapshot()); }); return;
    }
    if (method == "instance.launch") {
        const auto accountId = params.value("accountId").toString();
        const auto index = APPLICATION->accounts()->findAccountByProfileId(accountId);
        if (index < 0) { fail(id, "LOGIN_REQUIRED", "Sign in with Microsoft to play."); return; }
        const auto account = APPLICATION->accounts()->at(index);
        auth = account->refresh();
        watch(auth.get(), id, "login", [this, id, params, account] { launch(id, params, account); }); return;
    }
    fail(id, "UNKNOWN_METHOD", "Unsupported operation.");
}

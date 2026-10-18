// SPDX-License-Identifier: GPL-3.0-only
// mini backend adaptation of Prism Launcher; not affiliated with Prism Launcher.
#pragma once
#include <QObject>
#include <QJsonObject>
#include <QPointer>
#include <functional>
#include "minecraft/auth/MinecraftAccount.h"
class Task;

class MiniBackend : public QObject {
 public:
  explicit MiniBackend(QObject* parent);
  bool eventFilter(QObject* object, QEvent* event) override;
 private:
  void receive(QJsonObject request);
  void send(QJsonObject message);
  void reply(QString id, QJsonObject result);
  void fail(QString id, QString code, QString message);
  QJsonObject snapshot();
  void watch(Task* task, QString id, QString action, std::function<void()> success);
  void launch(QString id, QJsonObject params, MinecraftAccountPtr account);
  QString busy;
  QPointer<Task> active;
  MinecraftAccountPtr loginAccount;
  shared_qobject_ptr<AuthFlow> auth;
  bool parentDisconnected = false;
};

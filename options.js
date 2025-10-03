document.addEventListener('DOMContentLoaded', () => {
  const saveSettingsButton = document.getElementById('saveSettings');

  loadSettings();
  saveSettingsButton.addEventListener('click', saveSettings);

  updateAllInfo().catch((error) => console.error('刷新快照信息失败:', error));
});

async function loadSettings() {
  if (!window.TabVaultDB) {
    return;
  }
  try {
    const settings = await TabVaultDB.getSettings();
    document.getElementById('autoSaveInterval').value = settings.autoSaveInterval;
    document.getElementById('maxAutoSnapshots').value = Math.max(settings.maxAutoSnapshots ?? TabVaultDB.DEFAULT_SETTINGS.maxAutoSnapshots, 0);
  } catch (error) {
    console.error('加载设置失败:', error);
  }
}

async function saveSettings() {
  if (!window.TabVaultDB) {
    return;
  }

  const parsedInterval = parseInt(document.getElementById('autoSaveInterval').value, 10);
  const parsedLimit = parseInt(document.getElementById('maxAutoSnapshots').value, 10);

  const settings = {
    autoSaveInterval: Number.isFinite(parsedInterval) ? parsedInterval : TabVaultDB.DEFAULT_SETTINGS.autoSaveInterval,
    maxAutoSnapshots: Number.isFinite(parsedLimit) ? Math.max(parsedLimit, 0) : TabVaultDB.DEFAULT_SETTINGS.maxAutoSnapshots
  };

  try {
    const merged = await TabVaultDB.saveSettings(settings);
    chrome.runtime.sendMessage({ action: 'updateSettings', settings: merged }, () => {});
    createCustomDialog('设置已保存', () => {}, false);
  } catch (error) {
    handleError('保存设置失败', error);
  }
}

function restoreSnapshot(snapshotId) {
  withSnapshot(snapshotId, (snapshot) => {
    createCustomDialog(
      `确定要恢复此快照吗？当前的标签页将被关闭。\n名称：${snapshot.name}\n时间：${formatDate(snapshot.date)}`,
      () => chrome.runtime.sendMessage({ action: 'restoreSnapshot', snapshotId }),
      true,
      false
    );
  });
}

function renameSnapshot(snapshotId) {
  withSnapshot(snapshotId, (snapshot) => {
    createCustomDialog(
      `请输入新的快照名称：\n当前名称：${snapshot.name}\n时间：${formatDate(snapshot.date)}`,
      (newName) => {
        if (!newName) {
          return;
        }
        (async () => {
          const updated = { ...snapshot, name: newName };
          await TabVaultDB.replaceSnapshot(updated);
          await updateAllInfo();
          chrome.runtime.sendMessage({ action: 'snapshotsUpdated' }, () => {});
        })().catch((error) => handleError('重命名快照失败', error));
      },
      true,
      true
    );
  });
}

function deleteSnapshot(snapshotId) {
  withSnapshot(snapshotId, (snapshot) => {
    createCustomDialog(
      `确定要删除此快照吗？该操作无法撤销。\n名称：${snapshot.name}\n时间：${formatDate(snapshot.date)}`,
      () => {
        (async () => {
          await TabVaultDB.deleteSnapshot(snapshotId);
          await updateAllInfo();
          chrome.runtime.sendMessage({ action: 'snapshotsUpdated' }, () => {});
        })().catch((error) => handleError('删除快照失败', error));
      }
    );
  });
}

async function saveSnapshot(snapshot) {
  if (!window.TabVaultDB) {
    return;
  }
  try {
    const settings = await TabVaultDB.getSettings();
    const allowedAutoSnapshots = Math.max(
      Number.isFinite(settings.maxAutoSnapshots) ? settings.maxAutoSnapshots : TabVaultDB.DEFAULT_SETTINGS.maxAutoSnapshots,
      0
    );
    let trimmedAutoSnapshots = 0;

    await TabVaultDB.updateSnapshots((existing) => {
      const list = Array.isArray(existing) ? existing.slice() : [];
      list.unshift(snapshot);

      if (!TabVaultDB.isAutoSnapshotName(snapshot.name)) {
        return list;
      }

      let remaining = allowedAutoSnapshots;
      return list.filter((item) => {
        if (!TabVaultDB.isAutoSnapshotName(item.name)) {
          return true;
        }
        if (remaining > 0) {
          remaining -= 1;
          return true;
        }
        trimmedAutoSnapshots += 1;
        return false;
      });
    });

    if (trimmedAutoSnapshots > 0) {
      console.log(`移除了 ${trimmedAutoSnapshots} 个超出的自动快照。`);
    }

    await updateAllInfo();
    chrome.runtime.sendMessage({ action: 'snapshotsUpdated' }, () => {});
  } catch (error) {
    handleError('保存快照失败', error);
  }
}

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'snapshotsUpdated' || request.action === 'refreshSnapshots') {
    updateAllInfo().catch((error) => console.error('刷新快照信息失败:', error));
  }
});

function handleError(message, error) {
  console.error(message + ':', error);
  createCustomDialog(`${message}，请稍后再试`, () => {}, false);
}

async function withSnapshot(snapshotId, handler) {
  if (!window.TabVaultDB) {
    return;
  }
  try {
    const snapshot = await TabVaultDB.getSnapshotById(snapshotId);
    if (!snapshot) {
      createCustomDialog('未找到对应的快照', () => {}, false);
      return;
    }
    await handler(snapshot);
  } catch (error) {
    handleError('读取快照失败', error);
  }
}

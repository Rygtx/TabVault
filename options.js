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
    document.getElementById('maxAutoSnapshots').value = settings.maxAutoSnapshots;
  } catch (error) {
    console.error('加载设置失败:', error);
  }
}

async function saveSettings() {
  if (!window.TabVaultDB) {
    return;
  }

  const parsedAuto = parseInt(document.getElementById('autoSaveInterval').value, 10);
  const parsedMax = parseInt(document.getElementById('maxAutoSnapshots').value, 10);

  const settings = {
    autoSaveInterval: Number.isFinite(parsedAuto) ? parsedAuto : TabVaultDB.DEFAULT_SETTINGS.autoSaveInterval,
    maxAutoSnapshots: Number.isFinite(parsedMax) ? parsedMax : TabVaultDB.DEFAULT_SETTINGS.maxAutoSnapshots
  };

  try {
    const merged = await TabVaultDB.saveSettings(settings);
    chrome.runtime.sendMessage({ action: 'updateSettings', settings: merged }, () => {});
    createCustomDialog('设置已保存', () => {}, false);
  } catch (error) {
    console.error('保存设置失败:', error);
    createCustomDialog('保存设置时出错，请重试', () => {}, false);
  }
}

function restoreSnapshot(snapshotId) {
  if (!window.TabVaultDB) {
    return;
  }
  TabVaultDB.getSnapshotById(snapshotId)
    .then((snapshot) => {
      if (!snapshot) {
        createCustomDialog('未找到对应的快照', () => {}, false);
        return;
      }
      createCustomDialog(
        `确定要恢复此快照吗？当前的标签页将被关闭。\n名称：${snapshot.name}\n时间：${formatDate(snapshot.date)}`,
        () => chrome.runtime.sendMessage({ action: 'restoreSnapshot', snapshotId }),
        true,
        false
      );
    })
    .catch((error) => {
      console.error('读取快照失败:', error);
      createCustomDialog('读取快照失败，请稍后再试', () => {}, false);
    });
}

function renameSnapshot(snapshotId) {
  if (!window.TabVaultDB) {
    return;
  }
  TabVaultDB.getSnapshotById(snapshotId)
    .then((snapshot) => {
      if (!snapshot) {
        createCustomDialog('未找到对应的快照', () => {}, false);
        return;
      }
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
          })().catch((error) => {
            console.error('重命名快照失败:', error);
            createCustomDialog('重命名失败，请重试', () => {}, false);
          });
        },
        true,
        true
      );
    })
    .catch((error) => {
      console.error('读取快照失败:', error);
      createCustomDialog('读取快照失败，请稍后再试', () => {}, false);
    });
}

function deleteSnapshot(snapshotId) {
  if (!window.TabVaultDB) {
    return;
  }
  TabVaultDB.getSnapshotById(snapshotId)
    .then((snapshot) => {
      if (!snapshot) {
        createCustomDialog('未找到对应的快照', () => {}, false);
        return;
      }
      createCustomDialog(
        `确定要删除此快照吗？该操作无法撤销。\n名称：${snapshot.name}\n时间：${formatDate(snapshot.date)}`,
        () => {
          (async () => {
            await TabVaultDB.deleteSnapshot(snapshotId);
            await updateAllInfo();
            chrome.runtime.sendMessage({ action: 'snapshotsUpdated' }, () => {});
          })().catch((error) => {
            console.error('删除快照失败:', error);
            createCustomDialog('删除失败，请重试', () => {}, false);
          });
        }
      );
    })
    .catch((error) => {
      console.error('读取快照失败:', error);
      createCustomDialog('读取快照失败，请稍后再试', () => {}, false);
    });
}

async function saveSnapshot(snapshot) {
  if (!window.TabVaultDB) {
    return;
  }
  try {
    const settings = await TabVaultDB.getSettings();
    const snapshots = await TabVaultDB.getSnapshots();
    const autoSnapshots = snapshots.filter((s) => TabVaultDB.isAutoSnapshotName(s.name));
    if (TabVaultDB.isAutoSnapshotName(snapshot.name) && autoSnapshots.length >= settings.maxAutoSnapshots) {
      console.log('已达到自动快照数量上限，无法继续保存。');
      return;
    }
    await TabVaultDB.addSnapshot(snapshot);
    await updateAllInfo();
    chrome.runtime.sendMessage({ action: 'snapshotsUpdated' }, () => {});
  } catch (error) {
    console.error('保存快照失败:', error);
    createCustomDialog('保存快照失败，请稍后重试', () => {}, false);
  }
}

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'snapshotsUpdated' || request.action === 'refreshSnapshots') {
    updateAllInfo().catch((error) => console.error('刷新快照信息失败:', error));
  }
});



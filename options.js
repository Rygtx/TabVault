document.addEventListener('DOMContentLoaded', function() {
  const autoSaveIntervalInput = document.getElementById('autoSaveInterval');
  const maxAutoSnapshotsInput = document.getElementById('maxAutoSnapshots');
  const saveSettingsButton = document.getElementById('saveSettings');

  loadSettings();
  saveSettingsButton.addEventListener('click', saveSettings);

  // 使用共用函数更新所有信息
  updateAllInfo();
});

function loadSettings() {
  chrome.storage.local.get(['settings'], (result) => {
    const settings = result.settings || { autoSaveInterval: 31, maxAutoSnapshots: 86 };
    document.getElementById('autoSaveInterval').value = settings.autoSaveInterval;
    document.getElementById('maxAutoSnapshots').value = settings.maxAutoSnapshots;
  });
}

function saveSettings() {
  const settings = {
    autoSaveInterval: parseInt(document.getElementById('autoSaveInterval').value),
    maxAutoSnapshots: parseInt(document.getElementById('maxAutoSnapshots').value)
  };

  console.log("Saving settings:", settings);

  chrome.storage.local.set({settings: settings}, () => {
    chrome.runtime.sendMessage({action: "updateSettings", settings: settings}, (response) => {
      console.log("Settings update response:", response);
    });
    createCustomDialog(
      "设置已保存",
      () => {},
      false // 不显示取消按钮
    );
  });
}

function restoreSnapshot(snapshotId) {
  chrome.storage.local.get(['snapshots'], (result) => {
    const snapshot = result.snapshots.find(s => s.id === snapshotId);
    if (snapshot) {
      createCustomDialog(
        `确定要恢复这个快照吗？当前的标签页将被关闭。\n快照名称：${snapshot.name}\n日期：${formatDate(snapshot.date)}`,
        () => chrome.runtime.sendMessage({action: "restoreSnapshot", snapshotId: snapshotId})
      );
    }
  });
}

function renameSnapshot(snapshotId) {
  chrome.storage.local.get(['snapshots'], (result) => {
    const snapshot = result.snapshots.find(s => s.id === snapshotId);
    if (snapshot) {
      createCustomDialog(
        `请输入新的快照名称：\n当前名称：${snapshot.name}\n日期：${formatDate(snapshot.date)}`,
        (newName) => {
          if (newName) {
            const updatedSnapshots = result.snapshots.map(s => 
              s.id === snapshotId ? {...s, name: newName} : s
            );
            chrome.storage.local.set({snapshots: updatedSnapshots}, () => {
              loadSnapshotList();
              // 发送消息通知其他页面更新
              chrome.runtime.sendMessage({action: "snapshotsUpdated"});
            });
          }
        },
        true,
        true
      );
    }
  });
}

function deleteSnapshot(snapshotId) {
  chrome.storage.local.get(['snapshots'], (result) => {
    const snapshot = result.snapshots.find(s => s.id === snapshotId);
    if (snapshot) {
      createCustomDialog(
        `确定要删除这个快照吗？此操作不可撤销。\n快照名称：${snapshot.name}\n日期：${formatDate(snapshot.date)}`,
        () => {
          const updatedSnapshots = result.snapshots.filter(s => s.id !== snapshotId);
          chrome.storage.local.set({snapshots: updatedSnapshots}, () => {
            updateAllInfo(); // 使用共用函数更新所有信息
            // 发送消息通知其他页面更新
            chrome.runtime.sendMessage({action: "snapshotsUpdated"});
          });
        }
      );
    }
  });
}

function saveSnapshot(snapshot) {
  chrome.storage.local.get(['snapshots', 'settings'], (result) => {
    const snapshots = result.snapshots || [];
    const settings = result.settings || { maxAutoSnapshots: 86 };

    // 检查是否超过最大自动快照数量
    const autoSnapshots = snapshots.filter(s => s.name === "自动保存");
    if (autoSnapshots.length >= settings.maxAutoSnapshots) {
      console.log("已达到最大自动快照数量，无法保存新的自动快照。");
      return;
    }

    // 添加新的快照
    snapshots.push(snapshot);
    chrome.storage.local.set({ snapshots: snapshots }, () => {
      console.log("快照已保存。");
      updateStorageUsage();
      updateSnapshotCounts();
      loadSnapshotList();
      chrome.runtime.sendMessage({ action: "snapshotsUpdated" });
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "snapshotsUpdated" || request.action === "refreshSnapshots") {
    updateAllInfo(); // 使用共用函数更新所有信息
  }
});
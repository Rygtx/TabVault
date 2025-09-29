document.addEventListener('DOMContentLoaded', () => {
  const saveButton = document.getElementById('saveButton');
  const restoreButton = document.getElementById('restoreButton');
  const exportButton = document.getElementById('exportButton');
  const settingsButton = document.getElementById('settingsButton');

  saveButton.addEventListener('click', saveCurrentTabs);
  restoreButton.addEventListener('click', restoreLatestSnapshot);
  exportButton.addEventListener('click', exportBookmarks);
  settingsButton.addEventListener('click', openSettings);

  updateAllInfo(true).catch((error) => console.error('刷新快照信息失败:', error));
});

function saveCurrentTabs() {
  chrome.runtime.sendMessage({ action: 'manualSave' }, (response) => {
    if (chrome.runtime.lastError) {
      handleError('保存标签页失败', chrome.runtime.lastError);
      return;
    }
    console.log('保存响应:', response);
    updateAllInfo(true).catch((error) => console.error('刷新快照信息失败:', error));
    createCustomDialog('快照已保存', () => {
      updateAllInfo(true).catch((error) => console.error('刷新快照信息失败:', error));
    }, false);
  });
}

function restoreLatestSnapshot() {
  withSnapshots((snapshots) => {
    if (!snapshots.length) {
      createCustomDialog('没有可用的快照', () => {}, false);
      return;
    }
    const latest = snapshots[0];
    createCustomDialog(
      `确定要恢复最新快照吗？\n时间：${formatDate(latest.date)}`,
      () => chrome.runtime.sendMessage({ action: 'restoreSnapshot', snapshotId: latest.id }),
      true,
      false
    );
  });
}

function exportBookmarks() {
  withSnapshots((snapshots) => {
    if (!snapshots.length) {
      createCustomDialog('没有可导出的快照', () => {}, false);
      return;
    }

    const lines = [];
    snapshots.forEach((snapshot) => {
      lines.push(`<DT><H3>${snapshot.name} (${formatDate(snapshot.date)})</H3>`);
      lines.push('<DL><p>');
      if (Array.isArray(snapshot.windows)) {
        snapshot.windows.forEach((window, windowIndex) => {
          lines.push(`<DT><H3>窗口 ${windowIndex + 1}</H3>`);
          lines.push('<DL><p>');
          if (Array.isArray(window.tabs)) {
            window.tabs.forEach((tab) => {
              lines.push(`<DT><A HREF="${tab.url}">${tab.title}</A>`);
            });
          }
          lines.push('</DL><p>');
        });
      }
      lines.push('</DL><p>');
    });

    const bookmarkStr = lines.join('\n');
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n      <META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n      <TITLE>Bookmarks</TITLE>\n      <H1>Bookmarks</H1>\n      <DL><p>\n      ${bookmarkStr}\n      </DL><p>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url,
      filename: 'tabvault_bookmarks.html'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        handleError('导出失败', chrome.runtime.lastError);
      } else {
        console.log('Download started with ID:', downloadId);
        createCustomDialog('书签已导出', () => {}, false);
      }
    });
  });
}

function openSettings() {
  chrome.runtime.openOptionsPage();
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
          await updateAllInfo(true);
          notifySnapshotsUpdated();
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
          await updateAllInfo(true);
          notifySnapshotsUpdated();
        })().catch((error) => handleError('删除快照失败', error));
      }
    );
  });
}

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'refreshSnapshots') {
    updateAllInfo(true).catch((error) => console.error('刷新快照信息失败:', error));
  }
});

function notifySnapshotsUpdated() {
  chrome.runtime.sendMessage({ action: 'snapshotsUpdated' }, () => {});
}

function handleError(message, error) {
  console.error(message + ':', error);
  createCustomDialog(`${message}，请稍后再试`, () => {}, false);
}

async function withSnapshots(handler) {
  if (!window.TabVaultDB) {
    return;
  }
  try {
    const snapshots = await TabVaultDB.getSnapshots();
    await handler(Array.isArray(snapshots) ? snapshots : []);
  } catch (error) {
    handleError('读取快照失败', error);
  }
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

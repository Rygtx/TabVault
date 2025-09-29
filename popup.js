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
      console.error('保存标签页时出错:', chrome.runtime.lastError);
      createCustomDialog('保存失败，请稍后再试', () => {}, false);
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
  if (!window.TabVaultDB) {
    return;
  }
  TabVaultDB.getSnapshots()
    .then((snapshots) => {
      if (snapshots && snapshots.length > 0) {
        const latest = snapshots[0];
        createCustomDialog(
          `确定要恢复最新快照吗？\n时间：${formatDate(latest.date)}`,
          () => chrome.runtime.sendMessage({ action: 'restoreSnapshot', snapshotId: latest.id }),
          true,
          false
        );
      } else {
        createCustomDialog('没有可用的快照', () => {}, false);
      }
    })
    .catch((error) => {
      console.error('读取快照失败:', error);
      createCustomDialog('读取快照失败，请稍后再试', () => {}, false);
    });
}

function exportBookmarks() {
  if (!window.TabVaultDB) {
    return;
  }
  TabVaultDB.getSnapshots()
    .then((snapshots) => {
      if (!snapshots || snapshots.length === 0) {
        createCustomDialog('没有可导出的快照', () => {}, false);
        return;
      }

      let bookmarkStr = '';
      snapshots.forEach((snapshot) => {
        bookmarkStr += `<DT><H3>${snapshot.name} (${formatDate(snapshot.date)})</H3>\n<DL><p>\n`;
        if (snapshot.windows && Array.isArray(snapshot.windows)) {
          snapshot.windows.forEach((window, windowIndex) => {
            bookmarkStr += `<DT><H3>窗口 ${windowIndex + 1}</H3>\n<DL><p>\n`;
            if (window.tabs && Array.isArray(window.tabs)) {
              window.tabs.forEach((tab) => {
                bookmarkStr += `<DT><A HREF="${tab.url}">${tab.title}</A>\n`;
              });
            }
            bookmarkStr += '</DL><p>\n';
          });
        }
        bookmarkStr += '</DL><p>\n';
      });

      if (bookmarkStr === '') {
        createCustomDialog('没有可导出的标签页', () => {}, false);
        return;
      }

      const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
      <META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
      <TITLE>Bookmarks</TITLE>
      <H1>Bookmarks</H1>
      <DL><p>
      ${bookmarkStr}
      </DL><p>`;

      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url,
        filename: 'tabvault_bookmarks.html'
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('下载失败:', chrome.runtime.lastError);
          createCustomDialog('导出失败，请重试', () => {}, false);
        } else {
          console.log('Download started with ID:', downloadId);
          createCustomDialog('书签已导出', () => {}, false);
        }
      });
    })
    .catch((error) => {
      console.error('导出书签失败:', error);
      createCustomDialog('导出失败，请稍后再试', () => {}, false);
    });
}

function openSettings() {
  chrome.runtime.openOptionsPage();
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
            await updateAllInfo(true);
            notifySnapshotsUpdated();
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
            await updateAllInfo(true);
            notifySnapshotsUpdated();
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

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'refreshSnapshots') {
    updateAllInfo(true).catch((error) => console.error('刷新快照信息失败:', error));
  }
});

function notifySnapshotsUpdated() {
  chrome.runtime.sendMessage({ action: 'snapshotsUpdated' }, () => {});
}


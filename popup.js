document.addEventListener('DOMContentLoaded', function() {
  const saveButton = document.getElementById('saveButton');
  const restoreButton = document.getElementById('restoreButton');
  const exportButton = document.getElementById('exportButton');
  const settingsButton = document.getElementById('settingsButton');

  saveButton.addEventListener('click', saveCurrentTabs);
  restoreButton.addEventListener('click', restoreLatestSnapshot);
  exportButton.addEventListener('click', exportBookmarks);
  settingsButton.addEventListener('click', openSettings);

  // 使用共用函数更新所有信息,传入true表示这是弹出窗口
  updateAllInfo(true);
});

function saveCurrentTabs() {
  chrome.runtime.sendMessage({action: "manualSave"}, (response) => {
    if (chrome.runtime.lastError) {
      console.error("保存标签页时出错:", chrome.runtime.lastError);
      return;
    }
    console.log("保存响应:", response);
    
    // 立即更新界面
    updateAllInfo(true);
    
    // 显示保存成功的对话框
    createCustomDialog("快照已保存", () => {
      // 对话框关闭后再次更新界面,以确保显示最新数据
      updateAllInfo(true);
    }, false);
  });
}

function restoreLatestSnapshot() {
  chrome.storage.local.get(['snapshots'], (result) => {
    if (result.snapshots && result.snapshots.length > 0) {
      createCustomDialog(
        `确定要恢复最新的快照吗？\n日期：${formatDate(result.snapshots[0].date)}`,
        () => chrome.runtime.sendMessage({action: "restoreSnapshot", snapshotId: result.snapshots[0].id})
      );
    }
  });
}

function exportBookmarks() {
  chrome.storage.local.get(['snapshots'], (result) => {
    if (result.snapshots && result.snapshots.length > 0) {
      let bookmarkStr = '';
      result.snapshots.forEach(snapshot => {
        bookmarkStr += `<DT><H3>${snapshot.name} (${formatDate(snapshot.date)})</H3>\n<DL><p>\n`;
        if (snapshot.windows && Array.isArray(snapshot.windows)) {
          snapshot.windows.forEach((window, windowIndex) => {
            bookmarkStr += `<DT><H3>窗口 ${windowIndex + 1}</H3>\n<DL><p>\n`;
            if (window.tabs && Array.isArray(window.tabs)) {
              window.tabs.forEach(tab => {
                bookmarkStr += `<DT><A HREF="${tab.url}">${tab.title}</A>\n`;
              });
            }
            bookmarkStr += '</DL><p>\n';
          });
        }
        bookmarkStr += '</DL><p>\n';
      });

      if (bookmarkStr === '') {
        createCustomDialog("没有可导出的标签页。", () => {}, false);
        return;
      }

      const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
      <META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
      <TITLE>Bookmarks</TITLE>
      <H1>Bookmarks</H1>
      <DL><p>
      ${bookmarkStr}
      </DL><p>`;
      
      const blob = new Blob([html], {type: 'text/html'});
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url: url,
        filename: 'tabvault_bookmarks.html'
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error("Download failed:", chrome.runtime.lastError);
          createCustomDialog("导出失败，请重试。", () => {}, false);
        } else {
          console.log("Download started with ID:", downloadId);
          createCustomDialog("书签已成功导出。", () => {}, false);
        }
      });
    } else {
      createCustomDialog("没有可导出的快照。", () => {}, false);
    }
  });
}

function openSettings() {
  chrome.runtime.openOptionsPage();
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
              loadSnapshotList(true); // 传入true表示这是弹出窗口
              notifySnapshotsUpdated(); // 通知其他页面更新
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
            updateAllInfo(true); // 使用共用函数更新所有信息,传入true表示这是弹出窗口
            notifySnapshotsUpdated(); // 通知其他页面更新
          });
        }
      );
    }
  });
}

// 确保这个监听器在文件的顶层
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "refreshSnapshots") {
    updateAllInfo(true); // 使用共用函数更新所有信息,传入true表示这是弹出窗口
  }
});

// 添加这个辅助函数
function notifySnapshotsUpdated() {
  chrome.runtime.sendMessage({action: "snapshotsUpdated"});
}

// 修改这个函数以确保在弹出窗口中正确更新
function updateAllInfo(isPopup = true) {
  updateStorageUsage();
  updateSnapshotCounts();
  loadSnapshotList(isPopup);
}
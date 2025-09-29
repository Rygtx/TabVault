function createCustomDialog(message, onConfirm, showCancel = true, showInput = false) {
  const dialog = document.createElement('div');
  dialog.className = 'custom-dialog';
  const rawMessage = typeof message === 'string' ? message : String(message ?? '');
  const formattedMessage = rawMessage.replace(/\n/g, '<br>');
  dialog.innerHTML = `
    <div class="dialog-content glass-card">
      <p>${formattedMessage}</p>
      ${showInput ? '<input type="text" id="dialogInput" autocomplete="off">' : ''}
      <div class="dialog-buttons">
        <button id="confirmBtn" class="dialog-button dialog-button--confirm">确认</button>
        ${showCancel ? '<button id="cancelBtn" class="dialog-button dialog-button--cancel">取消</button>' : ''}
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const confirmAction = () => {
    const input = showInput ? document.getElementById('dialogInput').value : null;
    try {
      onConfirm(input);
    } finally {
      if (dialog.parentNode) {
        document.body.removeChild(dialog);
      }
    }
  };

  document.getElementById('confirmBtn').addEventListener('click', confirmAction);

  if (showInput) {
    const inputElement = document.getElementById('dialogInput');
    inputElement.addEventListener('keyup', (event) => {
      if (event.key === 'Enter') {
        confirmAction();
      }
    });
    setTimeout(() => inputElement.focus(), 0);
  }

  if (showCancel) {
    document.getElementById('cancelBtn').addEventListener('click', () => {
      if (dialog.parentNode) {
        document.body.removeChild(dialog);
      }
    });
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
}

async function updateStorageUsage() {
  const usageElement = document.getElementById('storageUsage');
  if (!usageElement || !window.TabVaultDB) {
    return;
  }
  try {
    const { bytes, totalBytes, ratio } = await TabVaultDB.estimateUsage();
    const usedMB = bytes / (1024 * 1024);
    const totalMB = totalBytes / (1024 * 1024);
    usageElement.textContent = `存储空间约：${usedMB.toFixed(2)} MB / ${totalMB.toFixed(0)} MB`;

    const progressElement = document.getElementById('storageProgress');
    if (progressElement) {
      const percentage = Math.min(100, ratio * 100);
      progressElement.style.width = `${percentage.toFixed(2)}%`;
    }
  } catch (error) {
    console.error('更新存储用量失败:', error);
  }
}

async function updateSnapshotCounts() {
  const counterElement = document.getElementById('snapshotCounts');
  if (!counterElement || !window.TabVaultDB) {
    return;
  }
  try {
    const snapshots = await TabVaultDB.getSnapshots();
    const manualCount = snapshots.filter((s) => TabVaultDB.isManualSnapshotName(s.name)).length;
    const autoCount = snapshots.filter((s) => TabVaultDB.isAutoSnapshotName(s.name)).length;
    counterElement.innerHTML = `手动快照：${manualCount}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;自动快照：${autoCount}`;
  } catch (error) {
    console.error('统计快照数量失败:', error);
  }
}

async function loadSnapshotList(isPopup = false) {
  const snapshotList = document.getElementById('snapshotList');
  if (!snapshotList || !window.TabVaultDB) {
    return;
  }
  try {
    const snapshots = await TabVaultDB.getSnapshots();
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      snapshotList.innerHTML = '<div class="empty-state glass-card">暂无快照</div>';
      return;
    }

    const listHtml = snapshots.map((snapshot) => {
      const windowDetails = !isPopup && Array.isArray(snapshot.windows)
        ? snapshot.windows.map((window, windowIndex) => {
            const tabs = Array.isArray(window.tabs) ? window.tabs : [];
            const tabItems = tabs.map((tab) => `
                  <div class="tab-item">
                    <div class="tab-title">${tab.title}</div>
                    <div class="tab-url">${tab.url}</div>
                  </div>
                `).join('');
            return `
              <div class="window-item glass-card">
                <div class="window-header">窗口 ${windowIndex + 1}</div>
                ${tabItems || '<div class="tab-item tab-item--empty">无标签页信息</div>'}
              </div>
            `;
          }).join('')
        : '';

      return `
        <div class="snapshot-item glass-card">
          <div class="snapshot-header">
            <span class="snapshot-name">${snapshot.name}</span>
          </div>
          <div class="snapshot-subheader">
            <span class="snapshot-date">${formatDate(snapshot.date)}</span>
            <div class="snapshot-actions">
              <button class="snapshot-action snapshot-action--primary" data-action="restore" data-id="${snapshot.id}">恢复</button>
              <button class="snapshot-action snapshot-action--accent" data-action="rename" data-id="${snapshot.id}">重命名</button>
              <button class="snapshot-action snapshot-action--danger" data-action="delete" data-id="${snapshot.id}">删除</button>
            </div>
          </div>
          ${windowDetails ? `<div class="snapshot-details">${windowDetails}</div>` : ''}
        </div>
      `;
    }).join('');

    snapshotList.innerHTML = listHtml;

    snapshotList.querySelectorAll('[data-action="restore"]').forEach((btn) => {
      btn.addEventListener('click', () => restoreSnapshot(Number(btn.dataset.id)));
    });
    snapshotList.querySelectorAll('[data-action="rename"]').forEach((btn) => {
      btn.addEventListener('click', () => renameSnapshot(Number(btn.dataset.id)));
    });
    snapshotList.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', () => deleteSnapshot(Number(btn.dataset.id)));
    });
  } catch (error) {
    console.error('加载快照列表失败:', error);
  }
}

async function updateAllInfo(isPopup = false) {
  await Promise.all([
    updateStorageUsage(),
    updateSnapshotCounts(),
    loadSnapshotList(isPopup)
  ]);
}

function createCustomDialog(message, onConfirm, showCancel = true, showInput = false) {
  const dialog = document.createElement('div');
  dialog.className = 'custom-dialog';
  const normalizedMessage = typeof message === 'string' ? message : String(message ?? '');
  const formattedMessage = normalizedMessage.replace(/\n/g, '<br>');
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

  const closeDialog = () => {
    if (dialog.parentNode) {
      document.body.removeChild(dialog);
    }
  };

  const confirmAction = () => {
    const inputValue = showInput ? document.getElementById('dialogInput').value : undefined;
    try {
      onConfirm(inputValue);
    } finally {
      closeDialog();
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
    document.getElementById('cancelBtn').addEventListener('click', closeDialog);
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
    const manualCount = snapshots.filter((snapshot) => TabVaultDB.isManualSnapshotName(snapshot.name)).length;
    const autoCount = snapshots.filter((snapshot) => TabVaultDB.isAutoSnapshotName(snapshot.name)).length;
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

      snapshotList.innerHTML = '<div class="empty-state">暂无快照</div>';

      return;

    }



    const listHtml = snapshots.map((snapshot) => {

      const windows = Array.isArray(snapshot.windows) ? snapshot.windows : [];

      const totalWindows = windows.length;

      const totalTabs = windows.reduce((sum, window) => {

        const tabs = Array.isArray(window.tabs) ? window.tabs.length : 0;

        return sum + tabs;

      }, 0);

      const isAuto = TabVaultDB.isAutoSnapshotName(snapshot.name);

      const typeLabel = isAuto ? '自动快照' : '手动快照';

      const typeClass = isAuto ? 'snapshot-chip--auto' : 'snapshot-chip--manual';



      const windowDetails = !isPopup && windows.length > 0
        ? windows.map((window, windowIndex) => {
            const tabs = Array.isArray(window.tabs) ? window.tabs : [];
            const tabItems = tabs.map((tab, tabIndex) => `
                  <div class="tab-item">
                    <span class="tab-index">${tabIndex + 1}</span>
                    <div class="tab-body">
                      <div class="tab-title">${tab.title}</div>
                      <div class="tab-url">${tab.url}</div>
                    </div>
                  </div>
                `).join('');
            const needsScroll = tabs.length > 12;
            const tabListClass = needsScroll ? 'tab-list tab-list--scroll' : 'tab-list';
                        return `
              <section class="window-item">
                <header class="window-header">
                  <span class="window-name">窗口 ${windowIndex + 1}</span>
                  <span class="window-chip">标签页 ${tabs.length}</span>
                </header>
                <div class="${tabListClass}">
                  ${tabItems || '<div class=\"tab-item tab-item--empty\">暂无标签页信息</div>'}
                </div>
              </section>
            `;
          }).join('')
        : '';



      const detailsBlock = windowDetails

        ? `<details class="snapshot-details">

              <summary>查看窗口和标签页（${totalWindows} 个窗口，${totalTabs} 个标签页）</summary>

              <div class="snapshot-details__content">${windowDetails}</div>

            </details>`

        : '';



      return `
        <article class="snapshot-item">
          <header class="snapshot-header">
            <div class="snapshot-title">
              <span class="snapshot-name">${snapshot.name}</span>
              <span class="snapshot-date">${formatDate(snapshot.date)}</span>
            </div>
            <div class="snapshot-meta">
              <span class="snapshot-chip ${typeClass}">${typeLabel}</span>
              <span class="snapshot-chip">窗口 ${totalWindows}</span>
              <span class="snapshot-chip">标签页 ${totalTabs}</span>
            </div>
            <div class="snapshot-actions">
              <button class="snapshot-action snapshot-action--primary" data-action="restore" data-id="${snapshot.id}">恢复</button>
              <button class="snapshot-action snapshot-action--accent" data-action="rename" data-id="${snapshot.id}">重命名</button>
              <button class="snapshot-action snapshot-action--danger" data-action="delete" data-id="${snapshot.id}">删除</button>
            </div>
          </header>
          ${detailsBlock}
        </article>
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

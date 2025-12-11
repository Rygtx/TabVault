// ============================================
// 性能优化：常量和配置
// ============================================
const BATCH_SIZE = 10; // 每批渲染的快照数量
const BATCH_DELAY = 0;  // 批次间的延迟（毫秒），使用0让浏览器有机会处理其他任务

// ============================================
// 对话框函数
// ============================================
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

// ============================================
// 优化：updateStorageUsage 支持传入已计算的使用量数据
// ============================================
async function updateStorageUsage(usageData = null) {
  const usageElement = document.getElementById('storageUsage');
  if (!usageElement || !window.TabVaultDB) {
    return;
  }
  try {
    // 如果传入了 usageData 则直接使用，否则调用 API
    const { bytes, totalBytes, ratio } = usageData || await TabVaultDB.estimateUsage();
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

// ============================================
// 优化：updateSnapshotCounts 接收快照数据，单次遍历计算两种快照数量
// ============================================
function updateSnapshotCounts(snapshots = null) {
  const counterElement = document.getElementById('snapshotCounts');
  if (!counterElement || !window.TabVaultDB) {
    return;
  }

  if (!Array.isArray(snapshots)) {
    counterElement.innerHTML = `手动快照：0&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;自动快照：0`;
    return;
  }

  // 优化：单次遍历同时计算两种快照数量
  let manualCount = 0;
  let autoCount = 0;
  for (let i = 0; i < snapshots.length; i++) {
    const name = snapshots[i].name;
    if (TabVaultDB.isManualSnapshotName(name)) {
      manualCount++;
    } else if (TabVaultDB.isAutoSnapshotName(name)) {
      autoCount++;
    }
  }

  counterElement.innerHTML = `手动快照：${manualCount}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;自动快照：${autoCount}`;
}

// ============================================
// 辅助函数：生成单个快照的 HTML
// ============================================
function generateSnapshotHtml(snapshot, isPopup) {
  const windows = Array.isArray(snapshot.windows) ? snapshot.windows : [];
  const totalWindows = windows.length;

  // 优化：使用累加器代替 reduce，避免创建中间函数
  let totalTabs = 0;
  for (let i = 0; i < windows.length; i++) {
    const tabs = windows[i].tabs;
    totalTabs += Array.isArray(tabs) ? tabs.length : 0;
  }

  const isAuto = TabVaultDB.isAutoSnapshotName(snapshot.name);
  const typeLabel = isAuto ? '自动快照' : '手动快照';
  const typeClass = isAuto ? 'snapshot-chip--auto' : 'snapshot-chip--manual';

  // 生成窗口详情
  let windowDetails = '';
  if (!isPopup && windows.length > 0) {
    const windowParts = [];
    for (let windowIndex = 0; windowIndex < windows.length; windowIndex++) {
      const win = windows[windowIndex];
      const tabs = Array.isArray(win.tabs) ? win.tabs : [];

      // 生成标签页列表
      const tabParts = [];
      for (let tabIndex = 0; tabIndex < tabs.length; tabIndex++) {
        const tab = tabs[tabIndex];
        tabParts.push(`
          <div class="tab-item">
            <span class="tab-index">${tabIndex + 1}</span>
            <div class="tab-body">
              <div class="tab-title">${tab.title}</div>
              <div class="tab-url">${tab.url}</div>
            </div>
          </div>
        `);
      }

      const tabItems = tabParts.join('');
      windowParts.push(`
        <section class="window-item">
          <header class="window-header">
            <span class="window-name">窗口 ${windowIndex + 1}</span>
            <span class="window-chip">标签页 ${tabs.length}</span>
          </header>
          <div class="tab-list">
            ${tabItems || '<div class="tab-item tab-item--empty">暂无标签页信息</div>'}
          </div>
        </section>
      `);
    }
    windowDetails = windowParts.join('');
  }

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
}

// ============================================
// 优化：使用事件委托处理所有按钮点击
// ============================================
let snapshotListDelegateAttached = false;

function setupEventDelegation(snapshotList) {
  // 避免重复绑定事件委托
  if (snapshotListDelegateAttached) {
    return;
  }
  snapshotListDelegateAttached = true;

  snapshotList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) {
      return;
    }

    const action = button.dataset.action;
    const id = Number(button.dataset.id);

    switch (action) {
      case 'restore':
        restoreSnapshot(id);
        break;
      case 'rename':
        renameSnapshot(id);
        break;
      case 'delete':
        deleteSnapshot(id);
        break;
    }
  });
}

// ============================================
// 优化：使用 requestAnimationFrame 分批渲染快照
// ============================================
function renderSnapshotsInBatches(snapshots, snapshotList, isPopup) {
  return new Promise((resolve) => {
    // 清空列表
    snapshotList.innerHTML = '';

    // 设置事件委托（只需设置一次）
    setupEventDelegation(snapshotList);

    if (snapshots.length === 0) {
      snapshotList.innerHTML = '<div class="empty-state">暂无快照</div>';
      resolve();
      return;
    }

    let currentIndex = 0;

    function renderBatch() {
      const batchEnd = Math.min(currentIndex + BATCH_SIZE, snapshots.length);

      // 使用 DocumentFragment 减少重排
      const batchFragment = document.createDocumentFragment();

      for (let i = currentIndex; i < batchEnd; i++) {
        const snapshot = snapshots[i];
        const html = generateSnapshotHtml(snapshot, isPopup);

        // 创建临时容器来解析 HTML
        const temp = document.createElement('div');
        temp.innerHTML = html;

        // 将解析后的元素添加到 fragment
        while (temp.firstChild) {
          batchFragment.appendChild(temp.firstChild);
        }
      }

      // 将这批元素添加到列表
      snapshotList.appendChild(batchFragment);

      currentIndex = batchEnd;

      if (currentIndex < snapshots.length) {
        // 还有更多快照，使用 requestAnimationFrame 调度下一批
        if (BATCH_DELAY > 0) {
          setTimeout(() => requestAnimationFrame(renderBatch), BATCH_DELAY);
        } else {
          requestAnimationFrame(renderBatch);
        }
      } else {
        // 所有快照渲染完成，检查滚动溢出
        requestAnimationFrame(() => {
          snapshotList.querySelectorAll('.tab-list').forEach((list) => {
            const hasOverflow = list.scrollHeight > list.clientHeight + 1;
            list.classList.toggle('tab-list--scroll', hasOverflow);
          });
          resolve();
        });
      }
    }

    // 开始第一批渲染
    requestAnimationFrame(renderBatch);
  });
}

// ============================================
// 优化后的 loadSnapshotList：接收快照数据，使用分批渲染
// ============================================
async function loadSnapshotList(isPopup = false, snapshots = null) {
  const snapshotList = document.getElementById('snapshotList');

  if (!snapshotList || !window.TabVaultDB) {
    return;
  }

  try {
    // 如果未传入快照数据，则获取
    const snapshotData = snapshots || await TabVaultDB.getSnapshots();

    if (!Array.isArray(snapshotData) || snapshotData.length === 0) {
      snapshotList.innerHTML = '<div class="empty-state">暂无快照</div>';
      setupEventDelegation(snapshotList);
      return;
    }

    // 使用分批渲染
    await renderSnapshotsInBatches(snapshotData, snapshotList, isPopup);

  } catch (error) {
    console.error('加载快照列表失败:', error);
  }
}



// ============================================
// 优化后的 updateAllInfo：只获取一次快照数据并共享
// ============================================
async function updateAllInfo(isPopup = false) {
  if (!window.TabVaultDB) {
    return;
  }

  try {
    // 优化：并行获取所有需要的数据，但只获取一次
    const [snapshots, usageData] = await Promise.all([
      TabVaultDB.getSnapshots(),
      TabVaultDB.estimateUsage()
    ]);

    // 同步更新快照计数（不需要再次获取数据）
    updateSnapshotCounts(snapshots);

    // 同步更新存储用量（使用已获取的数据）
    await updateStorageUsage(usageData);

    // 渲染快照列表（使用已获取的数据）
    await loadSnapshotList(isPopup, snapshots);

  } catch (error) {
    console.error('更新信息失败:', error);
  }
}

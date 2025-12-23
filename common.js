// ============================================
// 分页系统：配置和状态
// ============================================
const DEFAULT_PAGE_SIZE = 50; // 默认每页显示的快照数量
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]; // 可选的每页数量
const PAGE_SIZE_STORAGE_KEY = 'tabvault_page_size'; // 存储键名

let paginationState = {
  currentPage: 1,
  totalPages: 1,
  totalSnapshots: 0,
  pageSize: DEFAULT_PAGE_SIZE, // 当前每页数量
  allSnapshots: [], // 缓存所有快照数据
  isPopup: false
};

// ============================================
// 分页系统：持久化页面大小
// ============================================
function savePageSize(size) {
  try {
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size));
  } catch (e) {
    console.warn('无法保存页面大小设置:', e);
  }
}

function loadPageSize() {
  try {
    const saved = localStorage.getItem(PAGE_SIZE_STORAGE_KEY);
    if (saved) {
      const size = parseInt(saved, 10);
      if (PAGE_SIZE_OPTIONS.includes(size)) {
        return size;
      }
    }
  } catch (e) {
    console.warn('无法加载页面大小设置:', e);
  }
  return DEFAULT_PAGE_SIZE;
}

// 初始化时加载保存的页面大小
paginationState.pageSize = loadPageSize();

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
// 辅助函数：生成单个快照的 HTML（延迟渲染详情）
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

  // 优化：延迟渲染详情内容，只在展开时加载
  const detailsBlock = !isPopup && windows.length > 0
    ? `<details class="snapshot-details" data-snapshot-id="${snapshot.id}">
        <summary>查看窗口和标签页（${totalWindows} 个窗口，${totalTabs} 个标签页）</summary>
        <div class="snapshot-details__content" data-loaded="false">
          <div class="details-loading">点击展开加载详情...</div>
        </div>
      </details>`
    : '';

  return `
    <article class="snapshot-item" data-snapshot-id="${snapshot.id}">
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
// 辅助函数：生成窗口详情 HTML（用于延迟加载）
// ============================================
function generateWindowDetailsHtml(windows) {
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
            <div class="tab-title">${tab.title || '无标题'}</div>
            <div class="tab-url">${tab.url || ''}</div>
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
  return windowParts.join('');
}

// ============================================
// 延迟加载快照详情
// ============================================
function loadSnapshotDetails(snapshotId, detailsElement) {
  const contentEl = detailsElement.querySelector('.snapshot-details__content');
  if (!contentEl || contentEl.dataset.loaded === 'true') {
    return; // 已加载
  }

  // 从缓存的快照数据中查找
  const snapshot = paginationState.allSnapshots.find(s => s.id === snapshotId);
  if (!snapshot) {
    contentEl.innerHTML = '<div class="details-error">无法加载详情</div>';
    return;
  }

  const windows = Array.isArray(snapshot.windows) ? snapshot.windows : [];
  contentEl.innerHTML = generateWindowDetailsHtml(windows);
  contentEl.dataset.loaded = 'true';

  // 检查滚动溢出（仅对当前详情）
  contentEl.querySelectorAll('.tab-list').forEach((list) => {
    const hasOverflow = list.scrollHeight > list.clientHeight + 1;
    list.classList.toggle('tab-list--scroll', hasOverflow);
  });
}

// ============================================
// 优化：使用事件委托处理所有按钮点击和详情展开
// ============================================
let snapshotListDelegateAttached = false;

function setupEventDelegation(snapshotList) {
  // 避免重复绑定事件委托
  if (snapshotListDelegateAttached) {
    return;
  }
  snapshotListDelegateAttached = true;

  // 处理按钮点击
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

  // 处理详情展开（延迟加载窗口和标签页内容）
  snapshotList.addEventListener('toggle', (event) => {
    const details = event.target;
    if (details.tagName !== 'DETAILS' || !details.open) {
      return;
    }

    const snapshotId = Number(details.dataset.snapshotId);
    if (snapshotId) {
      loadSnapshotDetails(snapshotId, details);
    }
  }, true); // 使用捕获阶段
}

// ============================================
// 分页系统：生成页面大小选择器
// ============================================
function generatePageSizeSelector() {
  const { pageSize } = paginationState;

  const options = PAGE_SIZE_OPTIONS.map(size => {
    const selected = size === pageSize ? 'selected' : '';
    return `<option value="${size}" ${selected}>${size} 条/页</option>`;
  }).join('');

  return `
    <div class="page-size-selector">
      <label class="page-size-label">每页显示</label>
      <select class="page-size-select" id="pageSizeSelect">
        ${options}
      </select>
    </div>
  `;
}

// ============================================
// 分页系统：生成分页控件
// ============================================
function generatePaginationHtml() {
  const { currentPage, totalPages, totalSnapshots } = paginationState;

  // 始终显示页面大小选择器（即使只有一页）
  const pageSizeSelector = generatePageSizeSelector();

  if (totalPages <= 1) {
    // 只有一页时，只显示页面大小选择器和信息
    return `
      <div class="pagination-container pagination-container--minimal">
        <div class="pagination-row">
          <div class="pagination-info">
            <span class="pagination-info__total">共 ${totalSnapshots} 个快照</span>
          </div>
          ${pageSizeSelector}
        </div>
      </div>
    `;
  }

  // 生成页码按钮
  let pageButtons = '';
  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

  // 调整起始页
  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  // 第一页
  if (startPage > 1) {
    pageButtons += `<button class="pagination-btn pagination-btn--page" data-page="1">1</button>`;
    if (startPage > 2) {
      pageButtons += `<span class="pagination-ellipsis">···</span>`;
    }
  }

  // 中间页码
  for (let i = startPage; i <= endPage; i++) {
    const activeClass = i === currentPage ? 'pagination-btn--active' : '';
    pageButtons += `<button class="pagination-btn pagination-btn--page ${activeClass}" data-page="${i}">${i}</button>`;
  }

  // 最后一页
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      pageButtons += `<span class="pagination-ellipsis">···</span>`;
    }
    pageButtons += `<button class="pagination-btn pagination-btn--page" data-page="${totalPages}">${totalPages}</button>`;
  }

  const prevDisabled = currentPage === 1 ? 'disabled' : '';
  const nextDisabled = currentPage === totalPages ? 'disabled' : '';

  return `
    <div class="pagination-container">
      <div class="pagination-row pagination-row--top">
        <div class="pagination-info">
          <span class="pagination-info__total">共 ${totalSnapshots} 个快照</span>
          <span class="pagination-info__divider">|</span>
          <span class="pagination-info__page">第 ${currentPage} / ${totalPages} 页</span>
        </div>
        ${pageSizeSelector}
      </div>
      <div class="pagination-row pagination-row--bottom">
        <div class="pagination-controls">
          <button class="pagination-btn pagination-btn--nav" data-page="first" ${prevDisabled} title="第一页">
            <span class="pagination-icon">«</span>
          </button>
          <button class="pagination-btn pagination-btn--nav" data-page="prev" ${prevDisabled} title="上一页">
            <span class="pagination-icon">‹</span>
            <span class="pagination-text">上一页</span>
          </button>
          <div class="pagination-pages">
            ${pageButtons}
          </div>
          <button class="pagination-btn pagination-btn--nav" data-page="next" ${nextDisabled} title="下一页">
            <span class="pagination-text">下一页</span>
            <span class="pagination-icon">›</span>
          </button>
          <button class="pagination-btn pagination-btn--nav" data-page="last" ${nextDisabled} title="最后一页">
            <span class="pagination-icon">»</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

// ============================================
// 分页系统：渲染分页控件并绑定事件
// ============================================
function renderPagination() {
  // 移除旧的分页控件
  const existingPagination = document.querySelectorAll('.pagination-container');
  existingPagination.forEach(el => el.remove());

  const paginationHtml = generatePaginationHtml();
  if (!paginationHtml) {
    return;
  }

  const snapshotList = document.getElementById('snapshotList');
  if (!snapshotList) {
    return;
  }

  // 在快照列表后插入分页控件
  snapshotList.insertAdjacentHTML('afterend', paginationHtml);

  // 绑定分页事件
  const paginationContainer = snapshotList.nextElementSibling;
  if (paginationContainer && paginationContainer.classList.contains('pagination-container')) {
    paginationContainer.addEventListener('click', handlePaginationClick);

    // 绑定页面大小选择器事件
    const pageSizeSelect = paginationContainer.querySelector('#pageSizeSelect');
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', handlePageSizeChange);
    }
  }
}

// ============================================
// 分页系统：处理页面大小变更
// ============================================
function handlePageSizeChange(event) {
  const newSize = parseInt(event.target.value, 10);
  if (PAGE_SIZE_OPTIONS.includes(newSize) && newSize !== paginationState.pageSize) {
    // 保存新的页面大小
    paginationState.pageSize = newSize;
    savePageSize(newSize);

    // 重新计算总页数
    paginationState.totalPages = Math.ceil(paginationState.totalSnapshots / newSize);

    // 确保当前页不超过新的总页数
    if (paginationState.currentPage > paginationState.totalPages) {
      paginationState.currentPage = paginationState.totalPages;
    }
    if (paginationState.currentPage < 1) {
      paginationState.currentPage = 1;
    }

    // 重新渲染当前页
    renderCurrentPage();
  }
}

// ============================================
// 分页系统：处理分页点击
// ============================================
function handlePaginationClick(event) {
  const button = event.target.closest('.pagination-btn');
  if (!button || button.disabled) {
    return;
  }

  const pageValue = button.dataset.page;
  let newPage = paginationState.currentPage;

  if (pageValue === 'first') {
    newPage = 1;
  } else if (pageValue === 'prev') {
    newPage = Math.max(1, paginationState.currentPage - 1);
  } else if (pageValue === 'next') {
    newPage = Math.min(paginationState.totalPages, paginationState.currentPage + 1);
  } else if (pageValue === 'last') {
    newPage = paginationState.totalPages;
  } else {
    newPage = parseInt(pageValue, 10);
  }

  if (newPage !== paginationState.currentPage && newPage >= 1 && newPage <= paginationState.totalPages) {
    paginationState.currentPage = newPage;
    renderCurrentPage();
  }
}

// ============================================
// 分页系统：渲染当前页
// ============================================
function renderCurrentPage() {
  const { currentPage, pageSize, allSnapshots, isPopup } = paginationState;
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, allSnapshots.length);
  const pageSnapshots = allSnapshots.slice(startIndex, endIndex);

  const snapshotList = document.getElementById('snapshotList');
  if (snapshotList) {
    renderSnapshots(pageSnapshots, snapshotList, isPopup);
    renderPagination();

    // 滚动到快照列表顶部
    snapshotList.scrollTop = 0;
  }
}

// ============================================
// 渲染快照列表（同步渲染，保留 DocumentFragment 优化）
// ============================================
function renderSnapshots(snapshots, snapshotList, isPopup) {
  // 清空列表
  snapshotList.innerHTML = '';

  // 设置事件委托（只需设置一次）
  setupEventDelegation(snapshotList);

  if (snapshots.length === 0) {
    snapshotList.innerHTML = '<div class="empty-state">暂无快照</div>';
    return;
  }

  // 使用 DocumentFragment 减少重排（保留此优化）
  const fragment = document.createDocumentFragment();

  for (const snapshot of snapshots) {
    const html = generateSnapshotHtml(snapshot, isPopup);

    // 创建临时容器来解析 HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // 将解析后的元素添加到 fragment
    while (temp.firstChild) {
      fragment.appendChild(temp.firstChild);
    }
  }

  // 一次性添加所有元素到 DOM
  snapshotList.appendChild(fragment);

  // 注意：滚动溢出检测已移至 loadSnapshotDetails 中按需执行
}

// ============================================
// 优化后的 loadSnapshotList：使用分页系统
// ============================================
async function loadSnapshotList(isPopup = false, snapshots = null) {
  const snapshotList = document.getElementById('snapshotList');

  if (!snapshotList || !window.TabVaultDB) {
    return;
  }

  try {
    // 如果未传入快照数据，则获取
    const snapshotData = snapshots || await TabVaultDB.getSnapshots();

    // 移除旧的分页控件
    const existingPagination = document.querySelectorAll('.pagination-container');
    existingPagination.forEach(el => el.remove());

    if (!Array.isArray(snapshotData) || snapshotData.length === 0) {
      snapshotList.innerHTML = '<div class="empty-state">暂无快照</div>';
      setupEventDelegation(snapshotList);
      // 重置分页状态
      paginationState.allSnapshots = [];
      paginationState.currentPage = 1;
      paginationState.totalPages = 1;
      paginationState.totalSnapshots = 0;
      return;
    }

    // 更新分页状态
    const { pageSize } = paginationState;
    paginationState.allSnapshots = snapshotData;
    paginationState.totalSnapshots = snapshotData.length;
    paginationState.totalPages = Math.ceil(snapshotData.length / pageSize);
    paginationState.isPopup = isPopup;

    // 确保当前页不超过总页数
    if (paginationState.currentPage > paginationState.totalPages) {
      paginationState.currentPage = paginationState.totalPages;
    }
    if (paginationState.currentPage < 1) {
      paginationState.currentPage = 1;
    }

    // 获取当前页的快照
    const startIndex = (paginationState.currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, snapshotData.length);
    const pageSnapshots = snapshotData.slice(startIndex, endIndex);

    // 渲染当前页的快照（同步渲染）
    renderSnapshots(pageSnapshots, snapshotList, isPopup);

    // 渲染分页控件
    renderPagination();

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
    // 优化：先获取快照数据，然后传递给 estimateUsage 避免重复获取
    const snapshots = await TabVaultDB.getSnapshots();

    // 使用已获取的快照数据计算存储用量
    const usageData = await TabVaultDB.estimateUsage(false, snapshots);

    // 同步更新快照计数（不需要再次获取数据）
    updateSnapshotCounts(snapshots);

    // 同步更新存储用量（使用已获取的数据）
    updateStorageUsage(usageData);

    // 渲染快照列表（使用已获取的数据）
    loadSnapshotList(isPopup, snapshots);

  } catch (error) {
    console.error('更新信息失败:', error);
  }
}

function createCustomDialog(message, onConfirm, showCancel = true, showInput = false) {
  const dialog = document.createElement('div');
  dialog.className = 'custom-dialog';
  dialog.innerHTML = `
    <div class="dialog-content">
      <p>${message}</p>
      ${showInput ? '<input type="text" id="dialogInput">' : ''}
      <div class="dialog-buttons">
        <button id="confirmBtn">确定</button>
        ${showCancel ? '<button id="cancelBtn">取消</button>' : ''}
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const confirmAction = () => {
    const input = showInput ? document.getElementById('dialogInput').value : null;
    onConfirm(input);
    document.body.removeChild(dialog);
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
      document.body.removeChild(dialog);
    });
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
}

function updateStorageUsage() {
  chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
    const totalStorageInBytes = 5 * 1024 * 1024; // 5MB in bytes
    const usagePercentage = ((bytesInUse / totalStorageInBytes) * 100).toFixed(2);
    document.getElementById('storageUsage').textContent = `存储空间使用：${usagePercentage}%`;
    
    // 如果存在进度条元素,则更新进度条
    const progressElement = document.getElementById('storageProgress');
    if (progressElement) {
      progressElement.style.width = `${usagePercentage}%`;
    }
  });
}

function updateSnapshotCounts() {
  chrome.storage.local.get(['snapshots'], (result) => {
    const snapshots = result.snapshots || [];
    const manualCount = snapshots.filter(s => s.name === "手动保存").length;
    const autoCount = snapshots.filter(s => s.name === "自动保存").length;
    document.getElementById('snapshotCounts').innerHTML = `手动快照：${manualCount}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;自动快照：${autoCount}`;
  });
}

function loadSnapshotList(isPopup = false) {
  const snapshotList = document.getElementById('snapshotList');
  chrome.storage.local.get(['snapshots'], (result) => {
    const snapshots = result.snapshots || [];
    let newContent = '';
    snapshots.forEach(snapshot => {
      newContent += `
        <div class="snapshot-item">
          <div class="snapshot-header">
            <span class="snapshot-name">${snapshot.name}</span>
          </div>
          <div class="snapshot-subheader">
            <span class="snapshot-date">${formatDate(snapshot.date)}</span>
            <div class="snapshot-actions">
              <button class="restore-btn" data-id="${snapshot.id}">恢复</button>
              <button class="rename-btn" data-id="${snapshot.id}">重命名</button>
              <button class="delete-btn" data-id="${snapshot.id}">删除</button>
            </div>
          </div>
          ${!isPopup ? `
          <div class="snapshot-details">
            ${snapshot.windows ? snapshot.windows.map((window, windowIndex) => `
              <div class="window-item">
                <div class="window-header">窗口 ${windowIndex + 1}</div>
                ${window.tabs.map(tab => `
                  <div class="tab-item">
                    <div class="tab-title">${tab.title}</div>
                    <div class="tab-url">${tab.url}</div>
                  </div>
                `).join('')}
              </div>
            `).join('') : '无标签页数据'}
          </div>
          ` : ''}
        </div>
      `;
    });
    snapshotList.innerHTML = newContent;

    // 添加事件监听器
    snapshotList.querySelectorAll('.restore-btn').forEach(btn => 
      btn.addEventListener('click', () => restoreSnapshot(parseInt(btn.dataset.id))));
    snapshotList.querySelectorAll('.rename-btn').forEach(btn => 
      btn.addEventListener('click', () => renameSnapshot(parseInt(btn.dataset.id))));
    snapshotList.querySelectorAll('.delete-btn').forEach(btn => 
      btn.addEventListener('click', () => deleteSnapshot(parseInt(btn.dataset.id))));
  });
}

function updateAllInfo(isPopup = false) {
  updateStorageUsage();
  updateSnapshotCounts();
  loadSnapshotList(isPopup);
}
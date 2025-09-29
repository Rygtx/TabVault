importScripts('db.js');
// 添加一个辅助函数来生成带时间的日志
function logWithTime(message) {
  const now = new Date();
  const time = now.toTimeString().split(' ')[0]; // 获取时分秒
  console.log(`[${time}] ${message}`);
}


let autoSaveInterval = 31; // 默认31分钟自动保存
let maxAutoSnapshots = 86; // 默认最大自动快照数量为86
let isRestoringSnapshot = false; // 标记是否正在恢复快照
let lastSavedState = null; // 存储上一次保存的状态
let restoringTabsCount = 0; // 正在恢复的标签页计数
let restoredTabsCount = 0; // 已恢复的标签页计数
let tabsToDiscard = new Set(); // 改回使用Set来存储需要丢弃的标签页ID

function getAllWindows(options) {
  return new Promise((resolve, reject) => {
    chrome.windows.getAll(options, (windows) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(windows);
      }
    });
  });
}

function chromeStorageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (items) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(items);
      }
    });
  });
}

function chromeStorageRemove(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

function getAllTabs(queryOptions = {}) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryOptions, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(tabs || []);
      }
    });
  });
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, () => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve({ ok: true });
      }
    });
  });
}

// 添加 MD5 哈希函数
function md5(string) {
  function RotateLeft(lValue, iShiftBits) {
    return (lValue<<iShiftBits) | (lValue>>>(32-iShiftBits));
  }

  function AddUnsigned(lX,lY) {
    var lX4,lY4,lX8,lY8,lResult;
    lX8 = (lX & 0x80000000);
    lY8 = (lY & 0x80000000);
    lX4 = (lX & 0x40000000);
    lY4 = (lY & 0x40000000);
    lResult = (lX & 0x3FFFFFFF)+(lY & 0x3FFFFFFF);
    if (lX4 & lY4) {
      return (lResult ^ 0x80000000 ^ lX8 ^ lY8);
    }
    if (lX4 | lY4) {
      if (lResult & 0x40000000) {
        return (lResult ^ 0xC0000000 ^ lX8 ^ lY8);
      } else {
        return (lResult ^ 0x40000000 ^ lX8 ^ lY8);
      }
    } else {
      return (lResult ^ lX8 ^ lY8);
    }
  }

  function F(x,y,z) { return (x & y) | ((~x) & z); }
  function G(x,y,z) { return (x & z) | (y & (~z)); }
  function H(x,y,z) { return (x ^ y ^ z); }
  function I(x,y,z) { return (y ^ (x | (~z))); }

  function FF(a,b,c,d,x,s,ac) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(F(b, c, d), x), ac));
    return AddUnsigned(RotateLeft(a, s), b);
  };

  function GG(a,b,c,d,x,s,ac) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(G(b, c, d), x), ac));
    return AddUnsigned(RotateLeft(a, s), b);
  };


  function HH(a,b,c,d,x,s,ac) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(H(b, c, d), x), ac));
    return AddUnsigned(RotateLeft(a, s), b);
  };

  function II(a,b,c,d,x,s,ac) {
    a = AddUnsigned(a, AddUnsigned(AddUnsigned(I(b, c, d), x), ac));
    return AddUnsigned(RotateLeft(a, s), b);
  };

  function ConvertToWordArray(string) {
    var lWordCount;
    var lMessageLength = string.length;
    var lNumberOfWords_temp1=lMessageLength + 8;
    var lNumberOfWords_temp2=(lNumberOfWords_temp1-(lNumberOfWords_temp1 % 64))/64;
    var lNumberOfWords = (lNumberOfWords_temp2+1)*16;
    var lWordArray=Array(lNumberOfWords-1);
    var lBytePosition = 0;
    var lByteCount = 0;
    while ( lByteCount < lMessageLength ) {
      lWordCount = (lByteCount-(lByteCount % 4))/4;
      lBytePosition = (lByteCount % 4)*8;
      lWordArray[lWordCount] = (lWordArray[lWordCount] | (string.charCodeAt(lByteCount)<<lBytePosition));
      lByteCount++;
    }
    lWordCount = (lByteCount-(lByteCount % 4))/4;
    lBytePosition = (lByteCount % 4)*8;
    lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80<<lBytePosition);
    lWordArray[lNumberOfWords-2] = lMessageLength<<3;
    lWordArray[lNumberOfWords-1] = lMessageLength>>>29;
    return lWordArray;
  };

  function WordToHex(lValue) {
    var WordToHexValue="",WordToHexValue_temp="",lByte,lCount;
    for (lCount = 0;lCount<=3;lCount++) {
      lByte = (lValue>>>(lCount*8)) & 255;
      WordToHexValue_temp = "0" + lByte.toString(16);
      WordToHexValue = WordToHexValue + WordToHexValue_temp.substr(WordToHexValue_temp.length-2,2);
    }
    return WordToHexValue;
  };

  function Utf8Encode(string) {
    string = string.replace(/\r\n/g,"\n");
    var utftext = "";

    for (var n = 0; n < string.length; n++) {
      var c = string.charCodeAt(n);
      if (c < 128) {
        utftext += String.fromCharCode(c);
      }
      else if((c > 127) && (c < 2048)) {
        utftext += String.fromCharCode((c >> 6) | 192);
        utftext += String.fromCharCode((c & 63) | 128);
      }
      else {
        utftext += String.fromCharCode((c >> 12) | 224);
        utftext += String.fromCharCode(((c >> 6) & 63) | 128);
        utftext += String.fromCharCode((c & 63) | 128);
      }
    }
    return utftext;
  };

  var x=Array();
  var k,AA,BB,CC,DD,a,b,c,d;
  var S11=7, S12=12, S13=17, S14=22;
  var S21=5, S22=9 , S23=14, S24=20;
  var S31=4, S32=11, S33=16, S34=23;
  var S41=6, S42=10, S43=15, S44=21;

  string = Utf8Encode(string);
  x = ConvertToWordArray(string);
  a = 0x67452301; b = 0xEFCDAB89; c = 0x98BADCFE; d = 0x10325476;

  for (k=0;k<x.length;k+=16) {
    AA=a; BB=b; CC=c; DD=d;
    a=FF(a,b,c,d,x[k+0], S11,0xD76AA478);
    d=FF(d,a,b,c,x[k+1], S12,0xE8C7B756);
    c=FF(c,d,a,b,x[k+2], S13,0x242070DB);
    b=FF(b,c,d,a,x[k+3], S14,0xC1BDCEEE);
    a=FF(a,b,c,d,x[k+4], S11,0xF57C0FAF);
    d=FF(d,a,b,c,x[k+5], S12,0x4787C62A);
    c=FF(c,d,a,b,x[k+6], S13,0xA8304613);
    b=FF(b,c,d,a,x[k+7], S14,0xFD469501);
    a=FF(a,b,c,d,x[k+8], S11,0x698098D8);
    d=FF(d,a,b,c,x[k+9], S12,0x8B44F7AF);
    c=FF(c,d,a,b,x[k+10],S13,0xFFFF5BB1);
    b=FF(b,c,d,a,x[k+11],S14,0x895CD7BE);
    a=FF(a,b,c,d,x[k+12],S11,0x6B901122);
    d=FF(d,a,b,c,x[k+13],S12,0xFD987193);
    c=FF(c,d,a,b,x[k+14],S13,0xA679438E);
    b=FF(b,c,d,a,x[k+15],S14,0x49B40821);
    a=GG(a,b,c,d,x[k+1], S21,0xF61E2562);
    d=GG(d,a,b,c,x[k+6], S22,0xC040B340);
    c=GG(c,d,a,b,x[k+11],S23,0x265E5A51);
    b=GG(b,c,d,a,x[k+0], S24,0xE9B6C7AA);
    a=GG(a,b,c,d,x[k+5], S21,0xD62F105D);
    d=GG(d,a,b,c,x[k+10],S22,0x2441453);
    c=GG(c,d,a,b,x[k+15],S23,0xD8A1E681);
    b=GG(b,c,d,a,x[k+4], S24,0xE7D3FBC8);
    a=GG(a,b,c,d,x[k+9], S21,0x21E1CDE6);
    d=GG(d,a,b,c,x[k+14],S22,0xC33707D6);
    c=GG(c,d,a,b,x[k+3], S23,0xF4D50D87);
    b=GG(b,c,d,a,x[k+8], S24,0x455A14ED);
    a=GG(a,b,c,d,x[k+13],S21,0xA9E3E905);
    d=GG(d,a,b,c,x[k+2], S22,0xFCEFA3F8);
    c=GG(c,d,a,b,x[k+7], S23,0x676F02D9);
    b=GG(b,c,d,a,x[k+12],S24,0x8D2A4C8A);
    a=HH(a,b,c,d,x[k+5], S31,0xFFFA3942);
    d=HH(d,a,b,c,x[k+8], S32,0x8771F681);
    c=HH(c,d,a,b,x[k+11],S33,0x6D9D6122);
    b=HH(b,c,d,a,x[k+14],S34,0xFDE5380C);
    a=HH(a,b,c,d,x[k+1], S31,0xA4BEEA44);
    d=HH(d,a,b,c,x[k+4], S32,0x4BDECFA9);
    c=HH(c,d,a,b,x[k+7], S33,0xF6BB4B60);
    b=HH(b,c,d,a,x[k+10],S34,0xBEBFBC70);
    a=HH(a,b,c,d,x[k+13],S31,0x289B7EC6);
    d=HH(d,a,b,c,x[k+0], S32,0xEAA127FA);
    c=HH(c,d,a,b,x[k+3], S33,0xD4EF3085);
    b=HH(b,c,d,a,x[k+6], S34,0x4881D05);
    a=HH(a,b,c,d,x[k+9], S31,0xD9D4D039);
    d=HH(d,a,b,c,x[k+12],S32,0xE6DB99E5);
    c=HH(c,d,a,b,x[k+15],S33,0x1FA27CF8);
    b=HH(b,c,d,a,x[k+2], S34,0xC4AC5665);
    a=II(a,b,c,d,x[k+0], S41,0xF4292244);
    d=II(d,a,b,c,x[k+7], S42,0x432AFF97);
    c=II(c,d,a,b,x[k+14],S43,0xAB9423A7);
    b=II(b,c,d,a,x[k+5], S44,0xFC93A039);
    a=II(a,b,c,d,x[k+12],S41,0x655B59C3);
    d=II(d,a,b,c,x[k+3], S42,0x8F0CCC92);
    c=II(c,d,a,b,x[k+10],S43,0xFFEFF47D);
    b=II(b,c,d,a,x[k+1], S44,0x85845DD1);
    a=II(a,b,c,d,x[k+8], S41,0x6FA87E4F);
    d=II(d,a,b,c,x[k+15],S42,0xFE2CE6E0);
    c=II(c,d,a,b,x[k+6], S43,0xA3014314);
    b=II(b,c,d,a,x[k+13],S44,0x4E0811A1);
    a=II(a,b,c,d,x[k+4], S41,0xF7537E82);
    d=II(d,a,b,c,x[k+11],S42,0xBD3AF235);
    c=II(c,d,a,b,x[k+2], S43,0x2AD7D2BB);
    b=II(b,c,d,a,x[k+9], S44,0xEB86D391);
    a=AddUnsigned(a,AA);
    b=AddUnsigned(b,BB);
    c=AddUnsigned(c,CC);
    d=AddUnsigned(d,DD);
  }

  var temp = WordToHex(a)+WordToHex(b)+WordToHex(c)+WordToHex(d);
  return temp.toLowerCase();
}

// 添加一个新函数来加载上次保存的状态
async function loadLastSavedState() {
  try {
    const storedState = await TabVaultDB.getLastSavedState();
    if (storedState) {
      lastSavedState = storedState;
      logWithTime("已加载上次保存状态哈希: " + lastSavedState);
    } else {
      logWithTime("未找到上次保存状态哈希");
    }
  } catch (error) {
    logWithTime("读取上次保存状态时出错: " + error.message);
  }
}


// 修改 chrome.runtime.onInstalled 监听器
chrome.runtime.onInstalled.addListener(() => {
  (async () => {
    logWithTime("扩展已安装或更新");
    try {
      const storedSettings = await TabVaultDB.getValue("settings", null);
      if (storedSettings) {
        const mergedSettings = { ...TabVaultDB.DEFAULT_SETTINGS, ...storedSettings };
        logWithTime("加载已保存设置:" + JSON.stringify(mergedSettings));
        await updateSettings(mergedSettings);
      } else {
        logWithTime("未找到已保存设置，使用默认值");
        await updateSettings(TabVaultDB.DEFAULT_SETTINGS);
      }
    } catch (error) {
      logWithTime("加载设置时发生错误: " + error.message);
    }

    try {
      const storedState = await TabVaultDB.getLastSavedState();
      if (storedState) {
        lastSavedState = storedState;
        logWithTime("已加载上次保存状态哈希: " + lastSavedState);
      }
    } catch (error) {
      logWithTime("加载上次保存状态时发生错误: " + error.message);
    }
  })();
});


// 修改 checkAndSaveCurrentTabs 函数
async function checkAndSaveCurrentTabs() {
  try {
    const windows = await getAllWindows({ populate: true });
    const currentState = windows.map(window => ({
      id: window.id,
      tabs: window.tabs.map(tab => tab.url)
    }));

    const currentStateHash = md5(JSON.stringify(currentState));

    if (lastSavedState === null || currentStateHash !== lastSavedState) {
      logWithTime("检测到标签页变化，将执行自动保存");
      if (lastSavedState !== null) {
        logWithTime("上次状态哈希: " + lastSavedState);
      }
      logWithTime("当前状态哈希: " + currentStateHash);
      await saveCurrentTabs(true);
    } else {
      logWithTime("标签页无变化，跳过自动保存");
    }
  } catch (error) {
    logWithTime("检查并保存标签页时发生错误: " + error.message);
  }
}


// 修改 saveCurrentTabs 函数
async function saveCurrentTabs(isAuto) {
  logWithTime(`准备保存当前标签页 (自动: ${isAuto})`);
  try {
    const windows = await getAllWindows({ populate: true });
    const hasOpenTabs = windows.some((window) => window.tabs && window.tabs.length > 0);

    if (!hasOpenTabs) {
      logWithTime("未检测到打开的标签页，取消保存");
      return;
    }

    const snapshot = {
      id: Date.now(),
      name: isAuto ? TabVaultDB.SNAPSHOT_NAME_AUTO : TabVaultDB.SNAPSHOT_NAME_MANUAL,
      date: new Date().toISOString(),
      windows: windows.map((window) => ({
        id: window.id,
        tabs: window.tabs.map((tab) => ({ url: tab.url, title: tab.title }))
      }))
    };

    const settings = await TabVaultDB.getSettings();
    const allowedAutoSnapshots = Math.max(
      Number.isFinite(settings.maxAutoSnapshots) ? settings.maxAutoSnapshots : maxAutoSnapshots,
      0
    );
    let trimmedAutoSnapshots = 0;

    await TabVaultDB.updateSnapshots((existing) => {
      const list = Array.isArray(existing) ? existing.slice() : [];
      list.unshift(snapshot);

      if (!isAuto) {
        return list;
      }

      let remaining = allowedAutoSnapshots;
      return list.filter((item) => {
        if (!TabVaultDB.isAutoSnapshotName(item.name)) {
          return true;
        }
        if (remaining > 0) {
          remaining -= 1;
          return true;
        }
        trimmedAutoSnapshots += 1;
        return false;
      });
    });

    if (trimmedAutoSnapshots > 0) {
      logWithTime(`移除了 ${trimmedAutoSnapshots} 个超出的自动快照`);
    }

    const hashInput = snapshot.windows.map((window) => ({
      id: window.id,
      tabs: window.tabs.map((tab) => tab.url)
    }));
    lastSavedState = md5(JSON.stringify(hashInput));
    await TabVaultDB.saveLastSavedState(lastSavedState);
    logWithTime("已保存 lastSavedState: " + lastSavedState);

    chrome.runtime.sendMessage({ action: 'refreshSnapshots' })
      .catch((error) => {
        logWithTime("广播刷新快照消息时出错: " + error.message);
      });
  } catch (error) {
    logWithTime("保存标签页时发生错误: " + error.message);
  }
}


function setupAutoSave() {
  logWithTime(`设置自动保存间隔: ${autoSaveInterval} 分钟`);
  if (autoSaveInterval > 0) {
    chrome.alarms.create("autoSave", { periodInMinutes: autoSaveInterval });
  } else {
    chrome.alarms.clear("autoSave");
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "autoSave") {
    logWithTime("Auto save alarm triggered");
    checkAndSaveCurrentTabs();
  }
});

// 修改事件监听器,在获取到标题后立即丢弃
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (isRestoringSnapshot && tabsToDiscard.has(tabId) && changeInfo.title) {
    chrome.tabs.get(tabId, (tabInfo) => {
      if (chrome.runtime.lastError) {
        logWithTime(`标签页 ${tabId} 不存在,跳过丢弃`);
        tabsToDiscard.delete(tabId);
        restoredTabsCount++;
      } else {
        chrome.tabs.discard(tabId, () => {
          if (chrome.runtime.lastError) {
            logWithTime(`丢弃标签页 ${tabId} 时出错: ${chrome.runtime.lastError.message}`);
          } else {
            logWithTime(`已丢弃恢复的标签页: ${tab.title}`);
          }
          tabsToDiscard.delete(tabId);
          restoredTabsCount++;
        });
      }
      
      if (restoredTabsCount >= restoringTabsCount) {
        isRestoringSnapshot = false;
        restoringTabsCount = 0;
        restoredTabsCount = 0;
        tabsToDiscard.clear();
        logWithTime("所有恢复的标签页都已处理,停止自动丢弃");
      }
    });
  }
});

async function restoreSnapshot(snapshotId) {
  try {
    const snapshot = await TabVaultDB.getSnapshotById(snapshotId);
    if (!snapshot) {
      logWithTime(`未找到快照: ${snapshotId}`);
      return;
    }

    const windowList = Array.isArray(snapshot.windows) ? snapshot.windows : [];

    isRestoringSnapshot = true;
    restoringTabsCount = 0;
    restoredTabsCount = 0;
    tabsToDiscard.clear();

    chrome.windows.getAll({}, (windows) => {
      windows.forEach(window => chrome.windows.remove(window.id));
    });

    windowList.forEach((windowData) => {
      const tabs = Array.isArray(windowData.tabs) ? windowData.tabs : [];
      chrome.windows.create({}, (newWindow) => {
        if (!newWindow || !newWindow.tabs || newWindow.tabs.length === 0) {
          return;
        }
        if (tabs.length === 0) {
          tabsToDiscard.add(newWindow.tabs[0].id);
          restoringTabsCount++;
          return;
        }
        tabs.forEach((tab, tabIndex) => {
          if (tabIndex === 0) {
            chrome.tabs.update(newWindow.tabs[0].id, { url: tab.url }, (updatedTab) => {
              if (updatedTab) {
                tabsToDiscard.add(updatedTab.id);
                restoringTabsCount++;
              }
            });
          } else {
            chrome.tabs.create({ windowId: newWindow.id, url: tab.url }, (createdTab) => {
              if (createdTab) {
                tabsToDiscard.add(createdTab.id);
                restoringTabsCount++;
              }
            });
          }
        });
      });
    });

    const expectedTabs = windowList.reduce((sum, windowData) => sum + (Array.isArray(windowData.tabs) ? windowData.tabs.length : 0), 0);
    logWithTime(`开始恢复快照，预计 ${expectedTabs} 个标签页`);
  } catch (error) {
    logWithTime("恢复快照时发生错误: " + error.message);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  logWithTime("收到消息: " + JSON.stringify(request));
  switch (request.action) {
    case "manualSave":
      saveCurrentTabs(false);
      break;
    case "restoreSnapshot":
      restoreSnapshot(request.snapshotId);
      break;
    case "updateSettings":
      updateSettings(request.settings);
      break;
    case "snapshotsUpdated":
      getAllTabs()
        .then((tabs) => Promise.all(
          tabs.map((tab) =>
            sendMessageToTab(tab.id, { action: "refreshSnapshots" })
              .then((result) => ({ tabId: tab.id, ...result }))
          )
        ))
        .then((results) => {
          results.forEach(({ tabId, ok, error }) => {
            if (!ok && error) {
              logWithTime(`向标签页 ${tabId} 发送消息时出错: ${error}`);
            }
          });
        })
        .catch((error) => {
          logWithTime("广播刷新快照消息时出错: " + error.message);
        });
      break;
  }
  sendResponse({ status: "消息已接收" });
  return true;
});
function applySettings(settings) {
  autoSaveInterval = settings.autoSaveInterval;
  maxAutoSnapshots = settings.maxAutoSnapshots;
  setupAutoSave();
}

async function updateSettings(settings) {
  const resolvedSettings = { ...TabVaultDB.DEFAULT_SETTINGS, ...settings };
  try {
    logWithTime("更新设置: " + JSON.stringify(resolvedSettings));
    applySettings(resolvedSettings);
    await TabVaultDB.saveSettings(resolvedSettings);
    logWithTime("设置已保存");
  } catch (error) {
    logWithTime("保存设置时发生错误: " + error.message);
  }
}

async function migrateFromChromeStorage() {
  try {
    const migrated = await TabVaultDB.getValue('migrationComplete', false);
    if (migrated) {
      return;
    }

    const legacyData = await chromeStorageGet(['snapshots', 'settings', 'lastSavedState']);
    let migratedSomething = false;

    if (Array.isArray(legacyData.snapshots) && legacyData.snapshots.length > 0) {
      const normalizedSnapshots = legacyData.snapshots.map((snapshot) => TabVaultDB.normalizeSnapshot(snapshot));
      await TabVaultDB.setSnapshots(normalizedSnapshots);
      migratedSomething = true;
    }

    if (legacyData.settings && typeof legacyData.settings === 'object') {
      await TabVaultDB.saveSettings(legacyData.settings);
      migratedSomething = true;
    }

    if (legacyData.lastSavedState) {
      await TabVaultDB.saveLastSavedState(legacyData.lastSavedState);
      lastSavedState = legacyData.lastSavedState;
      migratedSomething = true;
    }

    if (migratedSomething) {
      await chromeStorageRemove(['snapshots', 'settings', 'lastSavedState']);
      logWithTime('已将数据从 chrome.storage.local 迁移到 IndexedDB');
    }

    await TabVaultDB.setValue('migrationComplete', true);
  } catch (error) {
    logWithTime('迁移 chrome.storage.local 数据时出错: ' + error.message);
  }
}

async function initializeFromDatabase() {
  try {
    const settings = await TabVaultDB.getSettings();
    applySettings(settings);
  } catch (error) {
    logWithTime('从 IndexedDB 加载设置时出错: ' + error.message);
  }
  await loadLastSavedState();
}

// 初始化时先尝试从旧的 chrome.storage.local 迁移数据，再加载 IndexedDB 中的内容
migrateFromChromeStorage().finally(() => {
  initializeFromDatabase();
});





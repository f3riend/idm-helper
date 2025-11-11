// background.js (CDP destekli)
// Mevcut videos map'ini kullanalım
const videos = {};
const attachedTabs = new Set();

// Basit detect fonksiyonunu kullan (varsayilan detectVideoUrl fonksiyonun burada da olmalı)
function detectVideoUrl(url) {
  if (!url) return null;
  // blacklist gibi kontroller ekle (kısaltılmış)
  if (/\.(js|css|woff2?|ttf|png|jpg|jpeg|gif|svg|webp|ico)$/i.test(url))
    return null;

  if (/master\.m3u8/i.test(url))
    return {
      type: "HLS Master",
      format: "m3u8",
      quality: "adaptive",
      size: null,
    };
  if (/\.m3u8/i.test(url))
    return {
      type: "HLS Playlist",
      format: "m3u8",
      quality: "unknown",
      size: null,
    };
  if (/\.mpd/i.test(url))
    return { type: "DASH", format: "mpd", quality: "adaptive", size: null };
  if (/\.mp4/i.test(url))
    return { type: "MP4", format: "mp4", quality: "unknown", size: null };
  if (/\.webm/i.test(url))
    return { type: "WebM", format: "webm", quality: "unknown", size: null };
  // basit blob/data handler: burada blob: görürsen content-script sayesinde ayrı bildirim gelir
  return null;
}

function updateBadge(tabId) {
  const count = videos[tabId]?.length || 0;
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count), tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#FF6B00", tabId });
  } else {
    chrome.action.setBadgeText({ text: "", tabId });
  }
}

function pushVideo(tabId, videoObj) {
  if (!videos[tabId]) videos[tabId] = [];
  // duplicate kontrolü
  if (videos[tabId].some((v) => v.url === videoObj.url)) return;
  videos[tabId].push(Object.assign({ timestamp: Date.now() }, videoObj));
  updateBadge(tabId);
}

// CDP attach
async function attachDebuggerToTab(tabId) {
  if (attachedTabs.has(tabId)) return;
  try {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      // Hata kontrolü
      if (chrome.runtime.lastError) {
        console.warn("Debugger attach hata:", chrome.runtime.lastError.message);
        return;
      }
      attachedTabs.add(tabId);
      // Enable Network domain
      chrome.debugger.sendCommand({ tabId }, "Network.enable");
      // Optionally enable Page, Fetch etc.
      chrome.debugger.onEvent.addListener(onDebuggerEvent);
      console.log("Debugger attached to tab", tabId);
    });

    // iframe'lerdeki ağ trafiğini de dinle
    chrome.debugger.sendCommand({ tabId }, "Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    });
  } catch (err) {
    console.error("attachDebuggerToTab error:", err);
  }
}

function detachDebuggerFromTab(tabId) {
  if (!attachedTabs.has(tabId)) return;
  try {
    chrome.debugger.detach({ tabId }, () => {
      attachedTabs.delete(tabId);
      console.log("Debugger detached from tab", tabId);
    });
  } catch (err) {
    console.error("detachDebuggerFromTab error:", err);
  }
}

function onDebuggerEvent(source, method, params) {
  // source has {tabId}
  if (!source || !source.tabId) return;
  const tabId = source.tabId;

  // iframe içeriği attach edildiğinde network dinlemeyi aktif et
  if (method === "Target.attachedToTarget") {
    const targetId = params.targetInfo?.targetId;
    if (targetId) {
      chrome.debugger.sendCommand({ tabId }, "Network.enable", {}, () => {});
      console.log(
        "Attached subtarget (iframe):",
        params.targetInfo.url || "(unknown)"
      );
    }
  }

  // Network request events
  if (method === "Network.requestWillBeSent") {
    const req = params.request || {};
    const url = req.url;
    // Eğer request initiator bir fetch/xhr veya parser ise yakala
    const info = detectVideoUrl(url);
    if (info) {
      pushVideo(tabId, { url, ...info, origin: "cdp" });
      console.log("[CDP] Found video:", url);
    } else {
      // Bazı servisler query param'larda token saklar, yine de mp4/m3u8 kontrolü
      if (/\.(m3u8|mp4|mpd|webm)/i.test(url)) {
        pushVideo(tabId, {
          url,
          type: "Unknown",
          format: (url.match(/\.m3u8|\.mpd|\.mp4|\.webm/i) || [])[0].replace(
            ".",
            ""
          ),
          quality: "unknown",
          origin: "cdp",
        });
      }
    }
  }

  // responseReceived gibi ek event'lerde de eklemek isteyebilirsin
  if (method === "Network.responseReceived") {
    const res = params.response || {};
    const url = res.url;
    // content-type'tan video/ tespit et
    if (
      res.headers &&
      /video|application\/vnd\.apple\.mpegurl|application\/dash\+xml/i.test(
        JSON.stringify(res.headers)
      )
    ) {
      const info = detectVideoUrl(url) || {
        type: "response",
        format: "unknown",
        quality: "unknown",
      };
      pushVideo(tabId, { url, ...info, origin: "cdp_response" });
    }
  }
}

// WebRequest fallback (sende zaten vardı) - yine de bırakalım
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { url, tabId } = details;
    const info = detectVideoUrl(url);
    if (info) {
      pushVideo(tabId, { url, ...info, origin: "webRequest" });
      console.log("[webRequest] video:", url);
    }
  },
  { urls: ["<all_urls>"] },
  []
);

// Listen messages from popup/content-script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action, tabId } = request;

  if (action === "getVideos") {
    sendResponse({ videos: videos[tabId] || [] });
  } else if (action === "clearVideos") {
    videos[tabId] = [];
    updateBadge(tabId);
    sendResponse({ success: true });
  } else if (action === "pageDetected") {
    // content-script/injected page'den gelen bildirim
    const tId = sender.tab?.id || request.tabId;
    if (!tId) {
      sendResponse({ ok: false });
      return;
    }
    const payload = request.payload;
    // payload örn: { type: 'blob'|'fetch'|'mediaElement', url, provider }
    const info = detectVideoUrl(payload.url) || {
      type: payload.type || "page",
      format: "unknown",
      quality: "unknown",
    };
    pushVideo(tId, {
      url: payload.url,
      ...info,
      origin: "page",
      provider: payload.provider || null,
    });
    sendResponse({ ok: true });
  }

  return true;
});

// Tab events: attach debugger to active tabs (isteğe göre daha fazla kontrol ekle)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tabId = activeInfo.tabId;
  // attach to newly active tab
  attachDebuggerToTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    attachDebuggerToTab(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  // temizle
  delete videos[tabId];
  updateBadge(tabId);
  detachDebuggerFromTab(tabId);
});

// başlangıçta aktif sekmeye bağlan
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs && tabs[0]) attachDebuggerToTab(tabs[0].id);
});

console.log("✅ background (CDP) initialized");

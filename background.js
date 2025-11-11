// background.js - Gelişmiş Video Yakalama Servisi

const videos = {};
const pendingRequests = new Map(); // URL -> request info

// Video URL tespiti
function detectVideoUrl(url, headers = {}) {
  if (!url) return null;

  // Blacklist - gereksiz dosya türleri ve segmentler
  if (
    /\.(js|css|woff2?|ttf|png|jpg|jpeg|gif|svg|webp|ico|json|xml|ts|m4s|vtt|srt|txt)(\?|$)/i.test(
      url
    )
  ) {
    return null;
  }

  // API, tracking, analytics URL'lerini filtrele
  if (
    /\/(api|analytics|tracking|stats|metrics|beacon|log|telemetry)\//i.test(url)
  ) {
    return null;
  }

  // Ok.ru - Sadece video.m3u8 formatını kabul et
  if (/ok\.ru|okcdn\.ru/i.test(url)) {
    // MP4 direkt URL'leri filtrele (type=1 ve bytes= içerenler)
    if (/type=1/.test(url) && /bytes=/.test(url)) {
      return null;
    }
    // Sadece video.m3u8 kabul et
    if (!/video\.m3u8/.test(url)) {
      return null;
    }
  }

  // Mail.ru - Küçük MP4 reklamlarını filtrele
  if (/mail\.ru/i.test(url) && /\.mp4/.test(url)) {
    const contentLength = parseInt(headers["content-length"] || "0");
    // 5MB altı MP4'leri filtrele (reklam)
    if (contentLength > 0 && contentLength < 5000000) {
      return null;
    }
  }

  // Close provider - .txt thumbnail playlist'lerini filtrele
  if (/cdnimages\d+\.sbs|closeload/i.test(url) && /\.txt/.test(url)) {
    return null;
  }

  // İçerik türü ve boyut - tek seferde tanımla
  const contentType = headers["content-type"] || "";
  const contentLength = parseInt(headers["content-length"] || "0");

  // Çok küçük dosyaları filtrele
  if (contentLength > 0 && contentLength < 50000) {
    // 50KB altı
    return null;
  }

  // Provider detection
  const provider = detectProviderFromUrl(url);

  // Video MIME type'ları
  if (contentType.includes("video/")) {
    return {
      url: url,
      type: "Video",
      format: contentType.split("/")[1]?.split(";")[0] || "unknown",
      quality:
        detectQualityFromSize(contentLength) || detectQualityFromUrl(url),
      size: contentLength || null,
      provider,
    };
  }

  // HLS (m3u8)
  if (
    contentType.includes("application/vnd.apple.mpegurl") ||
    contentType.includes("application/x-mpegurl") ||
    /\.m3u8(\?|$)/i.test(url)
  ) {
    const isMaster = /master\.m3u8|playlist\.m3u8/i.test(url);

    // RapidRame - segment URL'lerini master'a çevir
    let finalUrl = url;
    if (provider === "RapidRame" && /index-f1-v1-a1\.m3u8/.test(url)) {
      finalUrl = url.replace(
        /index-f1-v1-a1\.m3u8.*$/,
        "master.m3u8" + (url.match(/\?.*$/)?.[0] || "")
      );
    }

    // DailyMotion için özel işlem - manifest URL'i video page'e çevir
    if (provider === "DailyMotion") {
      finalUrl = convertDailyMotionUrl(url);
    }

    return {
      url: finalUrl,
      type: isMaster ? "HLS Master" : "HLS Playlist",
      format: "m3u8",
      quality: isMaster ? "adaptive" : detectQualityFromUrl(url),
      size: contentLength || null,
      provider,
      originalUrl: url !== finalUrl ? url : undefined,
    };
  }

  // DASH (mpd)
  if (
    contentType.includes("application/dash+xml") ||
    /\.mpd(\?|$)/i.test(url)
  ) {
    return {
      url: url,
      type: "DASH",
      format: "mpd",
      quality: "adaptive",
      size: contentLength || null,
      provider,
    };
  }

  // URL tabanlı tespit - SADECE tam video dosyaları
  if (/\.(mp4|webm|mkv|avi|mov|flv|m4v)(\?|$)/i.test(url)) {
    // Küçük dosyaları atla (500KB altı)
    if (contentLength > 0 && contentLength < 500000) return null;

    const ext = url
      .match(/\.(mp4|webm|mkv|avi|mov|flv|m4v)(\?|$)/i)[1]
      .toLowerCase();
    return {
      url: url,
      type: ext.toUpperCase(),
      format: ext,
      quality: detectQualityFromUrl(url),
      size: contentLength || null,
      provider,
    };
  }

  return null;
}

// Provider detection from URL
function detectProviderFromUrl(url) {
  if (!url) return null;

  const domain = url.toLowerCase();

  // Provider mapping
  const providers = {
    "sibnet.ru": "Sibnet",
    "mail.ru": "Mail.ru",
    "voe.sx": "Voe",
    "voe.com": "Voe",
    hdvid: "HDVid",
    filemoon: "FileMoon",
    aincrad: "Aincrad",
    abyss: "Abyss",
    uqload: "UQload",
    mp4upload: "MP4Upload",
    "drive.google": "Google Drive",
    jwplayer: "JW Player",
    jwplatform: "JW Player",
    jwpcdn: "JW Player",
    rapidme: "RapidMe",
    rapidrame: "RapidRame",
    dailymotion: "DailyMotion",
    "dai.ly": "DailyMotion",
    "youtube.com": "YouTube",
    "youtu.be": "YouTube",
    "vimeo.com": "Vimeo",
    "facebook.com": "Facebook",
    "fb.watch": "Facebook",
    "twitter.com": "Twitter/X",
    "x.com": "Twitter/X",
    "instagram.com": "Instagram",
    "tiktok.com": "TikTok",
    "twitch.tv": "Twitch",
    dood: "Doodstream",
    streamtape: "Streamtape",
    mixdrop: "Mixdrop",
    vidmoly: "Vidmoly",
    "ok.ru": "Ok.ru",
    "okcdn.ru": "Ok.ru",
    odnoklassniki: "Ok.ru",
    sistenn: "Sistenn",
    vidrame: "Vidrame",
    amaterasu: "AMATERASU",
    closeload: "Close",
    cdnimages: "Close",
  };

  for (const [key, value] of Object.entries(providers)) {
    if (domain.includes(key)) {
      return value;
    }
  }

  return null;
}

// DailyMotion video ID çıkar
function extractDailyMotionId(url) {
  // Manifest URL'den video ID çıkar
  // Örnek: https://www.dailymotion.com/cdn/manifest/video/x8iwa2x.m3u8?...
  // Veya: https://dmxleo.dailymotion.com/cdn/manifest/video/k1C0fqma4KoiHEySQUV.m3u8?...
  const match = url.match(/\/video\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

// DailyMotion URL'i video page'e çevir
function convertDailyMotionUrl(manifestUrl) {
  const videoId = extractDailyMotionId(manifestUrl);
  if (videoId) {
    return `https://www.dailymotion.com/video/${videoId}`;
  }
  return manifestUrl;
}

// URL'den kalite tespiti
function detectQualityFromUrl(url) {
  const patterns = [
    /(\d{3,4})[pP]/, // 720p, 1080p
    /(\d{3,4})x(\d{3,4})/, // 1920x1080
    /[_-](\d{3,4})[_-]/, // _720_, -1080-
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const quality = match[1];
      if (parseInt(quality) >= 360) {
        return quality + "p";
      }
    }
  }

  return "unknown";
}

// Dosya boyutundan kalite tahmini
function detectQualityFromSize(bytes) {
  if (!bytes || bytes < 1000000) return null;

  const mb = bytes / (1024 * 1024);

  if (mb > 500) return "4K";
  if (mb > 200) return "1080p";
  if (mb > 80) return "720p";
  if (mb > 30) return "480p";
  if (mb > 10) return "360p";

  return null;
}

// Video ekleme
function pushVideo(tabId, videoObj) {
  if (!videos[tabId]) videos[tabId] = [];

  // Duplicate kontrolü (URL + kalite bazlı)
  const exists = videos[tabId].some(
    (v) =>
      v.url === videoObj.url ||
      (v.url.split("?")[0] === videoObj.url.split("?")[0] &&
        v.quality === videoObj.quality)
  );

  if (exists) return false;

  // Video ekle
  videos[tabId].push({
    ...videoObj,
    timestamp: Date.now(),
    id: generateId(),
  });

  updateBadge(tabId);
  return true;
}

// Badge güncelleme
function updateBadge(tabId) {
  const count = videos[tabId]?.length || 0;
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count), tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#FF6B00", tabId });
  } else {
    chrome.action.setBadgeText({ text: "", tabId });
  }
}

// Benzersiz ID oluştur
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// WebRequest: Request başlangıcı
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { url, tabId, requestId, type } = details;

    if (tabId < 0) return; // Background request

    // İlk tespit - header'lar gelmeden
    const info = detectVideoUrl(url);
    if (info) {
      pendingRequests.set(requestId, {
        url,
        tabId,
        info,
        timestamp: Date.now(),
      });
    }
  },
  { urls: ["<all_urls>"], types: ["xmlhttprequest", "media", "other"] }
);

// WebRequest: Response header'ları geldi
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const { requestId, responseHeaders, url, tabId } = details;

    if (tabId < 0) return;

    // Header'ları object'e çevir
    const headers = {};
    responseHeaders?.forEach((h) => {
      headers[h.name.toLowerCase()] = h.value;
    });

    // Gelişmiş tespit (header'larla)
    const info = detectVideoUrl(url, headers);

    if (info) {
      pushVideo(tabId, {
        ...info,
        origin: "webRequest",
        headers: {
          "content-type": headers["content-type"],
          "content-length": headers["content-length"],
        },
      });

      // Cleanup
      pendingRequests.delete(requestId);
    }
  },
  { urls: ["<all_urls>"], types: ["xmlhttprequest", "media", "other"] },
  ["responseHeaders"]
);

// WebRequest: Response tamamlandı
chrome.webRequest.onCompleted.addListener(
  (details) => {
    const { requestId } = details;

    // Cleanup pending
    if (pendingRequests.has(requestId)) {
      const pending = pendingRequests.get(requestId);

      // Eğer header'larda yakalanmadıysa şimdi ekle
      if (Date.now() - pending.timestamp < 5000) {
        pushVideo(pending.tabId, {
          ...pending.info,
          origin: "webRequest-fallback",
        });
      }

      pendingRequests.delete(requestId);
    }
  },
  { urls: ["<all_urls>"] }
);

// Content script'ten mesajlar
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action } = request;

  // Video listesi getir
  if (action === "getVideos") {
    const tabId = request.tabId || sender.tab?.id;
    sendResponse({ videos: videos[tabId] || [] });
    return true;
  }

  // Listeyi temizle
  if (action === "clearVideos") {
    const tabId = request.tabId || sender.tab?.id;
    videos[tabId] = [];
    updateBadge(tabId);
    sendResponse({ success: true });
    return true;
  }

  // Page'den video bildirimi
  if (action === "pageDetected") {
    const tabId = sender.tab?.id || request.tabId;
    if (!tabId) {
      sendResponse({ ok: false });
      return true;
    }

    const { payload } = request;

    // Blob URL - SADECE gerçek blob'lar
    if (payload.type === "blob" && payload.size && payload.size > 100000) {
      // 100KB üstü
      pushVideo(tabId, {
        url: payload.blobUrl || payload.url,
        type: "Blob Video",
        format: payload.mimeType?.split("/")[1] || "unknown",
        quality: detectQualityFromSize(payload.size),
        size: payload.size || null,
        origin: "blob",
        blobData: payload.data, // Base64 data (varsa)
        provider: payload.provider || null,
      });
    }
    // MediaSource - MSE buffer bilgisi
    else if (payload.type === "mediaSource" && payload.mimeType) {
      // MSE için sadece bilgilendirme, URL yok
      const format = payload.mimeType.split("/")[1]?.split(";")[0] || "unknown";
      pushVideo(tabId, {
        url: `mediaSource://${format}_${Date.now()}`, // Unique identifier
        type: "MediaSource (MSE)",
        format: format,
        quality: "unknown",
        size: null,
        origin: "mse",
        mimeType: payload.mimeType,
        provider: payload.provider || null,
        note: "MSE videoları doğrudan indirilemez, tarayıcı media recorder kullanılmalı",
      });
    }
    // Video element
    else if (payload.type === "videoElement" && payload.url) {
      // Blob ve data URL'leri filtrele
      if (payload.url.startsWith("blob:") || payload.url.startsWith("data:")) {
        sendResponse({ ok: false });
        return true;
      }

      const info = detectVideoUrl(payload.url);
      if (info) {
        pushVideo(tabId, {
          ...info,
          origin: "videoElement",
          provider: payload.provider || info.provider,
        });
      }
    }
    // Provider embed
    else if (payload.type === "embed" && payload.url) {
      pushVideo(tabId, {
        url: payload.url,
        type: "Embed",
        format: "iframe",
        quality: "unknown",
        size: null,
        origin: "embed",
        provider: payload.provider,
      });
    }
    // Fetch/XHR
    else if (
      (payload.type === "fetch" || payload.type === "xhr") &&
      payload.url
    ) {
      const info = detectVideoUrl(payload.url);
      if (info) {
        pushVideo(tabId, {
          ...info,
          origin: payload.type,
          provider: payload.provider || info.provider,
        });
      }
    }

    sendResponse({ ok: true });
    return true;
  }

  // M3U8 parsing isteği
  if (action === "parseM3U8") {
    parseM3U8(request.url)
      .then((variants) => {
        sendResponse({ variants });
      })
      .catch((err) => {
        sendResponse({ error: err.message });
      });
    return true;
  }

  return false;
});

// M3U8 Parser
async function parseM3U8(url) {
  try {
    const response = await fetch(url);
    const text = await response.text();
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const variants = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Master playlist - variant stream
      if (line.startsWith("#EXT-X-STREAM-INF:")) {
        const resolution = line.match(/RESOLUTION=(\d+x\d+)/)?.[1];
        const bandwidth = line.match(/BANDWIDTH=(\d+)/)?.[1];
        const nextLine = lines[i + 1];

        if (nextLine && !nextLine.startsWith("#")) {
          const variantUrl = new URL(nextLine, url).href;
          variants.push({
            url: variantUrl,
            resolution: resolution || "unknown",
            bandwidth: bandwidth ? parseInt(bandwidth) : null,
            quality: resolution ? resolution.split("x")[1] + "p" : "unknown",
          });
        }
      }
    }

    return variants;
  } catch (err) {
    console.error("M3U8 parse error:", err);
    throw err;
  }
}

// Tab olayları
chrome.tabs.onRemoved.addListener((tabId) => {
  delete videos[tabId];
  pendingRequests.forEach((value, key) => {
    if (value.tabId === tabId) {
      pendingRequests.delete(key);
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    // Sayfa yenilendiğinde videoları temizle
    videos[tabId] = [];
    updateBadge(tabId);
  }
});

// Cleanup - eski pending request'leri temizle
setInterval(() => {
  const now = Date.now();
  pendingRequests.forEach((value, key) => {
    if (now - value.timestamp > 30000) {
      // 30 saniye
      pendingRequests.delete(key);
    }
  });
}, 60000); // Her dakika

console.log("✅ IDM Helper background service started");

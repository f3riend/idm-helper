// Tab başına video listesi
const videos = {};

// Network requestleri dinle
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { url, tabId, type } = details;

    // Video URL'i mi kontrol et
    const videoInfo = detectVideoUrl(url);
    if (!videoInfo) return;

    // Tab'e kaydet
    if (!videos[tabId]) {
      videos[tabId] = [];
    }

    // Duplicate kontrolü
    const exists = videos[tabId].some((v) => v.url === url);
    if (exists) return;

    // Ekle
    videos[tabId].push({
      url: url,
      type: videoInfo.type,
      format: videoInfo.format,
      quality: videoInfo.quality,
      size: videoInfo.size,
      timestamp: Date.now(),
    });

    // Badge güncelle
    updateBadge(tabId);

    console.log(`[${videoInfo.type}] ${url}`);
  },
  { urls: ["<all_urls>"] }
);

// Video URL algılama (VDH benzeri)
function detectVideoUrl(url) {
  // 1. Gereksiz dosyaları filtrele
  const blacklist = [
    /\.js$/i,
    /\.css$/i,
    /\.woff2?$/i,
    /\.ttf$/i,
    /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i,
    /analytics|counter|stat|track|beacon|pixel/i,
    /font|advertisement|banner|ad\.|ads\./i,
    /google-analytics|googletagmanager/i,
  ];

  if (blacklist.some((pattern) => pattern.test(url))) {
    return null;
  }

  // 2. Video formatlarını algıla

  // HLS Master Playlist (en önemli)
  if (/master\.m3u8/i.test(url)) {
    return {
      type: "HLS Master",
      format: "m3u8",
      quality: "adaptive",
      size: null,
    };
  }

  // HLS Playlist
  if (/\.m3u8/i.test(url)) {
    const quality = extractQuality(url);
    return {
      type: "HLS Playlist",
      format: "m3u8",
      quality: quality || "unknown",
      size: null,
    };
  }

  // DASH Manifest
  if (/\.mpd/i.test(url)) {
    return {
      type: "DASH",
      format: "mpd",
      quality: "adaptive",
      size: null,
    };
  }

  // MP4 (CDN pattern'leri)
  if (/\.mp4/i.test(url)) {
    // Embed placeholder'ları filtrele
    if (/\/v\/.*\.mp4/i.test(url) && !/dv\d+/i.test(url)) {
      return null; // video.sibnet.ru/v/xxx gibi placeholder'lar
    }

    const quality = extractQuality(url);
    return {
      type: "MP4",
      format: "mp4",
      quality: quality || "unknown",
      size: null,
    };
  }

  // MKV
  if (/\.mkv/i.test(url)) {
    return {
      type: "MKV",
      format: "mkv",
      quality: extractQuality(url) || "unknown",
      size: null,
    };
  }

  // WebM
  if (/\.webm/i.test(url)) {
    return {
      type: "WebM",
      format: "webm",
      quality: extractQuality(url) || "unknown",
      size: null,
    };
  }

  return null;
}

// URL'den kalite çıkar (1080p, 720p vs.)
function extractQuality(url) {
  const qualityPatterns = [
    /1920x1080|1080p/i,
    /1280x720|720p/i,
    /854x480|480p/i,
    /640x360|360p/i,
  ];

  if (qualityPatterns[0].test(url)) return "1080p";
  if (qualityPatterns[1].test(url)) return "720p";
  if (qualityPatterns[2].test(url)) return "480p";
  if (qualityPatterns[3].test(url)) return "360p";

  return null;
}

// Badge güncelle
function updateBadge(tabId) {
  const count = videos[tabId]?.length || 0;
  if (count > 0) {
    chrome.action.setBadgeText({ text: count.toString(), tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#FF6B00", tabId }); // VDH turuncu rengi
  }
}

// Mesaj dinle
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action, tabId } = request;

  if (action === "getVideos") {
    sendResponse({ videos: videos[tabId] || [] });
  } else if (action === "clearVideos") {
    videos[tabId] = [];
    chrome.action.setBadgeText({ text: "", tabId });
    sendResponse({ success: true });
  } else if (action === "videoDetectedInjected") {
    const url = request.url;
    const videoInfo = detectVideoUrl(url);
    if (!videoInfo) return;

    const tabId = sender?.tab?.id;
    if (!tabId) return;

    if (!videos[tabId]) videos[tabId] = [];
    if (videos[tabId].some((v) => v.url === url)) return;

    videos[tabId].push({
      url,
      type: videoInfo.type,
      format: videoInfo.format,
      quality: videoInfo.quality,
      size: videoInfo.size,
      timestamp: Date.now(),
    });

    updateBadge(tabId);
  }

  return true;
});

// Tab kapandığında temizle
chrome.tabs.onRemoved.addListener((tabId) => {
  delete videos[tabId];
});

console.log("✅ Video Grabber başlatıldı");

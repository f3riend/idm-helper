// background.js - Sadeleştirilmiş Video Yakalama

const videos = {};

console.log("✅ Background script initialized");

// ffmpeg komutu oluştur
function generateFfmpegCommand(url) {
  return `ffmpeg \\
  -reconnect 1 \\
  -reconnect_at_eof 1 \\
  -reconnect_streamed 1 \\
  -reconnect_delay_max 5 \\
  -user_agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" \\
  -http_persistent 0 \\
  -i "${url}" \\
  -c:v libx264 -preset fast -crf 23 \\
  -c:a aac -b:a 128k \\
  output.mp4`;
}

// yt-dlp komutu oluştur
function generateYtdlpCommand(url) {
  return `yt-dlp \\
  --no-check-certificate \\
  --no-warnings \\
  --ignore-errors \\
  --no-abort-on-error \\
  --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \\
  --referer "${getReferer(url)}" \\
  --retries 10 \\
  --fragment-retries 10 \\
  --concurrent-fragments 5 \\
  -o "%(title)s.%(ext)s" \\
  "${url}"`;
}

// URL'den referer çıkar
function getReferer(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.host}/`;
  } catch {
    return url;
  }
}

// Video türünü tespit et
function detectVideoType(url) {
  if (url.includes(".mp4")) return "MP4";
  if (url.includes(".m3u8")) return "M3U8";
  if (url.includes("master.txt")) return "HLS Master";
  if (url.includes(".webm")) return "WEBM";
  if (url.includes(".mkv")) return "MKV";
  if (url.includes(".mpd")) return "DASH";
  return "Video";
}

// Video URL mi kontrol et
function isVideoUrl(url, headers = {}) {
  const contentType = headers["content-type"] || "";
  const contentLength = parseInt(headers["content-length"] || "0");
  const videoType = detectVideoType(url);

  // HTML veya text sayfalarını filtrele (master.txt hariç)
  if (contentType.includes("text/html") || contentType.includes("text/plain")) {
    if (!url.includes("master.txt")) {
      return null;
    }
  }

  // HLS (m3u8 veya master.txt)
  if (
    contentType.includes("mpegurl") ||
    url.includes(".m3u8") ||
    url.includes("master.txt")
  ) {
    return {
      url: url,
      type: videoType,
      size: contentLength,
    };
  }

  // DASH (mpd)
  if (contentType.includes("dash+xml") || url.includes(".mpd")) {
    return {
      url: url,
      type: videoType,
      size: contentLength,
    };
  }

  // MP4 ve diğer video formatları
  if (
    contentType.includes("video/") ||
    /\.(mp4|webm|mkv|avi)(\?|$)/i.test(url)
  ) {
    // Çok küçük dosyaları atla (muhtemelen reklam)
    if (contentLength > 0 && contentLength < 1000000) return null; // 1MB altı

    return {
      url: url,
      type: videoType,
      size: contentLength,
    };
  }

  return null;
}

// Video ekle
function addVideo(tabId, videoData) {
  if (!videos[tabId]) videos[tabId] = [];

  // Aynı URL varsa ekleme
  const exists = videos[tabId].some((v) => v.url === videoData.url);
  if (exists) return;

  const video = {
    ...videoData,
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
    timestamp: Date.now(),
  };

  videos[tabId].push(video);
  updateBadge(tabId);

  // İlk video tespitinde konsolu temizle
  if (videos[tabId].length === 1) {
    console.clear();
    console.log("🎬 Video Tespit Başladı\n");
  }

  // Komutları konsola yazdır
  const ytdlpCmd = generateYtdlpCommand(videoData.url);
  const ffmpegCmd = generateFfmpegCommand(videoData.url);

  console.log(`
${"-".repeat(80)}
🎬 Video Tespit Edildi
📎 Tip: ${videoData.type}
📊 Boyut: ${formatSize(videoData.size)}
🔗 URL: ${videoData.url}

⬇️  yt-dlp komutu:
${ytdlpCmd}

📹 ffmpeg komutu:
${ffmpegCmd}
${"-".repeat(80)}
  `);
}

// Dosya boyutunu formatla
function formatSize(bytes) {
  if (!bytes) return "Bilinmiyor";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
  if (bytes < 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

// Badge güncelle
function updateBadge(tabId) {
  const count = videos[tabId]?.length || 0;
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count), tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#FF6B00", tabId });
  } else {
    chrome.action.setBadgeText({ text: "", tabId });
  }
}

// HTTP isteklerini dinle (Erken tespit)
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { url, tabId } = details;

    if (tabId < 0) return;

    // Hızlı tespit için log
    if (url.includes(".mp4")) {
      console.log("🎯 MP4 Video URL Found:", url);
    }

    if (url.includes(".m3u8")) {
      console.log("🎯 M3U8 Video URL Found:", url);
    }

    if (url.includes("master.txt")) {
      console.log("🎯 HLS Master URL Found:", url);
    }
  },
  { urls: ["<all_urls>"], types: ["xmlhttprequest", "media", "other"] },
);

// HTTP yanıt header'larını dinle (Detaylı tespit)
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    const { url, tabId, responseHeaders } = details;

    if (tabId < 0) return;

    // Header'ları object'e çevir
    const headers = {};
    responseHeaders?.forEach((h) => {
      headers[h.name.toLowerCase()] = h.value;
    });

    // Video URL mi kontrol et
    const videoData = isVideoUrl(url, headers);
    if (videoData) {
      addVideo(tabId, videoData);
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"],
);

// Popup'tan ve Content Script'ten mesajlar
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = request.tabId || sender.tab?.id;

  // Video listesi getir
  if (request.action === "getVideos") {
    sendResponse({ videos: videos[tabId] || [] });
    return true;
  }

  // Listeyi temizle
  if (request.action === "clearVideos") {
    videos[tabId] = [];
    updateBadge(tabId);
    sendResponse({ success: true });
    return true;
  }

  // Komutları kopyala
  if (request.action === "copyCommand") {
    const video = videos[tabId]?.find((v) => v.id === request.videoId);
    if (video) {
      const ytdlp = generateYtdlpCommand(video.url);
      const ffmpeg = generateFfmpegCommand(video.url);
      sendResponse({ ytdlp, ffmpeg });
    }
    return true;
  }

  // Content Script'ten gelen video bildirimleri
  if (request.action === "pageDetected") {
    const { payload } = request;

    if (!tabId || tabId < 0) {
      sendResponse({ ok: false });
      return true;
    }

    // Video türünü tespit et
    const videoType = detectVideoType(payload.url);

    // Video bilgisini ekle
    addVideo(tabId, {
      url: payload.url,
      type: videoType,
      size: null,
      origin: payload.type,
    });

    sendResponse({ ok: true });
    return true;
  }

  // Python API'ye test isteği gönder
  if (request.action === "testUrl") {
    const video = videos[tabId]?.find((v) => v.id === request.videoId);
    if (video) {
      // Burada Python API'ye istek atılacak
      sendResponse({ url: video.url });
    }
    return true;
  }
});

// Tab kapandığında temizle
chrome.tabs.onRemoved.addListener((tabId) => {
  delete videos[tabId];
});

// Sayfa yenilendiğinde temizle
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    videos[tabId] = [];
    updateBadge(tabId);
  }
});

console.log("✅ Video Yakalayıcı başlatıldı");

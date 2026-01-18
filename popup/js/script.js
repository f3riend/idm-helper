console.log("✅ Popup script initialized");

// popup.js - Video listesi UI

let currentTabId = null;

// Sayfa yüklendiğinde
document.addEventListener("DOMContentLoaded", async () => {
  // Aktif tab ID'sini al
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;

  // Video listesini yükle
  loadVideos();

  // Temizle butonu
  document.getElementById("clearBtn").addEventListener("click", clearVideos);
});

// Video listesini yükle
function loadVideos() {
  chrome.runtime.sendMessage(
    { action: "getVideos", tabId: currentTabId },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("Mesaj hatası:", chrome.runtime.lastError);
        return;
      }

      const videos = response.videos || [];
      renderVideos(videos);
    },
  );
}

// Video listesini render et
function renderVideos(videos) {
  const container = document.getElementById("container");
  const emptyState = document.getElementById("emptyState");

  if (videos.length === 0) {
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";
  container.innerHTML = "";

  videos.forEach((video) => {
    const item = createVideoItem(video);
    container.appendChild(item);
  });
}

// Video item elementi oluştur
function createVideoItem(video) {
  const div = document.createElement("div");
  div.className = "video-item";

  div.innerHTML = `
    <div class="video-header">
      <span class="video-type">${video.type}</span>
      <span class="video-size">${formatSize(video.size)}</span>
    </div>
    <div class="video-url">${truncateUrl(video.url)}</div>
    <div class="actions">
      <button class="btn btn-ytdlp" data-id="${video.id}" data-cmd="ytdlp">
        📥 yt-dlp
      </button>
      <button class="btn btn-ffmpeg" data-id="${video.id}" data-cmd="ffmpeg">
        🎞️ ffmpeg
      </button>
      <button class="btn btn-test" data-id="${video.id}" data-cmd="test">
        🧪 Test
      </button>
      <button class="btn btn-url" data-id="${video.id}" data-cmd="url">
        🔗 URL
      </button>
    </div>
  `;

  // Buton event'leri
  div.querySelectorAll(".btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const videoId = e.target.dataset.id;
      const cmd = e.target.dataset.cmd;
      handleAction(videoId, cmd);
    });
  });

  return div;
}

// Buton aksiyonları
function handleAction(videoId, action) {
  if (action === "url") {
    // Sadece URL'i kopyala
    const video = getVideoById(videoId);
    if (video) {
      copyToClipboard(video.url);
      showToast("URL kopyalandı! ✓");
    }
    return;
  }

  if (action === "test") {
    // Python API'ye test isteği gönder
    chrome.runtime.sendMessage(
      { action: "testUrl", tabId: currentTabId, videoId: videoId },
      (response) => {
        if (response && response.url) {
          // Burada Python API'ye istek atılacak
          // Örnek: fetch('http://localhost:5000/test', { method: 'POST', body: JSON.stringify({ url: response.url }) })
          showToast("Test URL'i: " + response.url);
          console.log("Test URL:", response.url);
        }
      },
    );
    return;
  }

  // yt-dlp veya ffmpeg komutu kopyala
  chrome.runtime.sendMessage(
    { action: "copyCommand", tabId: currentTabId, videoId: videoId },
    (response) => {
      if (response) {
        const command = action === "ytdlp" ? response.ytdlp : response.ffmpeg;
        copyToClipboard(command);
        showToast(
          `${action === "ytdlp" ? "yt-dlp" : "ffmpeg"} komutu kopyalandı! ✓`,
        );
      }
    },
  );
}

// Video ID'ye göre video bul (lokal cache için)
function getVideoById(videoId) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "getVideos", tabId: currentTabId },
      (response) => {
        const video = response.videos.find((v) => v.id === videoId);
        resolve(video);
      },
    );
  });
}

// Videoları temizle
function clearVideos() {
  chrome.runtime.sendMessage(
    { action: "clearVideos", tabId: currentTabId },
    () => {
      loadVideos();
      showToast("Liste temizlendi! ✓");
    },
  );
}

// Clipboard'a kopyala
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch((err) => {
    console.error("Kopyalama hatası:", err);
  });
}

// Toast mesajı göster
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}

// URL'i kısalt
function truncateUrl(url) {
  if (url.length > 60) {
    return url.substring(0, 60) + "...";
  }
  return url;
}

// Boyut formatla
function formatSize(bytes) {
  if (!bytes) return "Bilinmiyor";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
  if (bytes < 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

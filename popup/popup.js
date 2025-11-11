// popup.js - Popup UI Logic

let currentTab;
let allVideos = [];
let currentFilter = { type: "all", quality: "all" };

// Başlangıç
document.addEventListener("DOMContentLoaded", async () => {
  // Aktif tab'ı al
  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Event listener'lar
  document.getElementById("clearBtn").addEventListener("click", clearVideos);
  document
    .getElementById("refreshBtn")
    .addEventListener("click", refreshVideos);
  document
    .getElementById("filterType")
    .addEventListener("change", handleFilterChange);
  document
    .getElementById("filterQuality")
    .addEventListener("change", handleFilterChange);

  // Videoları yükle
  await loadVideos();
});

// Videoları yükle
async function loadVideos() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: "getVideos",
      tabId: currentTab.id,
    });

    allVideos = response.videos || [];
    displayVideos(allVideos);
  } catch (err) {
    console.error("Video yükleme hatası:", err);
    updateStatus("Hata: Videolar yüklenemedi", "error");
  }
}

// Videoları yenile
async function refreshVideos() {
  const btn = document.getElementById("refreshBtn");
  btn.classList.add("loading");

  await loadVideos();

  setTimeout(() => {
    btn.classList.remove("loading");
  }, 500);
}

// Filtre değişikliği
function handleFilterChange() {
  currentFilter.type = document.getElementById("filterType").value;
  currentFilter.quality = document.getElementById("filterQuality").value;

  const filtered = filterVideos(allVideos);
  displayVideos(filtered);
}

// Videoları filtrele
function filterVideos(videos) {
  return videos.filter((video) => {
    // Tip filtresi
    if (currentFilter.type !== "all") {
      const format = video.format?.toLowerCase();
      if (currentFilter.type === "blob" && video.origin !== "blob")
        return false;
      if (currentFilter.type === "mse" && video.origin !== "mse") return false;
      if (currentFilter.type !== "blob" && currentFilter.type !== "mse") {
        if (format !== currentFilter.type) return false;
      }
    }

    // Kalite filtresi
    if (currentFilter.quality !== "all") {
      const quality = video.quality?.toLowerCase();
      if (
        currentFilter.quality === "4k" &&
        !quality?.includes("4k") &&
        !quality?.includes("2160")
      )
        return false;
      if (
        currentFilter.quality !== "4k" &&
        !quality?.includes(currentFilter.quality)
      )
        return false;
    }

    return true;
  });
}

// Videoları göster
function displayVideos(videos) {
  const container = document.getElementById("videoList");

  if (videos.length === 0) {
    container.innerHTML = `
      <div class="empty">
        <div class="empty-icon">📹</div>
        <p>Video bulunamadı</p>
        <small>${
          allVideos.length > 0
            ? "Filtrelerinizi değiştirin"
            : "Bir videoyu oynatın veya sayfayı yenileyin"
        }</small>
      </div>
    `;
    updateStatus(
      allVideos.length > 0
        ? `${videos.length} / ${allVideos.length} video gösteriliyor`
        : "Video bulunamadı"
    );
    return;
  }

  // Videoları sırala (en yeni önce)
  const sorted = [...videos].sort((a, b) => b.timestamp - a.timestamp);

  // Render
  container.innerHTML = "";
  sorted.forEach((video) => {
    const element = createVideoElement(video);
    container.appendChild(element);
  });

  updateStatus(`${videos.length} video bulundu`);
}

// Video elementi oluştur
function createVideoElement(video) {
  const item = document.createElement("div");
  item.className = "video-item";

  // Format ve tip
  const format = video.format || "unknown";
  const type = video.type || "Video";
  const quality = video.quality || "unknown";
  const size = video.size ? formatBytes(video.size) : null;

  // Header
  const header = document.createElement("div");
  header.className = "video-header";
  header.innerHTML = `
    <div class="video-type">
      <span class="type-badge ${format}">${format.toUpperCase()}</span>
      ${
        video.provider
          ? `<span style="font-size: 11px; color: #6c757d;">via ${video.provider}</span>`
          : ""
      }
    </div>
    <span class="quality-badge ${isHD(quality) ? "hd" : ""}">${quality}</span>
  `;

  // Body
  const body = document.createElement("div");
  body.className = "video-body";

  // URL
  const urlDiv = document.createElement("div");
  urlDiv.className = "video-url";
  urlDiv.textContent = shortenUrl(video.url);
  urlDiv.title = video.url;

  // Meta bilgiler
  const meta = document.createElement("div");
  meta.className = "video-meta";
  meta.innerHTML = `
    ${size ? `<span class="meta-item">📦 ${size}</span>` : ""}
    <span class="meta-item">🕐 ${formatTime(video.timestamp)}</span>
    <span class="meta-item">📍 ${video.origin || "unknown"}</span>
  `;

  // Actions
  const actions = document.createElement("div");
  actions.className = "video-actions";

  // Kopyala butonu
  const copyBtn = document.createElement("button");
  copyBtn.className = "btn btn-copy";
  copyBtn.innerHTML = "📋 Kopyala";
  copyBtn.onclick = () => copyUrl(video.url, copyBtn);

  // İndir butonu
  const downloadBtn = document.createElement("button");
  downloadBtn.className = "btn btn-download";
  downloadBtn.innerHTML = "⬇️ İndir";
  downloadBtn.onclick = () => downloadVideo(video);

  actions.appendChild(copyBtn);
  actions.appendChild(downloadBtn);

  // M3U8 parse butonu
  if (format === "m3u8" && video.type === "HLS Master") {
    const parseBtn = document.createElement("button");
    parseBtn.className = "btn btn-parse";
    parseBtn.innerHTML = "🔍 Varyantları Göster";
    parseBtn.onclick = () => parseM3U8(video, body);
    actions.appendChild(parseBtn);
  }

  body.appendChild(urlDiv);
  body.appendChild(meta);
  body.appendChild(actions);

  item.appendChild(header);
  item.appendChild(body);

  return item;
}

// M3U8 parse et
async function parseM3U8(video, container) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: "parseM3U8",
      url: video.url,
    });

    if (response.error) {
      alert("M3U8 parse hatası: " + response.error);
      return;
    }

    const variants = response.variants || [];
    if (variants.length === 0) {
      alert("Varyant bulunamadı");
      return;
    }

    // Varyantları göster
    let variantsDiv = container.querySelector(".variants");
    if (variantsDiv) {
      variantsDiv.remove();
      return;
    }

    variantsDiv = document.createElement("div");
    variantsDiv.className = "variants";

    const header = document.createElement("div");
    header.className = "variants-header";
    header.textContent = `${variants.length} Varyant Bulundu`;
    variantsDiv.appendChild(header);

    variants.forEach((variant) => {
      const item = document.createElement("div");
      item.className = "variant-item";

      const info = document.createElement("div");
      info.className = "variant-info";
      info.innerHTML = `
        <span class="variant-quality">${variant.quality}</span>
        ${
          variant.bandwidth
            ? `<span class="variant-bandwidth">${formatBitrate(
                variant.bandwidth
              )}</span>`
            : ""
        }
      `;

      const actions = document.createElement("div");
      actions.className = "variant-actions";

      const copyBtn = document.createElement("button");
      copyBtn.className = "btn-small copy";
      copyBtn.textContent = "Kopyala";
      copyBtn.onclick = () => copyUrl(variant.url, copyBtn);

      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn-small download";
      downloadBtn.textContent = "İndir";
      downloadBtn.onclick = () =>
        downloadVideo({ ...video, url: variant.url, quality: variant.quality });

      actions.appendChild(copyBtn);
      actions.appendChild(downloadBtn);

      item.appendChild(info);
      item.appendChild(actions);
      variantsDiv.appendChild(item);
    });

    container.appendChild(variantsDiv);
  } catch (err) {
    console.error("M3U8 parse error:", err);
    alert("M3U8 parse hatası");
  }
}

// URL kopyala
async function copyUrl(url, button) {
  try {
    await navigator.clipboard.writeText(url);
    const original = button.innerHTML;
    button.innerHTML = "✓ Kopyalandı";
    button.classList.add("success");

    setTimeout(() => {
      button.innerHTML = original;
      button.classList.remove("success");
    }, 2000);
  } catch (err) {
    console.error("Kopyalama hatası:", err);
    alert("Kopyalama başarısız");
  }
}

// Video indir
function downloadVideo(video) {
  const format = video.format?.toLowerCase();

  // MSE - indirilemez, bilgilendirme göster
  if (video.origin === "mse") {
    alert(
      "⚠️ MediaSource (MSE) Videosu\n\nBu video tarayıcı tarafından MSE teknolojisi ile akış halinde oynatılıyor.\n\nDoğrudan indirmek mümkün değil. Alternatifler:\n\n1. Tarayıcı eklentisi ile ekran kaydı\n2. OBS Studio ile kayıt\n3. Browser developer tools ile network kaydı\n\nURL kopyalandı (eğer varsa)."
    );
    if (video.url && !video.url.startsWith("mediaSource://")) {
      navigator.clipboard.writeText(video.url);
    }
    return;
  }

  // HLS/DASH - yt-dlp komutu
  if (format === "m3u8" || format === "mpd") {
    const cmd = `yt-dlp "${video.url}"`;
    navigator.clipboard.writeText(cmd);
    alert(
      "📋 yt-dlp komutu kopyalandı!\n\nTerminale yapıştırarak videoyu indirebilirsiniz.\n\nyt-dlp yüklü değilse:\npip install yt-dlp"
    );
    return;
  }

  // Blob - data URL'i indir
  if (video.origin === "blob" && video.blobData) {
    const link = document.createElement("a");
    link.href = video.blobData;
    link.download = `video_${Date.now()}.${format || "mp4"}`;
    link.click();
    updateStatus("Blob videosu indiriliyor...");
    return;
  }

  // Normal video - yeni sekmede aç
  chrome.tabs.create({ url: video.url, active: false });
  updateStatus("Video yeni sekmede açıldı");
}

// Listeyi temizle
async function clearVideos() {
  if (!confirm("Tüm videoları temizlemek istediğinize emin misiniz?")) {
    return;
  }

  await chrome.runtime.sendMessage({
    action: "clearVideos",
    tabId: currentTab.id,
  });

  allVideos = [];
  displayVideos([]);
}

// Yardımcı fonksiyonlar
function shortenUrl(url) {
  if (url.length <= 70) return url;
  return url.substring(0, 35) + "..." + url.substring(url.length - 35);
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatBitrate(bps) {
  const kbps = bps / 1000;
  if (kbps >= 1000) {
    return (kbps / 1000).toFixed(1) + " Mbps";
  }
  return Math.round(kbps) + " kbps";
}

function formatTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return "az önce";
  if (seconds < 3600) return Math.floor(seconds / 60) + " dk önce";
  if (seconds < 86400) return Math.floor(seconds / 3600) + " saat önce";

  return new Date(timestamp).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isHD(quality) {
  if (!quality) return false;
  const q = quality.toLowerCase();
  return (
    q.includes("1080") ||
    q.includes("720") ||
    q.includes("4k") ||
    q.includes("2160")
  );
}

function updateStatus(message, type = "normal") {
  const status = document.getElementById("status");
  status.textContent = message;
  status.style.color = type === "error" ? "#dc3545" : "#6c757d";
}

let currentTab;

document.addEventListener("DOMContentLoaded", async () => {
  // Aktif tab'ı al
  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Videoları yükle
  loadVideos();

  // Temizle butonu
  document.getElementById("clearBtn").addEventListener("click", clearVideos);
});

async function loadVideos() {
  const response = await chrome.runtime.sendMessage({
    action: "getVideos",
    tabId: currentTab.id,
  });

  displayVideos(response.videos || []);
}

function displayVideos(videos) {
  const container = document.getElementById("videoList");

  if (videos.length === 0) {
    container.innerHTML = '<div class="empty">Henüz video bulunamadı</div>';
    document.getElementById("status").textContent = "Video bulunamadı";
    return;
  }

  // Kaliteye göre grupla (VDH benzeri)
  const grouped = groupByQuality(videos);

  container.innerHTML = "";

  // Her grup için render
  Object.entries(grouped).forEach(([key, items]) => {
    const group = createVideoGroup(key, items);
    container.appendChild(group);
  });

  document.getElementById(
    "status"
  ).textContent = `${videos.length} video bulundu`;
}

function groupByQuality(videos) {
  const groups = {};

  videos.forEach((video) => {
    // Master m3u8'ler ayrı grup
    if (video.type === "HLS Master") {
      const key = "master_m3u8";
      if (!groups[key]) groups[key] = [];
      groups[key].push(video);
      return;
    }

    // MP4'leri kaliteye göre grupla
    if (video.format === "mp4") {
      const key = `mp4_${video.quality}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(video);
      return;
    }

    // Diğerleri
    const key = video.type.toLowerCase().replace(/\s+/g, "_");
    if (!groups[key]) groups[key] = [];
    groups[key].push(video);
  });

  return groups;
}

function createVideoGroup(key, items) {
  const group = document.createElement("div");
  group.className = "video-group";

  // Header
  const header = document.createElement("div");
  header.className = "group-header";

  const title = document.createElement("div");
  title.className = "group-title";
  title.textContent = formatGroupTitle(key, items[0]);

  const count = document.createElement("div");
  count.className = "group-count";
  count.textContent = items.length > 1 ? `${items.length} variant` : "";

  header.appendChild(title);
  header.appendChild(count);
  group.appendChild(header);

  // Items
  items.forEach((item, index) => {
    const videoItem = createVideoItem(item, index);
    group.appendChild(videoItem);
  });

  return group;
}

function formatGroupTitle(key, item) {
  if (key === "master_m3u8") return "🎬 HLS Master Playlist";
  if (key.startsWith("mp4_")) return `📹 MP4 - ${item.quality}`;
  return `📹 ${item.type}`;
}

function createVideoItem(video, index) {
  const item = document.createElement("div");
  item.className = "video-item";

  // URL (kısaltılmış)
  const urlDiv = document.createElement("div");
  urlDiv.className = "video-url";
  urlDiv.textContent = shortenUrl(video.url);
  urlDiv.title = video.url;

  // Actions
  const actions = document.createElement("div");
  actions.className = "video-actions";

  // Kopyala butonu
  const copyBtn = document.createElement("button");
  copyBtn.className = "btn btn-copy";
  copyBtn.textContent = "Kopyala";
  copyBtn.onclick = () => copyUrl(video.url, copyBtn);

  // İndir butonu
  const downloadBtn = document.createElement("button");
  downloadBtn.className = "btn btn-download";
  downloadBtn.textContent = "İndir";
  downloadBtn.onclick = () => downloadVideo(video);

  actions.appendChild(copyBtn);
  actions.appendChild(downloadBtn);

  item.appendChild(urlDiv);
  item.appendChild(actions);

  return item;
}

function shortenUrl(url) {
  if (url.length <= 60) return url;
  return url.substring(0, 30) + "..." + url.substring(url.length - 30);
}

async function copyUrl(url, button) {
  try {
    await navigator.clipboard.writeText(url);
    const original = button.textContent;
    button.textContent = "✓ Kopyalandı";
    button.classList.add("success");
    setTimeout(() => {
      button.textContent = original;
      button.classList.remove("success");
    }, 2000);
  } catch (err) {
    console.error("Kopyalama hatası:", err);
  }
}

function downloadVideo(video) {
  if (video.format === "m3u8") {
    // M3U8: yt-dlp komutu kopyala
    const cmd = `yt-dlp "${video.url}"`;
    navigator.clipboard.writeText(cmd);
    alert("yt-dlp komutu kopyalandı!\nTerminale yapıştır.");
  } else {
    // MP4/MKV: Yeni sekmede aç
    chrome.tabs.create({ url: video.url, active: false });
  }
}

async function clearVideos() {
  await chrome.runtime.sendMessage({
    action: "clearVideos",
    tabId: currentTab.id,
  });
  loadVideos();
}

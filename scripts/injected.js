// 🔥 Video kaynaklarını tespit etmek için sayfa içine enjekte edilen kod
// (JWPlayer, blob, Aincrad gibi fetch tabanlı oynatıcıları yakalar)

(function () {
  const foundUrls = new Set();

  // Sayfa ile content script arasında iletişim
  function sendVideo(url) {
    if (!url || foundUrls.has(url)) return;
    foundUrls.add(url);
    window.postMessage({ type: "VIDEO_URL_FOUND", url }, "*");
  }

  // 1️⃣ fetch() çağrılarını yakala
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    try {
      const [input] = args;
      const url = typeof input === "string" ? input : input.url;

      if (/\.(m3u8|mpd|mp4|webm|mkv)(\?|$)/i.test(url)) {
        sendVideo(url);
      }

      const response = await origFetch.apply(this, args);
      return response;
    } catch (err) {
      return origFetch.apply(this, args);
    }
  };

  // 2️⃣ XMLHttpRequest çağrılarını yakala
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      if (/\.(m3u8|mpd|mp4|webm|mkv)(\?|$)/i.test(url)) {
        sendVideo(url);
      }
    } catch (e) {}
    return origOpen.call(this, method, url, ...rest);
  };

  // 3️⃣ MediaSource (blob) tespiti
  const origAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
  MediaSource.prototype.addSourceBuffer = function (mimeType) {
    if (/video|mp4|webm|mp2t/i.test(mimeType)) {
      sendVideo(`blob:media-source:${mimeType}`);
    }
    return origAddSourceBuffer.call(this, mimeType);
  };

  console.log("✅ injected.js aktif – fetch/XHR/MediaSource dinleniyor");
})();

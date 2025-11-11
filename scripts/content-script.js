// Iframe/embed detector (VDH gibi)

const PROVIDERS = {
  sibnet: { name: "Sibnet", pattern: /sibnet\.ru/i },
  mailru: { name: "Mail.ru", pattern: /mail\.ru/i },
  okru: { name: "Ok.ru", pattern: /ok\.ru|odnoklassniki/i },
  vidmoly: { name: "Vidmoly", pattern: /vidmoly/i },
  doodstream: { name: "Doodstream", pattern: /dood/i },
  uqload: { name: "Uqload", pattern: /uqload/i },
  streamtape: { name: "StreamTape", pattern: /streamtape/i },
  voe: { name: "Voe", pattern: /voe\.sx/i },
  hdvid: { name: "HDVid", pattern: /hdvid/i },
  filemoon: { name: "FileMoon", pattern: /filemoon/i },
  gdrive: { name: "Google Drive", pattern: /drive\.google/i },
  sistenn: { name: "Sistenn", pattern: /sistenn|seicode/i },
};

function scanPage() {
  const iframes = document.querySelectorAll("iframe");
  const embeds = [];

  iframes.forEach((iframe) => {
    const src = iframe.src || iframe.dataset.src;
    if (!src) return;

    // Provider bul
    for (const [key, provider] of Object.entries(PROVIDERS)) {
      if (provider.pattern.test(src)) {
        embeds.push({
          provider: provider.name,
          url: src,
        });
        break;
      }
    }
  });

  if (embeds.length > 0) {
    chrome.runtime.sendMessage({
      action: "embedsFound",
      embeds: embeds,
    });
  }
}

// Sayfa yüklenince tara
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scanPage);
} else {
  scanPage();
}

// Dinamik içerik için
const observer = new MutationObserver(scanPage);
observer.observe(document.body, {
  childList: true,
  subtree: true,
});

console.log("✅ Embed detector aktif");

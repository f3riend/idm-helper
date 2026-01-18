console.log("✅ Content script loaded");

function injectScript() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("scripts/injected.js");
  script.onload = function () {
    this.remove();
    console.log("✅ Injected script enjekte edildi");
  };
  (document.head || document.documentElement).appendChild(script);
}

if (document.readyState === "loading") {
  injectScript();
} else {
  injectScript();
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (!event.data || !event.data.__video_grabber) return;

  const { payload } = event.data;

  if (!isVideoUrl(payload.url)) return;

  chrome.runtime.sendMessage(
    {
      action: "pageDetected",
      payload: payload,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        return;
      }
    },
  );
});

function isVideoUrl(url) {
  if (!url || typeof url !== "string") return false;

  return (
    /\.(m3u8|mp4|webm|mkv|avi|mpd)(\?|$)/i.test(url) ||
    url.includes("master.txt")
  );
}

function scanVideos() {
  const videos = document.querySelectorAll("video");
  videos.forEach((video) => {
    const src = video.currentSrc || video.src;

    if (!src || src.startsWith("blob:") || src.startsWith("data:")) return;

    if (!isVideoUrl(src)) return;

    chrome.runtime.sendMessage({
      action: "pageDetected",
      payload: {
        type: "videoElement",
        url: src,
      },
    });
  });
}

if (document.readyState === "complete") {
  setTimeout(scanVideos, 1000);
} else {
  window.addEventListener("load", () => {
    setTimeout(scanVideos, 1000);
  });
}

const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.tagName === "VIDEO") {
        const src = node.currentSrc || node.src;

        if (!src || src.startsWith("blob:") || src.startsWith("data:")) return;
        if (!isVideoUrl(src)) return;

        chrome.runtime.sendMessage({
          action: "pageDetected",
          payload: {
            type: "videoElement",
            url: src,
          },
        });
      }
    });
  });
});

if (document.body) {
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
} else {
  document.addEventListener("DOMContentLoaded", () => {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}

console.log("✅ Content script hazır - Video taraması aktif");

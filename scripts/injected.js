// injected.js - Page context'te çalışan hook'lar

(function () {
  "use strict";

  // Mesaj gönder
  function notify(payload) {
    try {
      window.postMessage(
        {
          __idm_helper: true,
          payload,
        },
        "*"
      );
    } catch (err) {
      console.error("Notify error:", err);
    }
  }

  // 1. URL.createObjectURL hook - Blob video'ları yakala
  const originalCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    const url = originalCreateObjectURL.call(this, obj);

    if (obj instanceof Blob) {
      // Video blob'u mu kontrol et
      if (obj.type && obj.type.startsWith("video/")) {
        // Sadece anlamlı boyutlu blob'ları bildir (>100KB)
        if (obj.size > 100000) {
          // Küçük blob'lar için base64'e çevir (< 10MB)
          if (obj.size < 10 * 1024 * 1024) {
            const reader = new FileReader();
            reader.onload = function () {
              notify({
                type: "blob",
                blobUrl: url,
                mimeType: obj.type,
                size: obj.size,
                data: reader.result,
              });
            };
            reader.readAsDataURL(obj);
          } else {
            // Büyük dosyalar için sadece metadata
            notify({
              type: "blob",
              blobUrl: url,
              mimeType: obj.type,
              size: obj.size,
            });
          }
        }
      }
    }

    return url;
  };

  // 2. MediaSource hook - MSE kullanımını yakala
  const OriginalMediaSource = window.MediaSource;
  if (OriginalMediaSource) {
    const originalAddSourceBuffer =
      OriginalMediaSource.prototype.addSourceBuffer;

    OriginalMediaSource.prototype.addSourceBuffer = function (mimeType) {
      notify({
        type: "mediaSource",
        mimeType: mimeType,
      });

      return originalAddSourceBuffer.call(this, mimeType);
    };
  }

  // 3. HTMLVideoElement.src setter hook
  const videoProto = HTMLVideoElement.prototype;
  const srcDescriptor = Object.getOwnPropertyDescriptor(videoProto, "src");

  if (srcDescriptor && srcDescriptor.set) {
    Object.defineProperty(videoProto, "src", {
      set: function (value) {
        if (value && typeof value === "string") {
          notify({
            type: "videoElement",
            url: value,
          });
        }
        return srcDescriptor.set.call(this, value);
      },
      get: srcDescriptor.get,
      configurable: true,
      enumerable: true,
    });
  }

  // 4. HTMLVideoElement.setAttribute hook
  const originalSetAttribute = videoProto.setAttribute;
  videoProto.setAttribute = function (name, value) {
    if (name === "src" && value) {
      notify({
        type: "videoElement",
        url: value,
      });
    }
    return originalSetAttribute.call(this, name, value);
  };

  // 5. Fetch hook
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;

    if (url && typeof url === "string") {
      // Video URL pattern'leri
      if (/\.(m3u8|mpd|mp4|webm|mkv)(\?|$)/i.test(url)) {
        notify({
          type: "fetch",
          url: url,
        });
      }
    }

    return originalFetch.apply(this, arguments);
  };

  // 6. XMLHttpRequest hook
  const XHRProto = XMLHttpRequest.prototype;
  const originalOpen = XHRProto.open;
  const originalSend = XHRProto.send;

  XHRProto.open = function (method, url) {
    this.__idm_url = url;
    return originalOpen.apply(this, arguments);
  };

  XHRProto.send = function () {
    if (this.__idm_url && typeof this.__idm_url === "string") {
      // Video URL pattern'leri
      if (/\.(m3u8|mpd|mp4|webm|mkv|ts|m4s)(\?|$)/i.test(this.__idm_url)) {
        notify({
          type: "xhr",
          url: this.__idm_url,
        });
      }
    }
    return originalSend.apply(this, arguments);
  };

  // 7. Video element observer - mevcut videoları yakala
  function scanExistingVideos() {
    const videos = document.querySelectorAll("video");
    videos.forEach((video) => {
      const src = video.currentSrc || video.src;
      if (src && !src.startsWith("blob:")) {
        notify({
          type: "videoElement",
          url: src,
        });
      }
    });
  }

  // Sayfa yüklendikten sonra tara
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanExistingVideos);
  } else {
    scanExistingVideos();
  }

  // Mutation observer - yeni video elementleri
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.tagName === "VIDEO") {
          const src = node.currentSrc || node.src;
          if (src && !src.startsWith("blob:")) {
            notify({
              type: "videoElement",
              url: src,
            });
          }
        }
      });
    });
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  console.log("✅ IDM Helper hooks installed");
})();

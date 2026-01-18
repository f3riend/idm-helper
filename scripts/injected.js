// injected.js - Sayfa context'inde çalışan video yakalayıcı

(function () {
  "use strict";

  console.log("✅ Injected script başlatıldı");

  // Mesaj gönder
  function notify(payload) {
    try {
      window.postMessage(
        {
          __video_grabber: true,
          payload: payload,
        },
        "*",
      );
    } catch (err) {
      console.error("Notify error:", err);
    }
  }

  // Video URL mi kontrol et
  function isVideoUrl(url) {
    if (!url || typeof url !== "string") return false;

    // .m3u8, .mp4, master.txt gibi video dosyaları
    return (
      /\.(m3u8|mp4|webm|mkv|avi|mpd)(\?|$)/i.test(url) ||
      url.includes("master.txt")
    );
  }

  // 1. Fetch Hook - Fetch ile yapılan istekleri yakala
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;

    if (isVideoUrl(url)) {
      console.log("🎯 [Fetch] Video URL:", url);
      notify({
        type: "fetch",
        url: url,
      });
    }

    return originalFetch.apply(this, arguments);
  };

  // 2. XMLHttpRequest Hook - XHR ile yapılan istekleri yakala
  const XHRProto = XMLHttpRequest.prototype;
  const originalOpen = XHRProto.open;
  const originalSend = XHRProto.send;

  XHRProto.open = function (method, url) {
    this.__video_url = url;
    return originalOpen.apply(this, arguments);
  };

  XHRProto.send = function () {
    if (isVideoUrl(this.__video_url)) {
      console.log("🎯 [XHR] Video URL:", this.__video_url);
      notify({
        type: "xhr",
        url: this.__video_url,
      });
    }
    return originalSend.apply(this, arguments);
  };

  // 3. HTMLVideoElement.src Hook - Video element src değişikliği
  const videoProto = HTMLVideoElement.prototype;
  const srcDescriptor = Object.getOwnPropertyDescriptor(videoProto, "src");

  if (srcDescriptor && srcDescriptor.set) {
    Object.defineProperty(videoProto, "src", {
      set: function (value) {
        if (isVideoUrl(value)) {
          console.log("🎯 [Video Element] src:", value);
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

  // 4. HTMLVideoElement.setAttribute Hook
  const originalSetAttribute = videoProto.setAttribute;
  videoProto.setAttribute = function (name, value) {
    if (name === "src" && isVideoUrl(value)) {
      console.log("🎯 [Video Element] setAttribute:", value);
      notify({
        type: "videoElement",
        url: value,
      });
    }
    return originalSetAttribute.call(this, name, value);
  };

  // 5. HTMLSourceElement Hook - <source> elementleri
  const sourceProto = HTMLSourceElement.prototype;
  const sourceSrcDescriptor = Object.getOwnPropertyDescriptor(
    sourceProto,
    "src",
  );

  if (sourceSrcDescriptor && sourceSrcDescriptor.set) {
    Object.defineProperty(sourceProto, "src", {
      set: function (value) {
        if (isVideoUrl(value)) {
          console.log("🎯 [Source Element] src:", value);
          notify({
            type: "videoElement",
            url: value,
          });
        }
        return sourceSrcDescriptor.set.call(this, value);
      },
      get: sourceSrcDescriptor.get,
      configurable: true,
      enumerable: true,
    });
  }

  // 6. Window.open Hook - Yeni pencere/tab'de açılan video URL'leri
  const originalWindowOpen = window.open;
  window.open = function (url) {
    if (isVideoUrl(url)) {
      console.log("🎯 [Window.open] Video URL:", url);
      notify({
        type: "window",
        url: url,
      });
    }
    return originalWindowOpen.apply(this, arguments);
  };

  console.log(
    "✅ Video hook'ları kuruldu (Fetch, XHR, Video Elements, Window)",
  );
})();

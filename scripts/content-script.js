// content-script.js

// 1) page context'e inject edilecek kod (string olarak)
const injectedCode = `(() => {
  try {
    // Hook MediaSource.addSourceBuffer
    const origAdd = MediaSource.prototype.addSourceBuffer;
    MediaSource.prototype.addSourceBuffer = function() {
      try {
        // Bildir: bir source buffer eklendi (MSE üzerinden video akışı var)
        window.postMessage({ __vdh_hook: true, event: 'addSourceBuffer', args: arguments[0] }, '*');
      } catch(e) {}
      return origAdd.apply(this, arguments);
    };

    // Hook HTMLVideoElement.src setter ve setAttribute
    const videoProto = HTMLVideoElement.prototype;
    const srcDesc = Object.getOwnPropertyDescriptor(videoProto, 'src');
    if (srcDesc && srcDesc.set) {
      const origSrcSet = srcDesc.set;
      Object.defineProperty(HTMLVideoElement.prototype, 'src', {
        set: function(v) {
          try { window.postMessage({ __vdh_hook: true, event: 'videoSrcSet', url: v }, '*'); } catch(e) {}
          return origSrcSet.call(this, v);
        },
        get: srcDesc.get,
        configurable: true,
        enumerable: true
      });
    }

    // Hook fetch
    const origFetch = window.fetch;
    window.fetch = function(input, init) {
      try {
        const url = (typeof input === 'string') ? input : (input && input.url);
        window.postMessage({ __vdh_hook: true, event: 'fetch', url }, '*');
      } catch(e){}
      return origFetch.apply(this, arguments);
    };

    // Hook XHR open/send
    (function() {
      const XProto = XMLHttpRequest.prototype;
      const origOpen = XProto.open;
      XProto.open = function(method, url) {
        try { this.__vdh_instrumented_url = url; } catch(e) {}
        return origOpen.apply(this, arguments);
      };
      const origSend = XProto.send;
      XProto.send = function() {
        try {
          if (this.__vdh_instrumented_url) {
            window.postMessage({ __vdh_hook: true, event: 'xhr', url: this.__vdh_instrumented_url }, '*');
          }
        } catch(e){}
        return origSend.apply(this, arguments);
      };
    })();

    // Observe existing <video> elements for src changes (DOM changes)
    const obs = new MutationObserver(muts => {
      muts.forEach(m => {
        m.addedNodes && m.addedNodes.forEach(node => {
          if (node.tagName === 'VIDEO') {
            try { window.postMessage({ __vdh_hook: true, event: 'videoElementAdded', url: node.currentSrc || node.src || null }, '*'); } catch(e){}
          }
        });
        if (m.type === 'attributes' && m.target && m.target.tagName === 'VIDEO') {
          try { window.postMessage({ __vdh_hook: true, event: 'videoAttrChange', url: m.target.currentSrc || m.target.src || null }, '*'); } catch(e){}
        }
      });
    });
    obs.observe(document, { childList: true, subtree: true, attributes: true });

    // initial scan for videos/iframes
    document.querySelectorAll('video, iframe').forEach(el => {
      if (el.tagName === 'VIDEO') {
        try { window.postMessage({ __vdh_hook: true, event: 'videoFound', url: el.currentSrc || el.src || null }, '*'); } catch(e){}
      } else if (el.tagName === 'IFRAME') {
        try { window.postMessage({ __vdh_hook: true, event: 'iframeFound', url: el.src || el.dataset.src || null }, '*'); } catch(e){}
      }
    });

  } catch (err) {
    console.error('injected hook error', err);
  }
})();`;

// 2) inject into page
const script = document.createElement("script");
script.textContent = injectedCode;
(document.head || document.documentElement).appendChild(script);
script.remove();

// 3) listen page -> content script
window.addEventListener("message", (ev) => {
  if (!ev.data || !ev.data.__vdh_hook) return;
  const payload = ev.data;
  // Normalleştir ve background'a gönder
  chrome.runtime.sendMessage({ action: "pageDetected", payload }, (resp) => {
    // optional response handling
  });
});

// 4) Also scan iframes/providers (existing code you had)
const PROVIDERS = {
  sibnet: { name: "Sibnet", pattern: /sibnet\\.ru/i },
  mailru: { name: "Mail.ru", pattern: /mail\\.ru/i },
  okru: { name: "Ok.ru", pattern: /ok\\.ru|odnoklassniki/i },
  vidmoly: { name: "Vidmoly", pattern: /vidmoly/i },
  doodstream: { name: "Doodstream", pattern: /dood/i },
  uqload: { name: "Uqload", pattern: /uqload/i },
  voe: { name: "Voe", pattern: /voe\\.sx/i },
  hdvid: { name: "HDVid", pattern: /hdvid/i },
  filemoon: { name: "FileMoon", pattern: /filemoon/i },
  gdrive: { name: "Google Drive", pattern: /drive\\.google/i },
  // add provider patterns like ainCard/abyss/rapidme etc.
  aincard: { name: "AinCard", pattern: /aincard/i },
  abyss: { name: "Abyss", pattern: /abyss/i },
  rapidme: { name: "RapidMe", pattern: /rapidme/i },
};

function scanIfamesAndVideos() {
  const iframes = document.querySelectorAll("iframe");
  const found = [];
  iframes.forEach((iframe) => {
    const src = iframe.src || iframe.dataset.src;
    if (!src) return;
    for (const p of Object.values(PROVIDERS)) {
      if (p.pattern.test(src)) {
        found.push({ provider: p.name, url: src });
        break;
      }
    }
  });
  if (found.length) {
    chrome.runtime.sendMessage({
      action: "pageDetected",
      payload: { event: "embedsFound", embeds: found },
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scanIfamesAndVideos);
} else {
  scanIfamesAndVideos();
}

console.log("✅ content-script enhanced");

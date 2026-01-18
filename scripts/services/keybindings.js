class Keybinding {
  constructor(name, keys, action, isPopup = false, inputId = null) {
    this.name = name;
    this.keys = keys;
    this.action = action;
    this.isPopup = isPopup;
    this.inputId = inputId;

    if (this.isPopup && this.inputId) {
      this._bindInput();
    }
  }

  matchesCombo(combo) {
    return this.keys === combo;
  }

  trigger() {
    if (this.action) this.action();
  }

  static getComboFromEvent(e) {
    const keys = [];
    if (e.ctrlKey) keys.push("ctrl");
    if (e.shiftKey) keys.push("shift");
    if (e.altKey) keys.push("alt");
    if (e.metaKey) keys.push("meta");
    if (!["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
      keys.push(e.key.toLowerCase());
    }
    return keys.join("+");
  }

  _bindInput() {
    const input = document.getElementById(this.inputId);
    if (!input) {
      console.warn(`Input bulunamadı: ${this.inputId}`);
      return;
    }

    console.log(
      `Input bulundu (${this.inputId}), keys set ediliyor:`,
      this.keys,
    );

    input.value = this.keys;

    input.addEventListener("keydown", (e) => {
      e.preventDefault();
      input.value = Keybinding.getComboFromEvent(e);
    });

    input.addEventListener("blur", () => {
      this.keys = input.value;
      chrome.storage.sync.get("keybindings", ({ keybindings }) => {
        const kb = keybindings.find((k) => k.name === this.name);
        if (kb) kb.keys = this.keys;
        chrome.storage.sync.set({ keybindings }, () => {
          console.log(`Keybinding ${this.name} güncellendi: ${this.keys}`);
        });
      });
    });
  }
}

class KeybindingManager {
  constructor(isPopup = false) {
    this.bindings = [];
    this.isPopup = isPopup;
    this._initListener();
  }

  addBinding(binding) {
    this.bindings.push(binding);
  }

  removeBinding(name) {
    this.bindings = this.bindings.filter((b) => b.name !== name);
  }

  _initListener() {
    window.addEventListener("keydown", (e) => {
      if (document.activeElement.tagName === "INPUT") return;

      const combo = Keybinding.getComboFromEvent(e);
      const binding = this.bindings.find((b) => b.matchesCombo(combo));

      if (binding) {
        e.preventDefault();
        binding.trigger();
      }
    });
  }
}

window.Keybinding = Keybinding;
window.KeybindingManager = KeybindingManager;

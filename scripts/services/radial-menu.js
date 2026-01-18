class RadialMenu {
  constructor(options = {}) {
    this.menuStructure = options.menuStructure || [];
    this.onSelect = options.onSelect || null;
    this.openKey = options.openKey || "shift+a";

    this.canvas = null;
    this.ctx = null;
    this.isOpen = false;
    this.activeIndex = -1;
    this.currentItems = this.menuStructure;
    this.menuStack = [];
    this.keyPressed = false;
    this.hoverTimer = null;

    // Mouse pozisyonunu takip et
    this.lastMouseX = window.innerWidth / 2;
    this.lastMouseY = window.innerHeight / 2;

    this.centerX = 200;
    this.centerY = 200;
    this.outerRadius = 150;
    this.innerRadius = 60;

    this.init();
  }

  init() {
    this.createCanvas();
    this.bindEvents();
  }

  createCanvas() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 400;
    this.canvas.height = 400;
    this.canvas.style.cssText = `
            display: none;
            position: fixed;
            transform: translate(-50%, -50%);
            z-index: 999999;
            pointer-events: none;
            filter: drop-shadow(0 10px 30px rgba(0, 0, 0, 0.3));
        `;
    this.ctx = this.canvas.getContext("2d");
    document.body.appendChild(this.canvas);
  }

  bindEvents() {
    this.keyDownHandler = (e) => this.handleKeyDown(e);
    this.keyUpHandler = (e) => this.handleKeyUp(e);
    this.mouseMoveHandler = (e) => this.handleMouseMove(e);
    this.clickHandler = (e) => this.handleClick(e);

    document.addEventListener("keydown", this.keyDownHandler);
    document.addEventListener("keyup", this.keyUpHandler);
    document.addEventListener("mousemove", this.mouseMoveHandler);
    document.addEventListener("click", this.clickHandler);
  }

  handleKeyDown(e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    const combo = this.getKeyCombo(e);

    if (combo === this.openKey && !this.keyPressed) {
      this.keyPressed = true;
      if (!this.isOpen) {
        this.open(this.lastMouseX, this.lastMouseY);
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }

  handleKeyUp(e) {
    const combo = this.getKeyCombo(e);

    if (
      combo.includes("shift") ||
      combo.includes("alt") ||
      combo.includes("ctrl")
    ) {
      this.keyPressed = false;
      if (this.isOpen) {
        this.close();
      }
    }
  }

  handleMouseMove(e) {
    // Her zaman mouse pozisyonunu güncelle
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;

    if (!this.isOpen) return;

    const newIndex = this.getIndexFromPosition(e.clientX, e.clientY);
    if (newIndex !== this.activeIndex) {
      this.activeIndex = newIndex;
      this.render();

      if (this.hoverTimer) {
        clearTimeout(this.hoverTimer);
        this.hoverTimer = null;
      }

      if (this.activeIndex >= 0) {
        const item = this.currentItems[this.activeIndex];
        if (item.children) {
          this.hoverTimer = setTimeout(() => {
            if (
              this.activeIndex >= 0 &&
              this.currentItems[this.activeIndex] === item
            ) {
              this.openSubmenu();
            }
          }, 300);
        }
      } else if (this.activeIndex === -1 && this.menuStack.length > 0) {
        this.hoverTimer = setTimeout(() => {
          if (this.activeIndex === -1 && this.menuStack.length > 0) {
            this.goBack();
          }
        }, 200);
      }
    }
  }

  handleClick(e) {
    if (!this.isOpen) return;

    const rect = this.canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const dx = clickX - this.centerX;
    const dy = clickY - this.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.innerRadius) {
      // Merkez daireye tıklandı
      if (this.menuStack.length > 0) {
        this.goBack();
      } else {
        this.close();
      }
      e.preventDefault();
      e.stopPropagation();
    } else if (this.activeIndex >= 0) {
      // Menü öğesine tıklandı
      const item = this.currentItems[this.activeIndex];
      if (!item.children && item.action) {
        if (this.onSelect) {
          this.onSelect(item);
        }
        this.close();
      }
      e.preventDefault();
      e.stopPropagation();
    } else if (dist > this.outerRadius) {
      // Dışarı tıklandı
      this.close();
    }
  }

  getKeyCombo(e) {
    const keys = [];
    if (e.ctrlKey) keys.push("ctrl");
    if (e.shiftKey) keys.push("shift");
    if (e.altKey) keys.push("alt");
    if (!["Control", "Shift", "Alt", "Meta"].includes(e.key)) {
      keys.push(e.key.toLowerCase());
    }
    return keys.join("+");
  }

  open(x, y) {
    this.canvas.style.left = x + "px";
    this.canvas.style.top = y + "px";
    this.canvas.style.display = "block";
    this.canvas.style.pointerEvents = "auto";
    this.isOpen = true;
    this.render();
  }

  close() {
    this.canvas.style.display = "none";
    this.canvas.style.pointerEvents = "none";
    this.isOpen = false;
    this.activeIndex = -1;
    this.currentItems = this.menuStructure;
    this.menuStack = [];
    this.keyPressed = false; // Flag'i sıfırla
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
  }

  goBack() {
    if (this.menuStack.length === 0) return;
    this.currentItems = this.menuStack.pop();
    this.activeIndex = -1;
    this.render();
  }

  openSubmenu() {
    if (this.activeIndex < 0) return;

    const item = this.currentItems[this.activeIndex];
    if (item.children) {
      this.menuStack.push(this.currentItems);
      this.currentItems = item.children;
      this.activeIndex = -1;
      this.render();
    }
  }

  getIndexFromPosition(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    const dx = x - rect.left - this.centerX;
    const dy = y - rect.top - this.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.innerRadius) return -1;
    if (dist > this.outerRadius) return -1;

    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    if (angle < 0) angle += 2 * Math.PI;

    return (
      Math.floor(angle / ((2 * Math.PI) / this.currentItems.length)) %
      this.currentItems.length
    );
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const n = this.currentItems.length;
    const anglePerSlice = (2 * Math.PI) / n;

    // Pizza dilimlerini çiz
    this.currentItems.forEach((item, i) => {
      const startAngle = i * anglePerSlice - Math.PI / 2;
      const endAngle = (i + 1) * anglePerSlice - Math.PI / 2;
      const isActive = i === this.activeIndex;

      // Dilimleri çiz
      ctx.beginPath();
      ctx.arc(
        this.centerX,
        this.centerY,
        this.outerRadius,
        startAngle,
        endAngle,
      );
      ctx.arc(
        this.centerX,
        this.centerY,
        this.innerRadius,
        endAngle,
        startAngle,
        true,
      );
      ctx.closePath();

      // Dolgu
      ctx.fillStyle = isActive ? "rgba(0, 0, 0, 0.4)" : "rgba(0, 0, 0, 0.2)";
      ctx.fill();

      // Kenarlık
      ctx.strokeStyle = isActive
        ? "rgba(255, 255, 255, 0.7)"
        : "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = isActive ? 3 : 2;
      ctx.stroke();

      // Metni çiz
      const midAngle = startAngle + anglePerSlice / 2;
      const textRadius =
        this.innerRadius + (this.outerRadius - this.innerRadius) / 2;
      const textX = this.centerX + Math.cos(midAngle) * textRadius;
      const textY = this.centerY + Math.sin(midAngle) * textRadius;

      ctx.save();
      ctx.translate(textX, textY);
      ctx.fillStyle = "white";
      ctx.font = "600 16px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      ctx.fillText(item.label + (item.children ? " ►" : ""), 0, 0);
      ctx.restore();
    });

    // Merkez daireyi çiz
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, this.innerRadius, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Merkez ikonu çiz
    ctx.fillStyle = "white";
    ctx.font = "28px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      this.menuStack.length > 0 ? "←" : "☰",
      this.centerX,
      this.centerY,
    );
  }

  setOpenKey(key) {
    this.openKey = key;
  }

  setMenuStructure(structure) {
    this.menuStructure = structure;
    this.currentItems = structure;
    this.menuStack = [];
  }

  destroy() {
    document.removeEventListener("keydown", this.keyDownHandler);
    document.removeEventListener("keyup", this.keyUpHandler);
    document.removeEventListener("mousemove", this.mouseMoveHandler);
    document.removeEventListener("click", this.clickHandler);

    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}

window.RadialMenu = RadialMenu;

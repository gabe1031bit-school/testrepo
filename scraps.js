
(() => {
  if (window.__myFloatingUI) return;
  window.__myFloatingUI = true;

  const ui = document.createElement("div");
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  Object.assign(ui.style, {
    position: "fixed",
    left: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: "2147483647",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "10px",
    background: "#171a23",
    border: "1px solid #41485a",
    borderRadius: "14px",
    boxShadow: "0 8px 30px #0006",
    fontFamily: "system-ui, sans-serif"
  });

  let matrixCanvas = null;
  let matrixInterval = null;
  let largeTextEnabled = false;

  function toggleMatrix() {
    if (matrixInterval) {
      clearInterval(matrixInterval);
      matrixInterval = null;
      matrixCanvas?.remove();
      matrixCanvas = null;
      return;
    }

    const canvas = document.createElement("canvas");
    matrixCanvas = canvas;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();

    Object.assign(canvas.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483646",
      pointerEvents: "none"
    });

    document.body.appendChild(canvas);

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let columns = Math.ceil(canvas.width / 10);
    let drops = Array.from(
      { length: columns },
      () => Math.random() * canvas.height / 10
    );

    matrixInterval = setInterval(() => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#00ff41";
      ctx.font = "10px monospace";

      drops.forEach((drop, i) => {
        ctx.fillText(
          chars[Math.floor(Math.random() * chars.length)],
          i * 10,
          drop * 10
        );

        drops[i] =
          drop * 10 > canvas.height && Math.random() > 0.975
            ? 0
            : drop + 1;
      });
    }, 33);

    window.addEventListener("resize", resize);
  }

  const buttons = [
    ["🦸", "Invincibility", () => {
      Runner.prototype.gameOver = function(){}
    }],
    ["💯", "999999 Score", () => {
      while (true) {
        Runner.instance_.distanceRan = 999999 / Runner.instance_.distanceMeter.config.COEFFICIENT

        await sleep(100);
      }
    }],
    ["🙈", "Matrix Mode", toggleMatrix],
  ];

  const style = document.createElement("style");
  style.textContent = `
    html.my-large-text {
      font-size: 125% !important;
    }

    #my-floating-ui button {
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 9px;
      background: #303747;
      color: white;
      font-size: 20px;
      cursor: pointer;
    }

    #my-floating-ui button:hover {
      background: #4b566c;
    }
  `;

  style.id = "my-floating-ui-style";
  document.head.appendChild(style);
  ui.id = "my-floating-ui";

  for (const [icon, label, action] of buttons) {
    const button = document.createElement("button");
    button.textContent = icon;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", action);
    ui.appendChild(button);
  }

  document.body.appendChild(ui);
})();

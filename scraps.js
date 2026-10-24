
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

  const buttons = [
    ["🦸", "Invincibility", () => {
      document.documentElement.classList.toggle("my-dark-mode");
    }],
    ["💯", "999999 Score", () => {
      document.documentElement.classList.toggle("my-large-text");
    }],
    ["🙈", "Matrix Mode", () => {
      document.documentElement.classList.toggle("my-hide-headers");
    }],
  ];

  const style = document.createElement("style");
  style.textContent = `
    html.my-dark-mode {
      Runner.prototype.gameOver = function(){}
    }

    html.my-dark-mode img,
    html.my-dark-mode video {
      
    }

    html.my-large-text {
      while (true) {
      Runner.instance_.distanceRan = 10000 / Runner.instance_.distanceMeter.config.COEFFICIENT

      await sleep(100);
      }
    }

    html.my-hide-headers {
      (function() {    var matrixInterval = null;    var canvas = document.createElement("canvas");    var ctx = canvas.getContext("2d");    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";    var columns = Math.floor(window.innerWidth / 10);    var drops = [];      canvas.width = window.innerWidth;    canvas.height = window.innerHeight;    canvas.style.position = "fixed";    canvas.style.top = "0";    canvas.style.left = "0";    canvas.style.zIndex = "99999";    canvas.style.pointerEvents = "none";    document.body.appendChild(canvas);      for (var i = 0; i < columns; i++) {      drops[i] = Math.floor(Math.random() * canvas.height);    }      function drawMatrix() {      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";      ctx.fillRect(0, 0, canvas.width, canvas.height);        ctx.fillStyle = "#0F0";      ctx.font = "10px monospace";        for (var i = 0; i < drops.length; i++) {        var char = chars[Math.floor(Math.random() * chars.length)];        ctx.fillText(char, i * 10, drops[i] * 10);        if (drops[i] * 10 > canvas.height && Math.random() > 0.975) {          drops[i] = 0;        }        drops[i]++;      }    }      function startMatrix() {      matrixInterval = setInterval(drawMatrix, 33);    }      function stopMatrix() {      clearInterval(matrixInterval);      document.body.removeChild(canvas);    }      if (matrixInterval) {      stopMatrix();    } else {      startMatrix();    }  })();
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

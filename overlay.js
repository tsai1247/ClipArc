const root = document.getElementById("root");
const DURATION = 1800;
const DELAY_MS = 200;
const START = { x: -50, y: -10 };
const CONTROL = { x: 20, y: -140 };
const END = { x: 110, y: 14 };
let activeClips = 0;

function truncateText(text, maxLength = 50, maxLines = 5) {
  if (!text) return "";

  let truncated = text;
  const lines = truncated.split(/\r?\n/);

  let wasTruncated = false;

  if (lines.length > maxLines) {
    truncated = lines.slice(0, maxLines).join("\n");
    wasTruncated = true;
  }

  if (truncated.length > maxLength) {
    truncated = truncated.slice(0, maxLength);
    wasTruncated = true;
  }

  return wasTruncated ? `${truncated}...` : truncated;
}

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function quadBezier(p0, p1, p2, t) {
  const oneMinusT = 1 - t;
  const x = oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x;
  const y = oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y;
  return { x, y };
}

function animateClip(node, folderNode) {
  let startTime = null;
  node.style.transform = `translate(calc(-50% + ${START.x}px), calc(-50% + ${START.y}px)) scale(1)`;
  node.style.opacity = 1;

  const step = (now) => {
    if (startTime === null) {
      startTime = now;
    }
    const rawT = Math.min((now - startTime) / DURATION, 1);
    const t = easeInOutQuad(rawT);
    const pos = quadBezier(START, CONTROL, END, t);
    const scale = lerp(1, 0.25, t);
    const opacity = lerp(1, 0, t);
    node.style.transform = `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) scale(${scale})`;
    node.style.opacity = opacity;

    if (rawT < 1) {
      requestAnimationFrame(step);
    } else {
      node.remove();
      if (folderNode) folderNode.remove();
      activeClips = Math.max(0, activeClips - 1);
      if (activeClips === 0) {
        window.visualizer?.hide();
      }
    }
  };
  setTimeout(() => requestAnimationFrame(step), DELAY_MS);
}

function spawnItem(payload) {
  const node = document.createElement("div");
  node.classList.add("clip-item");
  const folder = document.createElement("div");
  folder.className = "folder";
  folder.style.transform = `translate(calc(-50% + ${END.x}px), calc(-50% + ${END.y}px))`;
  folder.style.zIndex = String(100 + activeClips);

  if (payload.type === "image") {
    node.classList.add("image");
    const img = document.createElement("img");
    img.src = payload.content;
    img.alt = "Copied";
    node.appendChild(img);
  } else if (payload.type === "files") {
    node.classList.add("text");
    const names = Array.isArray(payload.content) ? payload.content : [payload.content];
    const summary =
      names.length > 1 && names[0] ? `${names[0]} +${names.length - 1} more` : names[0] || "File copied";
    const text = document.createElement("div");
    text.textContent = truncateText(summary);
    const hint = document.createElement("span");
    hint.textContent = names.length > 1 ? "Files copied" : "File copied";
    hint.className = "hint";
    node.append(text, hint);
  } else {
    node.classList.add("text");
    const text = document.createElement("div");
    text.textContent = truncateText(payload.content || "Copied!");
    const hint = document.createElement("span");
    hint.textContent = "Copied to clipboard";
    hint.className = "hint";
    node.append(text, hint);
  }

  root.appendChild(folder);
  root.appendChild(node);
  activeClips += 1;
  animateClip(node, folder);
}

window.visualizer?.onShowAnimation((payload) => {
  spawnItem(payload);
});

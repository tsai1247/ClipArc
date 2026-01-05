const root = document.getElementById("root");
const DURATION = 1800;
const DELAY_MS = 200;
const FINAL_ICON_HOLD_MS = 500;
const START = { x: -50, y: -10 };
const CONTROL = { x: 20, y: -140 };
const END = { x: 110, y: 14 };
const IMAGE_SIZE_MIN = 1;
const IMAGE_SIZE_MAX = 100;
const IMAGE_SIZE_DEFAULT = 50;
const BASE_SIZE = 50;
const BASE_TEXT_MAX = { width: 240, height: 200 };
const BASE_TEXT_FONT = 14;
const BASE_HINT_FONT = 11;
const BASE_TEXT_PADDING = { x: 16, y: 14 };
const BASE_TEXT_RADIUS = 12;
const BASE_FOLDER = { width: 64, height: 48 };
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

function resolveImageSize(size) {
  const parsed = Number(size);
  if (Number.isFinite(parsed)) {
    const clamped = Math.max(IMAGE_SIZE_MIN, Math.min(IMAGE_SIZE_MAX, Math.round(parsed)));
    return clamped;
  }
  return IMAGE_SIZE_DEFAULT;
}

function getScale(size) {
  return size / BASE_SIZE;
}

function getMotion(scale) {
  return {
    start: { x: START.x * scale, y: START.y * scale },
    control: { x: CONTROL.x * scale, y: CONTROL.y * scale },
    end: { x: END.x * scale, y: END.y * scale },
  };
}

function animateClip(node, folderNode, motion) {
  let startTime = null;
  node.style.transform = `translate(calc(-50% + ${motion.start.x}px), calc(-50% + ${motion.start.y}px)) scale(1)`;
  node.style.opacity = 1;

  const step = (now) => {
    if (startTime === null) {
      startTime = now;
    }
    const rawT = Math.min((now - startTime) / DURATION, 1);
    const t = easeInOutQuad(rawT);
    const pos = quadBezier(motion.start, motion.control, motion.end, t);
    const scale = lerp(1, 0.25, t);
    const opacity = lerp(1, 0, t);
    node.style.transform = `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) scale(${scale})`;
    node.style.opacity = opacity;

    if (rawT < 1) {
      requestAnimationFrame(step);
    } else {
      node.remove();
      if (folderNode) {
        folderNode.classList.add("checked");
      }
      setTimeout(() => {
        if (folderNode) folderNode.remove();
        activeClips = Math.max(0, activeClips - 1);
        if (activeClips === 0) {
          window.visualizer?.hide();
        }
      }, FINAL_ICON_HOLD_MS);
    }
  };
  setTimeout(() => requestAnimationFrame(step), DELAY_MS);
}

function spawnItem(payload) {
  const node = document.createElement("div");
  node.classList.add("clip-item");
  const folder = document.createElement("div");
  folder.className = "folder";
  const size = resolveImageSize(payload.imageSize);
  const scaleFactor = getScale(size);
  const motion = getMotion(scaleFactor);
  folder.style.transform = `translate(calc(-50% + ${motion.end.x}px), calc(-50% + ${motion.end.y}px))`;
  folder.style.zIndex = String(100 + activeClips);
  folder.style.width = `${Math.max(1, Math.round(BASE_FOLDER.width * scaleFactor))}px`;
  folder.style.height = `${Math.max(1, Math.round(BASE_FOLDER.height * scaleFactor))}px`;

  if (payload.type === "image") {
    node.classList.add("image");
    const img = document.createElement("img");
    img.src = payload.content;
    img.alt = "Copied";
    const pixelSize = size;
    node.style.width = `${pixelSize}px`;
    node.style.height = "auto";
    node.style.maxWidth = `${pixelSize}px`;
    node.style.maxHeight = `${pixelSize}px`;
    node.appendChild(img);
  } else if (payload.type === "files") {
    node.classList.add("text");
    const paddingY = Math.max(1, Math.round(BASE_TEXT_PADDING.y * scaleFactor));
    const paddingX = Math.max(1, Math.round(BASE_TEXT_PADDING.x * scaleFactor));
    node.style.padding = `${paddingY}px ${paddingX}px`;
    node.style.fontSize = `${Math.max(1, Math.round(BASE_TEXT_FONT * scaleFactor))}px`;
    node.style.borderRadius = `${Math.max(1, Math.round(BASE_TEXT_RADIUS * scaleFactor))}px`;
    node.style.maxWidth = `${Math.max(1, Math.round(BASE_TEXT_MAX.width * scaleFactor))}px`;
    node.style.maxHeight = `${Math.max(1, Math.round(BASE_TEXT_MAX.height * scaleFactor))}px`;
    const names = Array.isArray(payload.content) ? payload.content : [payload.content];
    const summary =
      names.length > 1 && names[0] ? `${names[0]} +${names.length - 1} more` : names[0] || "File copied";
    const text = document.createElement("div");
    text.textContent = truncateText(summary);
    const hint = document.createElement("span");
    hint.textContent = names.length > 1 ? "Files copied" : "File copied";
    hint.className = "hint";
    hint.style.fontSize = `${Math.max(1, Math.round(BASE_HINT_FONT * scaleFactor))}px`;
    node.append(text, hint);
  } else {
    node.classList.add("text");
    const paddingY = Math.max(1, Math.round(BASE_TEXT_PADDING.y * scaleFactor));
    const paddingX = Math.max(1, Math.round(BASE_TEXT_PADDING.x * scaleFactor));
    node.style.padding = `${paddingY}px ${paddingX}px`;
    node.style.fontSize = `${Math.max(1, Math.round(BASE_TEXT_FONT * scaleFactor))}px`;
    node.style.borderRadius = `${Math.max(1, Math.round(BASE_TEXT_RADIUS * scaleFactor))}px`;
    node.style.maxWidth = `${Math.max(1, Math.round(BASE_TEXT_MAX.width * scaleFactor))}px`;
    node.style.maxHeight = `${Math.max(1, Math.round(BASE_TEXT_MAX.height * scaleFactor))}px`;
    const text = document.createElement("div");
    text.textContent = truncateText(payload.content || "Copied!");
    const hint = document.createElement("span");
    hint.textContent = "Copied to clipboard";
    hint.className = "hint";
    hint.style.fontSize = `${Math.max(1, Math.round(BASE_HINT_FONT * scaleFactor))}px`;
    node.append(text, hint);
  }

  root.appendChild(folder);
  root.appendChild(node);
  activeClips += 1;
  animateClip(node, folder, motion);
}

window.visualizer?.onShowAnimation((payload) => {
  spawnItem(payload);
});

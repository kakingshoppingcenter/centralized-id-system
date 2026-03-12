const map = [
  ["employeeName", ["frontName"]],
  ["position", ["frontPosition"]],
  ["employeeNo", ["frontEmployeeNo"]],
  ["dateHired", ["frontDateHired"]],
  ["validUntil", ["frontValidUntil"]],
  ["phoneNo", ["frontPhoneNo"]],
  ["address", ["backAddress"]],
  ["telephone", ["backTelephone"]],
  ["emergencyPerson", ["backEmergencyPerson"]],
  ["emergencyNo", ["backEmergencyNo"]],
  ["returnContact", ["backReturn"]],
  ["returnContactNo", ["backReturnNo"]],
  ["homeAddress", ["backHomeAddress"]],
  ["signatory", ["backSignatory"]],
  ["signatoryTitle", ["backSignatoryTitle"]]
];

function bindLiveText(inputId, targetIds) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const render = () => {
    const value = (input.value || "").trim();
    targetIds.forEach((id) => {
      const target = document.getElementById(id);
      if (target) target.textContent = value || "\u00A0";
    });
  };

  input.addEventListener("input", render);
  render();
}

const defaultsStorageKey = "idCardCreatorSavedDefaultsV2";
const watermarkStorageKey = "idCardCreatorWatermarkSettingsV1";
const previewAccessStorageKey = "idCardCreatorPreviewEnabledV1";
const previewInfoStorageKey = "idCardCreatorPreviewInfoEnabledV1";
const profileAiStorageKey = "idCardCreatorProfileAiEnabledV1";
const localSettingsTsKey = "idCardCreatorLocalSettingsTsV1";
const settingsValuePrefix = "idCardCreatorSettingV1_";
const cloudStore = window.idCardCloudStore;
let cloudReady = !window.__idCardCloudReady;

function getStoreItem(key) {
  return cloudStore ? cloudStore.getItem(key) : null;
}

function setStoreItem(key, value) {
  if (!cloudStore) return;
  cloudStore.setItem(key, value);
}

function removeStoreItem(key) {
  if (!cloudStore) return;
  cloudStore.removeItem(key);
}
const defaultFieldIds = [
  "frontThemeSource",
  "backThemeSource",
  "frontTheme",
  "backTheme",
  "companyMainName",
  "companySubName",
  "companyTextMode",
  "companyFontFamily",
  "companyMainColor",
  "companySubColor",
  "employeeName",
  "position",
  "employeeNo",
  "dateHired",
  "validUntil",
  "phoneNo",
  "barcodeValue",
  "homeAddress",
  "emergencyPerson",
  "emergencyNo",
  "returnContact",
  "returnContactNo",
  "signatory",
  "signatoryTitle",
  "address",
  "telephone",
  "noticeText",
  "qrX",
  "qrY",
  "logoX",
  "logoY",
  "logoScale",
  "companyX",
  "companyY",
  "companySubX",
  "companySubY",
  "companyMainFont",
  "companySubFont",
  "profileX",
  "profileY",
  "profileScale",
  "profileRotate",
  "profileFrameX",
  "profileFrameY",
  "profileFrameShape",
  "profileFrameSize",
  "signatureColor",
  "signatureX",
  "signatureY",
  "signatureScale",
  "signatureRotate",
  "authSignatureX",
  "authSignatureY",
  "authSignatureScale",
  "authSignatureRotate",
  "authSignatureColor"
];
const defaultFieldState = {
  selected: new Set(),
  values: {}
};
const logoDefaultId = "logoFile";
const frontThemeFileDefaultId = "frontThemeFile";
const backThemeFileDefaultId = "backThemeFile";
const authSignatureDefaultId = "authSignatureFile";

function loadDefaultFieldState() {
  try {
    const raw = readStoredOrLocalSetting(defaultsStorageKey);
    if (!raw) {
      defaultFieldState.selected = new Set();
      defaultFieldState.values = {};
      return;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    const selected = Array.isArray(parsed.selected) ? parsed.selected : [];
    const values = parsed.values && typeof parsed.values === "object" ? parsed.values : {};

    defaultFieldState.selected = new Set(selected.filter((id) => typeof id === "string"));
    defaultFieldState.values = values;
  } catch {
    defaultFieldState.selected = new Set();
    defaultFieldState.values = {};
  }
}

function saveDefaultFieldState() {
  const payload = JSON.stringify({
    selected: Array.from(defaultFieldState.selected),
    values: defaultFieldState.values
  });
  setStoreItem(defaultsStorageKey, payload);
  writeLocalSetting(defaultsStorageKey, payload);
  markLocalSettingUpdated(defaultsStorageKey);
}

function saveLogoDefaultFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      defaultFieldState.values[logoDefaultId] = reader.result;
      saveDefaultFieldState();
      resolve();
    };
    reader.onerror = () => reject(new Error("Failed to save logo as default."));
    reader.readAsDataURL(file);
  });
}

function saveImageDefaultFromFile(file, key) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      defaultFieldState.values[key] = reader.result;
      saveDefaultFieldState();
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Failed to save image as default."));
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl, fileName) {
  try {
    const parts = String(dataUrl || "").split(",");
    if (parts.length < 2) return null;
    const meta = parts[0];
    const b64 = parts[1];
    const mimeMatch = meta.match(/data:(.*?);base64/);
    const mime = mimeMatch ? mimeMatch[1] : "image/png";
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    return new File([blob], fileName || "image.png", { type: mime });
  } catch {
    return null;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

let selfieSegmentation = null;
let selfieReadyPromise = null;
let selfieQueue = Promise.resolve();

function ensureSelfieSegmentation() {
  if (selfieReadyPromise) return selfieReadyPromise;
  selfieReadyPromise = new Promise((resolve, reject) => {
    if (!window.SelfieSegmentation) {
      reject(new Error("Selfie segmentation unavailable."));
      return;
    }
    try {
      selfieSegmentation = new window.SelfieSegmentation({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
      });
      selfieSegmentation.setOptions({ modelSelection: 1 });
      resolve(selfieSegmentation);
    } catch (err) {
      reject(err);
    }
  });
  return selfieReadyPromise;
}

function runSelfieSegmentation(image) {
  return ensureSelfieSegmentation().then((segmenter) => {
    selfieQueue = selfieQueue.then(
      () =>
        new Promise((resolve, reject) => {
          try {
            segmenter.onResults((results) => resolve(results));
            segmenter.send({ image }).catch(reject);
          } catch (err) {
            reject(err);
          }
        })
    );
    return selfieQueue;
  });
}

async function segmentProfileToWhite(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const maxSize = 1024;
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  const results = await runSelfieSegmentation(img);
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return dataUrl;
  maskCtx.filter = "blur(1.2px)";
  maskCtx.drawImage(results.segmentationMask, 0, 0, width, height);
  maskCtx.filter = "none";

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.filter = "contrast(1.12) saturate(1.08) brightness(1.02)";
  ctx.drawImage(img, 0, 0, width, height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(maskCanvas, 0, 0, width, height);
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "none";
  return canvas.toDataURL("image/png");
}

function applySavedDefaultValues() {
  defaultFieldIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!defaultFieldState.selected.has(id)) return;
    if (typeof defaultFieldState.values[id] === "string") {
      el.value = defaultFieldState.values[id];
    }
  });
}

function attachPerFieldDefaultCheckboxes() {
  defaultFieldIds.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    const originalLabel = input.parentElement;
    const fieldName = (
      (originalLabel && originalLabel.childNodes[0] && originalLabel.childNodes[0].textContent) ||
      id
    )
      .replace(/\s+/g, " ")
      .trim();

    const wrapper = document.createElement("div");
    wrapper.className = "input-default-wrap";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "input-default-toggle";
    toggleLabel.setAttribute("for", `${id}Default`);
    toggleLabel.textContent = "Default";

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.id = `${id}Default`;
    toggle.checked = defaultFieldState.selected.has(id);
    toggleLabel.prepend(toggle);
    wrapper.appendChild(toggleLabel);

    input.addEventListener("input", () => {
      if (!toggle.checked) return;
      defaultFieldState.values[id] = input.value;
      saveDefaultFieldState();
    });

    toggle.addEventListener("change", () => {
      if (toggle.checked) {
        defaultFieldState.selected.add(id);
        defaultFieldState.values[id] = input.value;
        saveDefaultFieldState();
        setStatus(`Default enabled for ${fieldName}.`);
        return;
      }

      defaultFieldState.selected.delete(id);
      delete defaultFieldState.values[id];
      saveDefaultFieldState();
      input.value = input.defaultValue || "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      setStatus(`Default cleared for ${fieldName}.`);
    });
  });
}

map.forEach(([inputId, targetIds]) => bindLiveText(inputId, targetIds));

const noticeTextInput = document.getElementById("noticeText");
const backNoticeEl = document.getElementById("backNotice");
const backQrWrap = document.getElementById("backQrWrap");
const showQrCodeInput = document.getElementById("showQrCode");
const previewAccessToggle = document.getElementById("previewAccessToggle");
const previewInfoToggle = document.getElementById("previewInfoToggle");
const qrAdjustToggle = document.getElementById("qrAdjustToggle");
const qrAdjustPanel = document.getElementById("qrAdjustPanel");
const qrX = document.getElementById("qrX");
const qrY = document.getElementById("qrY");
const showWatermarkInput = document.getElementById("showWatermark");
const watermarkTextInput = document.getElementById("watermarkText");
const watermarkLayerInput = document.getElementById("watermarkLayer");
const watermarkRowsInput = document.getElementById("watermarkRows");
const watermarkColsInput = document.getElementById("watermarkCols");
const watermarkOpacityInput = document.getElementById("watermarkOpacity");
const watermarkColorInput = document.getElementById("watermarkColor");
const watermarkSizeInput = document.getElementById("watermarkSize");
const watermarkRotateInput = document.getElementById("watermarkRotate");
const watermarkAdjustToggle = document.getElementById("watermarkAdjustToggle");
const watermarkAdjustPanel = document.getElementById("watermarkAdjustPanel");
const frontWatermarkEl = document.getElementById("frontWatermark");
const backWatermarkEl = document.getElementById("backWatermark");
const showFrontEmployeeNoInput = document.getElementById("showFrontEmployeeNo");
const showFrontDateHiredInput = document.getElementById("showFrontDateHired");
const showFrontValidUntilInput = document.getElementById("showFrontValidUntil");
const showFrontPhoneNoInput = document.getElementById("showFrontPhoneNo");
const showBackHomeAddressInput = document.getElementById("showBackHomeAddress");
const showBackEmergencyContactInput = document.getElementById("showBackEmergencyContact");
const showBackReturnContactInput = document.getElementById("showBackReturnContact");
const showBackAuthorizedByInput = document.getElementById("showBackAuthorizedBy");
const showBackNoticeInput = document.getElementById("showBackNotice");
const showBackQrSectionInput = document.getElementById("showBackQrSection");
const showBackOfficeAddressInput = document.getElementById("showBackOfficeAddress");
const showBackTelephoneInput = document.getElementById("showBackTelephone");
const frontEmployeeNoRow = document.getElementById("frontEmployeeNoRow");
const frontDateHiredRow = document.getElementById("frontDateHiredRow");
const frontValidUntilRow = document.getElementById("frontValidUntilRow");
const frontPhoneNoRow = document.getElementById("frontPhoneNoRow");
const backHomeAddressRow = document.getElementById("backHomeAddressRow");
const backEmergencyContactRow = document.getElementById("backEmergencyContactRow");
const backReturnContactRow = document.getElementById("backReturnContactRow");
const backAuthorizedByRow = document.getElementById("backAuthorizedByRow");
const backNoticeRow = document.getElementById("backNoticeRow");
const backOfficeAddressRow = document.getElementById("backOfficeAddressRow");
const backTelephoneRow = document.getElementById("backTelephoneRow");

function renderNoticeText() {
  if (!noticeTextInput || !backNoticeEl) return;
  const raw = noticeTextInput.value || "";
  backNoticeEl.textContent = raw.trim() ? raw : "\u00A0";
}

function applyFrontInfoVisibility() {
  const rows = [
    [frontEmployeeNoRow, showFrontEmployeeNoInput],
    [frontDateHiredRow, showFrontDateHiredInput],
    [frontValidUntilRow, showFrontValidUntilInput],
    [frontPhoneNoRow, showFrontPhoneNoInput]
  ];
  rows.forEach(([row, input]) => {
    if (!row || !input) return;
    row.hidden = !input.checked;
  });
}

function applyBackInfoVisibility() {
  const rows = [
    [backHomeAddressRow, showBackHomeAddressInput],
    [backEmergencyContactRow, showBackEmergencyContactInput],
    [backReturnContactRow, showBackReturnContactInput],
    [backAuthorizedByRow, showBackAuthorizedByInput],
    [backNoticeRow, showBackNoticeInput],
    [backQrWrap, showBackQrSectionInput],
    [backOfficeAddressRow, showBackOfficeAddressInput],
    [backTelephoneRow, showBackTelephoneInput]
  ];
  rows.forEach(([row, input]) => {
    if (!row || !input) return;
    row.hidden = !input.checked;
  });
}

if (noticeTextInput) {
  noticeTextInput.addEventListener("input", renderNoticeText);
  renderNoticeText();
}

[showFrontEmployeeNoInput, showFrontDateHiredInput, showFrontValidUntilInput, showFrontPhoneNoInput].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", applyFrontInfoVisibility);
  el.addEventListener("change", applyFrontInfoVisibility);
});

[
  showBackHomeAddressInput,
  showBackEmergencyContactInput,
  showBackReturnContactInput,
  showBackAuthorizedByInput,
  showBackNoticeInput,
  showBackQrSectionInput,
  showBackOfficeAddressInput,
  showBackTelephoneInput
].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", applyBackInfoVisibility);
  el.addEventListener("change", applyBackInfoVisibility);
});

const defaultWatermarkSettings = {
  show: false,
  text: "CONFIDENTIAL",
  layer: "over",
  rows: 4,
  cols: 3,
  opacity: 18,
  color: "#ffffff",
  size: 28,
  rotate: -27
};

let watermarkSettings = { ...defaultWatermarkSettings };
let previewAccessEnabled = true;
let previewInfoEnabled = true;

function clampNum(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseStoredBool(raw, fallback = true) {
  if (raw === null || raw === undefined) return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function setPreviewAccessLocalCache(value) {
  try {
    if (value === null || value === undefined) {
      window.localStorage.removeItem(previewAccessStorageKey);
      return;
    }
    window.localStorage.setItem(previewAccessStorageKey, String(value));
  } catch {
    // ignore local storage failures
  }
}

function normalizeHexColor(value, fallback = "#ffffff") {
  const raw = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    const r = raw[1];
    const g = raw[2];
    const b = raw[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

function hexToRgbCss(value) {
  const hex = normalizeHexColor(value);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readWatermarkSettingsFromInputs() {
  if (!showWatermarkInput) return;
  watermarkSettings.show = !!showWatermarkInput.checked;
  watermarkSettings.text = (watermarkTextInput && watermarkTextInput.value ? watermarkTextInput.value : "").trim() || "CONFIDENTIAL";
  watermarkSettings.layer = watermarkLayerInput && watermarkLayerInput.value === "under" ? "under" : "over";
  watermarkSettings.rows = clampNum(Number(watermarkRowsInput ? watermarkRowsInput.value : 4), 1, 8);
  watermarkSettings.cols = clampNum(Number(watermarkColsInput ? watermarkColsInput.value : 3), 1, 6);
  watermarkSettings.opacity = clampNum(Number(watermarkOpacityInput ? watermarkOpacityInput.value : 18), 6, 45);
  watermarkSettings.color = normalizeHexColor(
    watermarkColorInput ? watermarkColorInput.value : defaultWatermarkSettings.color,
    defaultWatermarkSettings.color
  );
  watermarkSettings.size = clampNum(Number(watermarkSizeInput ? watermarkSizeInput.value : 28), 14, 56);
  watermarkSettings.rotate = clampNum(Number(watermarkRotateInput ? watermarkRotateInput.value : -27), -60, 60);
}

function writeWatermarkSettingsToInputs() {
  if (showWatermarkInput) showWatermarkInput.checked = !!watermarkSettings.show;
  if (watermarkTextInput) watermarkTextInput.value = watermarkSettings.text || defaultWatermarkSettings.text;
  if (watermarkLayerInput) watermarkLayerInput.value = watermarkSettings.layer || defaultWatermarkSettings.layer;
  if (watermarkRowsInput) watermarkRowsInput.value = `${watermarkSettings.rows}`;
  if (watermarkColsInput) watermarkColsInput.value = `${watermarkSettings.cols}`;
  if (watermarkOpacityInput) watermarkOpacityInput.value = `${watermarkSettings.opacity}`;
  if (watermarkColorInput) watermarkColorInput.value = normalizeHexColor(watermarkSettings.color, defaultWatermarkSettings.color);
  if (watermarkSizeInput) watermarkSizeInput.value = `${watermarkSettings.size}`;
  if (watermarkRotateInput) watermarkRotateInput.value = `${watermarkSettings.rotate}`;
}

function saveWatermarkSettings() {
  const payload = JSON.stringify(watermarkSettings);
  setStoreItem(watermarkStorageKey, payload);
  writeLocalSetting(watermarkStorageKey, payload);
  markLocalSettingUpdated(watermarkStorageKey);
}

function loadWatermarkSettings() {
  try {
    const raw = readStoredOrLocalSetting(watermarkStorageKey);
    if (!raw) {
      watermarkSettings = { ...defaultWatermarkSettings };
      return;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    watermarkSettings = {
      ...defaultWatermarkSettings,
      ...parsed,
      text: typeof parsed.text === "string" && parsed.text.trim() ? parsed.text.trim() : defaultWatermarkSettings.text,
      layer: parsed.layer === "under" ? "under" : "over",
      rows: clampNum(Number(parsed.rows || defaultWatermarkSettings.rows), 1, 8),
      cols: clampNum(Number(parsed.cols || defaultWatermarkSettings.cols), 1, 6),
      opacity: clampNum(Number(parsed.opacity || defaultWatermarkSettings.opacity), 6, 45),
      color: normalizeHexColor(parsed.color || defaultWatermarkSettings.color, defaultWatermarkSettings.color),
      size: clampNum(Number(parsed.size || defaultWatermarkSettings.size), 14, 56),
      rotate: clampNum(Number(parsed.rotate ?? defaultWatermarkSettings.rotate), -60, 60)
    };
  } catch {
    watermarkSettings = { ...defaultWatermarkSettings };
  }
}

function loadPreviewAccessSetting() {
  const cloudValue = getStoreItem(previewAccessStorageKey);
  const localValue = readLocalSetting(previewAccessStorageKey);
  const localTs = localSettingsTs[previewAccessStorageKey] || 0;
  const hasCloud = cloudValue !== null && cloudValue !== undefined;
  const hasLocal = localValue !== null && localValue !== undefined;
  const useLocal = (hasLocal && Date.now() - localTs < 10 * 60 * 1000) || !hasCloud;
  previewAccessEnabled = parseStoredBool(useLocal ? localValue : cloudValue, true);
  if (previewAccessToggle) previewAccessToggle.checked = previewAccessEnabled;
  setPreviewAccessLocalCache(previewAccessEnabled ? "true" : "false");
}

function savePreviewAccessSetting() {
  setStoreItem(previewAccessStorageKey, previewAccessEnabled ? "true" : "false");
  setPreviewAccessLocalCache(previewAccessEnabled ? "true" : "false");
}

function loadPreviewInfoSetting() {
  const cloudValue = getStoreItem(previewInfoStorageKey);
  const localValue = readLocalSetting(previewInfoStorageKey);
  const localTs = localSettingsTs[previewInfoStorageKey] || 0;
  const hasCloud = cloudValue !== null && cloudValue !== undefined;
  const hasLocal = localValue !== null && localValue !== undefined;
  const useLocal = (hasLocal && Date.now() - localTs < 10 * 60 * 1000) || !hasCloud;
  previewInfoEnabled = parseStoredBool(useLocal ? localValue : cloudValue, true);
  if (previewInfoToggle) previewInfoToggle.checked = previewInfoEnabled;
}

function savePreviewInfoSetting() {
  setStoreItem(previewInfoStorageKey, previewInfoEnabled ? "true" : "false");
}

function buildWatermarkMarkup(text, rows, cols) {
  const safeText = escapeHtml(text);
  const lines = [];
  for (let r = 0; r < rows; r += 1) {
    const row = [];
    for (let c = 0; c < cols; c += 1) {
      row.push(`<span>${safeText}</span>`);
    }
    lines.push(`<div class="wm-row">${row.join("")}</div>`);
  }
  return lines.join("");
}

function applyWatermarkToCard(el) {
  if (!el) return;
  el.hidden = !watermarkSettings.show;
  el.style.setProperty("--wm-opacity", `${watermarkSettings.opacity / 100}`);
  el.style.setProperty("--wm-size", `${watermarkSettings.size}px`);
  el.style.setProperty("--wm-rotate", `${watermarkSettings.rotate}deg`);
  el.style.setProperty("--wm-z", watermarkSettings.layer === "under" ? "1" : "10");
  el.style.setProperty("--wm-color-rgb", hexToRgbCss(watermarkSettings.color));
  el.style.setProperty("--wm-rows", `${watermarkSettings.rows}`);
  el.style.setProperty("--wm-cols", `${watermarkSettings.cols}`);
  if (!watermarkSettings.show) return;
  el.innerHTML = buildWatermarkMarkup(watermarkSettings.text, watermarkSettings.rows, watermarkSettings.cols);
}

function renderWatermark() {
  applyWatermarkToCard(frontWatermarkEl);
  applyWatermarkToCard(backWatermarkEl);
}

function handleWatermarkControlsChanged() {
  readWatermarkSettingsFromInputs();
  saveWatermarkSettings();
  renderWatermark();
}

function toggleWatermarkAdjustPanel() {
  if (!watermarkAdjustPanel) return;
  watermarkAdjustPanel.hidden = !watermarkAdjustPanel.hidden;
  if (watermarkAdjustToggle) {
    watermarkAdjustToggle.textContent = watermarkAdjustPanel.hidden
      ? "Adjust Watermark"
      : "Hide Watermark Adjust";
  }
}

loadWatermarkSettings();
writeWatermarkSettingsToInputs();
renderWatermark();

[showWatermarkInput, watermarkTextInput, watermarkLayerInput, watermarkRowsInput, watermarkColsInput, watermarkOpacityInput, watermarkColorInput, watermarkSizeInput, watermarkRotateInput].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", handleWatermarkControlsChanged);
  el.addEventListener("change", handleWatermarkControlsChanged);
});
if (watermarkAdjustToggle) {
  watermarkAdjustToggle.addEventListener("click", toggleWatermarkAdjustPanel);
}

const frontCard = document.getElementById("frontCard");
const backCard = document.getElementById("backCard");
const frontThemeSourceInput = document.getElementById("frontThemeSource");
const backThemeSourceInput = document.getElementById("backThemeSource");
const frontThemeBuiltinRow = document.getElementById("frontThemeBuiltinRow");
const backThemeBuiltinRow = document.getElementById("backThemeBuiltinRow");
const frontThemeFileRow = document.getElementById("frontThemeFileRow");
const backThemeFileRow = document.getElementById("backThemeFileRow");
const frontThemeInput = document.getElementById("frontTheme");
const backThemeInput = document.getElementById("backTheme");
const frontThemeFileInput = document.getElementById("frontThemeFile");
const backThemeFileInput = document.getElementById("backThemeFile");
const frontThemeFileDefaultToggle = document.getElementById("frontThemeFileDefault");
const backThemeFileDefaultToggle = document.getElementById("backThemeFileDefault");
let frontThemeImageUrl;
let backThemeImageUrl;
let frontContrastToken = 0;
let backContrastToken = 0;

function normalizeTheme(theme) {
  const allowed = new Set(["plain", "blue", "emerald", "sunset"]);
  return allowed.has(theme) ? theme : "plain";
}

function applyThemeClass(card, side, themeValue) {
  if (!card) return;
  const theme = normalizeTheme(themeValue);
  card.classList.remove(`theme-plain`, `theme-blue`, `theme-emerald`, `theme-sunset`);
  card.classList.add(`theme-${theme}`);
  if (side === "front" && frontThemeInput) frontThemeInput.value = theme;
  if (side === "back" && backThemeInput) backThemeInput.value = theme;
}

function getThemeSourceMode(side) {
  const sourceInput = side === "front" ? frontThemeSourceInput : backThemeSourceInput;
  if (!sourceInput) return "builtin";
  return sourceInput.value === "file" ? "file" : "builtin";
}

function clearCardThemeImage(side) {
  const isFront = side === "front";
  const card = isFront ? frontCard : backCard;
  const fileInput = isFront ? frontThemeFileInput : backThemeFileInput;
  if (isFront && frontThemeImageUrl) {
    URL.revokeObjectURL(frontThemeImageUrl);
    frontThemeImageUrl = undefined;
  }
  if (!isFront && backThemeImageUrl) {
    URL.revokeObjectURL(backThemeImageUrl);
    backThemeImageUrl = undefined;
  }
  if (fileInput) fileInput.value = "";
  if (card) {
    card.classList.remove("custom-theme-image");
    card.style.removeProperty("background-image");
  }
}

function applyThemeSourceMode(side, mode, shouldClearImage) {
  const normalized = mode === "file" ? "file" : "builtin";
  const isFront = side === "front";
  const sourceInput = isFront ? frontThemeSourceInput : backThemeSourceInput;
  const builtinRow = isFront ? frontThemeBuiltinRow : backThemeBuiltinRow;
  const fileRow = isFront ? frontThemeFileRow : backThemeFileRow;
  const card = isFront ? frontCard : backCard;
  const defaultKey = isFront ? frontThemeFileDefaultId : backThemeFileDefaultId;
  const savedDefaultImage = defaultFieldState.values[defaultKey];

  if (sourceInput) sourceInput.value = normalized;
  if (builtinRow) builtinRow.hidden = normalized !== "builtin";
  if (fileRow) fileRow.hidden = normalized !== "file";

  if (normalized === "builtin" && shouldClearImage) {
    clearCardThemeImage(side);
  }
  if (
    normalized === "file" &&
    card &&
    !card.classList.contains("custom-theme-image") &&
    defaultFieldState.selected.has(defaultKey) &&
    typeof savedDefaultImage === "string" &&
    savedDefaultImage
  ) {
    card.style.backgroundImage = `url("${savedDefaultImage}")`;
    card.classList.add("custom-theme-image");
  }

  renderThemes();
}

function renderThemes() {
  if (frontThemeInput && getThemeSourceMode("front") === "builtin") {
    applyThemeClass(frontCard, "front", frontThemeInput.value);
  }
  if (backThemeInput && getThemeSourceMode("back") === "builtin") {
    applyThemeClass(backCard, "back", backThemeInput.value);
  }
  updateAllCardContrastModes();
}

if (frontThemeInput) {
  frontThemeInput.addEventListener("input", renderThemes);
  frontThemeInput.addEventListener("change", renderThemes);
}

if (backThemeInput) {
  backThemeInput.addEventListener("input", renderThemes);
  backThemeInput.addEventListener("change", renderThemes);
}

if (frontThemeSourceInput) {
  frontThemeSourceInput.addEventListener("input", () => {
    applyThemeSourceMode("front", frontThemeSourceInput.value, true);
  });
  frontThemeSourceInput.addEventListener("change", () => {
    applyThemeSourceMode("front", frontThemeSourceInput.value, true);
  });
}

if (backThemeSourceInput) {
  backThemeSourceInput.addEventListener("input", () => {
    applyThemeSourceMode("back", backThemeSourceInput.value, true);
  });
  backThemeSourceInput.addEventListener("change", () => {
    applyThemeSourceMode("back", backThemeSourceInput.value, true);
  });
}

renderThemes();
applyThemeSourceMode("front", getThemeSourceMode("front"), false);
applyThemeSourceMode("back", getThemeSourceMode("back"), false);

function setCardContrastMode(card, mode) {
  if (!card) return;
  card.setAttribute("data-contrast-mode", mode);
}

function getThemeContrastMode(side, themeValue) {
  const theme = normalizeTheme(themeValue);
  if (theme === "plain") return "light";
  if (side === "front" && theme === "emerald") return "light";
  return "dark";
}

function loadImageFromSource(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image source."));
    img.src = src;
  });
}

function getImageAverageLuma(img) {
  const sampleSize = 56;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
  const data = ctx.getImageData(0, 0, sampleSize, sampleSize).data;

  let totalLuma = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    if (alpha <= 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    totalLuma += getLuma(r, g, b) * alpha;
    count += alpha;
  }

  if (!count) return 255;
  return totalLuma / count;
}

async function updateCardContrastFromImage(card, src, token, side) {
  if (!card || !src) return;
  try {
    const img = await loadImageFromSource(src);
    if ((side === "front" && token !== frontContrastToken) || (side === "back" && token !== backContrastToken)) {
      return;
    }
    const avgLuma = getImageAverageLuma(img);
    setCardContrastMode(card, avgLuma >= 150 ? "light" : "dark");
  } catch {
    setCardContrastMode(card, "dark");
  }
}

function updateFrontCardContrastMode() {
  if (!frontCard) return;
  if (frontCard.classList.contains("custom-theme-image")) {
    frontContrastToken += 1;
    const currentToken = frontContrastToken;
    const src = (frontCard.style.backgroundImage || "").replace(/^url\(["']?/, "").replace(/["']?\)$/, "");
    if (src) {
      updateCardContrastFromImage(frontCard, src, currentToken, "front");
      return;
    }
  }
  const mode = getThemeContrastMode("front", frontThemeInput ? frontThemeInput.value : "plain");
  setCardContrastMode(frontCard, mode);
}

function updateBackCardContrastMode() {
  if (!backCard) return;
  if (backCard.classList.contains("custom-theme-image")) {
    backContrastToken += 1;
    const currentToken = backContrastToken;
    const src = (backCard.style.backgroundImage || "").replace(/^url\(["']?/, "").replace(/["']?\)$/, "");
    if (src) {
      updateCardContrastFromImage(backCard, src, currentToken, "back");
      return;
    }
  }
  const mode = getThemeContrastMode("back", backThemeInput ? backThemeInput.value : "plain");
  setCardContrastMode(backCard, mode);
}

function updateAllCardContrastModes() {
  updateFrontCardContrastMode();
  updateBackCardContrastMode();
}

function setCardThemeImageFromFile(input, card, oldObjectUrl) {
  const file = input && input.files && input.files[0];
  if (!card || !input || !file) {
    if (oldObjectUrl) URL.revokeObjectURL(oldObjectUrl);
    if (card) {
      card.classList.remove("custom-theme-image");
      card.style.removeProperty("background-image");
    }
    return undefined;
  }

  if (oldObjectUrl) URL.revokeObjectURL(oldObjectUrl);
  const objectUrl = URL.createObjectURL(file);
  card.style.backgroundImage = `url("${objectUrl}")`;
  card.classList.add("custom-theme-image");
  return objectUrl;
}

if (frontThemeFileInput) {
  frontThemeFileInput.addEventListener("change", () => {
    applyThemeSourceMode("front", "file", false);
    frontThemeImageUrl = setCardThemeImageFromFile(frontThemeFileInput, frontCard, frontThemeImageUrl);
    updateFrontCardContrastMode();
    const file = frontThemeFileInput.files && frontThemeFileInput.files[0];
    if (frontThemeFileDefaultToggle && frontThemeFileDefaultToggle.checked && file) {
      saveImageDefaultFromFile(file, frontThemeFileDefaultId).catch((err) =>
        setStatus(err.message, true)
      );
    }
    if (frontThemeFileDefaultToggle && frontThemeFileDefaultToggle.checked && !file) {
      delete defaultFieldState.values[frontThemeFileDefaultId];
      saveDefaultFieldState();
    }
    if (frontThemeFileInput.files && frontThemeFileInput.files[0]) {
      setStatus("Front theme photo applied.");
    } else {
      setStatus("Front theme photo cleared.");
    }
  });
}

if (backThemeFileInput) {
  backThemeFileInput.addEventListener("change", () => {
    applyThemeSourceMode("back", "file", false);
    backThemeImageUrl = setCardThemeImageFromFile(backThemeFileInput, backCard, backThemeImageUrl);
    updateBackCardContrastMode();
    const file = backThemeFileInput.files && backThemeFileInput.files[0];
    if (backThemeFileDefaultToggle && backThemeFileDefaultToggle.checked && file) {
      saveImageDefaultFromFile(file, backThemeFileDefaultId).catch((err) =>
        setStatus(err.message, true)
      );
    }
    if (backThemeFileDefaultToggle && backThemeFileDefaultToggle.checked && !file) {
      delete defaultFieldState.values[backThemeFileDefaultId];
      saveDefaultFieldState();
    }
    if (backThemeFileInput.files && backThemeFileInput.files[0]) {
      setStatus("Back theme photo applied.");
    } else {
      setStatus("Back theme photo cleared.");
    }
  });
}

const frontNameEl = document.getElementById("frontName");
const frontPositionEl = document.getElementById("frontPosition");

function fitSingleLineText(el, maxPx, minPx) {
  if (!el) return;
  const text = (el.textContent || "").replace(/\u00A0/g, "").trim();
  el.style.fontSize = `${maxPx}px`;
  if (!text) return;

  let size = maxPx;
  while (size > minPx && el.scrollWidth > el.clientWidth) {
    size -= 0.5;
    el.style.fontSize = `${size}px`;
  }
}

function fitPreviewNameAndPosition() {
  fitSingleLineText(frontNameEl, 17, 8);
  fitSingleLineText(frontPositionEl, 15, 7);
}

function scheduleFitPreviewNameAndPosition() {
  window.requestAnimationFrame(fitPreviewNameAndPosition);
}

const employeeNameInput = document.getElementById("employeeName");
const positionInput = document.getElementById("position");
employeeNameInput.addEventListener("input", scheduleFitPreviewNameAndPosition);
positionInput.addEventListener("input", scheduleFitPreviewNameAndPosition);
window.addEventListener("resize", scheduleFitPreviewNameAndPosition);
scheduleFitPreviewNameAndPosition();

const employeeNoInput = document.getElementById("employeeNo");
const barcodeValueInput = document.getElementById("barcodeValue");
const barcodeSvg = document.getElementById("barcodeSvg");
const backQrCanvas = document.getElementById("backQrCanvas");
const QR_CANVAS_SIZE = 96;
const QR_DRAW_MARGIN = 0;
const QR_SOURCE_SIZE = 512;
const QR_LOGO_BOX_RATIO = 0.2;
const QR_LOGO_IMAGE_RATIO = 0.16;
const QR_LOGO_MIN_SIZE = 24;
const qrPublicBaseUrlStorageKey = "idCardCreatorQrBaseUrlV1";
let backQrEngine;
const backQrSourceCanvas = document.createElement("canvas");
const backQrExportCanvas = document.createElement("canvas");
let qrOverrideValue = "";

const code39Patterns = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  "*": "nwnnwnwnn"
};

function getBarcodeSource() {
  const custom = (barcodeValueInput.value || "").trim();
  return custom;
}

function getQrSource() {
  if (qrOverrideValue) return qrOverrideValue;
  const custom = (barcodeValueInput.value || "").trim();
  const employeeNo = (employeeNoInput.value || "").trim();
  return custom || employeeNo || "ID CARD";
}

function buildRecordPreviewUrl(tokenOrId) {
  const safeToken = encodeURIComponent(String(tokenOrId || "").trim());
  if (!safeToken) return "";
  const relativePath = `p.html?t=${safeToken}`;
  try {
    const preferredBase = getStoreItem(qrPublicBaseUrlStorageKey);
    if (preferredBase && preferredBase.trim()) {
      return new URL(relativePath, preferredBase.trim()).href;
    }
  } catch {}
  try {
    return new URL(relativePath, window.location.href).href;
  } catch {}
  return relativePath;
}

function runOnNextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function resolvePublicUrl(relativePath) {
  const path = String(relativePath || "").trim();
  if (!path) return "";
  try {
    const preferredBase = getStoreItem(qrPublicBaseUrlStorageKey);
    if (preferredBase && preferredBase.trim()) {
      return new URL(path, preferredBase.trim()).href;
    }
  } catch {}
  try {
    return new URL(path, window.location.href).href;
  } catch {}
  return path;
}

function generateToken(length = 10) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function waitForUiPaint(frames = 2) {
  for (let i = 0; i < frames; i += 1) {
    await runOnNextFrame();
  }
}

let navigationInProgress = false;
function navigateWithTransition(url, { replace = false, delay = 210 } = {}) {
  if (!url || navigationInProgress) return;
  navigationInProgress = true;
  if (document.body) document.body.classList.add("page-leave");
  window.setTimeout(() => {
    if (replace) {
      window.location.replace(url);
      return;
    }
    window.location.href = url;
  }, Math.max(0, delay));
}

function renderBarcode(value) {
  const raw = (value || "").toUpperCase().replace(/[^0-9A-Z .-]/g, "");
  if (!raw) {
    barcodeSvg.innerHTML = "";
    barcodeSvg.style.display = "none";
    return;
  }

  barcodeSvg.style.display = "block";
  const payload = `*${raw}*`;
  const narrow = 2;
  const wide = 4;
  const gap = 2;

  let totalWidth = 0;
  for (let i = 0; i < payload.length; i += 1) {
    const pattern = code39Patterns[payload[i]] || code39Patterns["0"];
    for (let j = 0; j < pattern.length; j += 1) {
      totalWidth += pattern[j] === "w" ? wide : narrow;
    }
    totalWidth += gap;
  }

  const canvasWidth = 300;
  let x = Math.max((canvasWidth - totalWidth) / 2, 0);
  let bars = "";
  for (let i = 0; i < payload.length; i += 1) {
    const ch = payload[i];
    const pattern = code39Patterns[ch] || code39Patterns["0"];
    for (let j = 0; j < pattern.length; j += 1) {
      const width = pattern[j] === "w" ? wide : narrow;
      if (j % 2 === 0) {
        bars += `<rect x="${x}" y="2" width="${width}" height="74" fill="#111"/>`;
      }
      x += width;
    }
    x += gap;
  }

  barcodeSvg.setAttribute("viewBox", "0 0 300 78");
  barcodeSvg.innerHTML = bars;
}

function updateBarcode() {
  renderBarcode(getBarcodeSource());
  updateBackQr();
}

function pathRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.floor(Math.min(w, h) / 2)));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function getQrCenterLogoImage() {
  const img = document.getElementById("frontLogo");
  if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
  const src = String(img.currentSrc || img.src || "").trim().toLowerCase();
  if (!src) return null;
  const isTransparentPlaceholder =
    src.startsWith("data:image/svg+xml") &&
    (src.includes("fill='transparent'") || src.includes("fill=%27transparent%27"));
  if (isTransparentPlaceholder) return null;
  return img;
}

function drawQrCenterLogoInRect(ctx, x, y, w, h) {
  if (!ctx) return;
  const logoImage = getQrCenterLogoImage();
  if (!logoImage) return;
  const size = Math.max(1, Math.min(w || 0, h || 0));
  const logoBoxSide = Math.max(QR_LOGO_MIN_SIZE + 10, Math.round(size * QR_LOGO_BOX_RATIO));
  const logoSide = Math.max(QR_LOGO_MIN_SIZE, Math.round(size * QR_LOGO_IMAGE_RATIO));
  const cx = Math.round(x + w / 2);
  const cy = Math.round(y + h / 2);
  const boxX = Math.floor(cx - logoBoxSide / 2);
  const boxY = Math.floor(cy - logoBoxSide / 2);
  const logoX = Math.floor(cx - logoSide / 2);
  const logoY = Math.floor(cy - logoSide / 2);
  const radius = Math.max(6, Math.round(logoBoxSide * 0.18));

  ctx.save();
  ctx.fillStyle = "#ffffff";
  pathRoundedRect(ctx, boxX, boxY, logoBoxSide, logoBoxSide, radius);
  ctx.fill();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(logoImage, logoX, logoY, logoSide, logoSide);
  ctx.restore();
}

function drawQrCenterLogoOnCanvas(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawQrCenterLogoInRect(ctx, 0, 0, canvas.width || 0, canvas.height || 0);
}

function drawQrCenterLogo() {
  drawQrCenterLogoOnCanvas(backQrSourceCanvas);
}

function getCanvasInkBounds(canvas) {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const w = canvas.width || 0;
  const h = canvas.height || 0;
  if (!w || !h) return null;
  let data;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return { x: 0, y: 0, w, h };
  }

  const isInk = (idx) => {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];
    return a > 8 && (r < 245 || g < 245 || b < 245);
  };

  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = (y * w + x) * 4;
      if (!isInk(idx)) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, w, h };
  }

  return {
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX + 1),
    h: Math.max(1, maxY - minY + 1)
  };
}

function updateBackQr() {
  if (!backQrCanvas || typeof window.QRious !== "function") return;
  const wrapSize = backQrWrap
    ? Math.max(
        Math.round(Math.min(backQrWrap.clientWidth || 0, backQrWrap.clientHeight || 0)),
        0
      )
    : 0;
  const fitSize = wrapSize > 0 ? wrapSize : QR_CANVAS_SIZE;
  backQrCanvas.width = fitSize;
  backQrCanvas.height = fitSize;
  backQrCanvas.style.width = "100%";
  backQrCanvas.style.height = "100%";
  backQrSourceCanvas.width = QR_SOURCE_SIZE;
  backQrSourceCanvas.height = QR_SOURCE_SIZE;
  if (!backQrEngine) {
    backQrEngine = new window.QRious({
      element: backQrSourceCanvas,
      size: QR_SOURCE_SIZE,
      value: "ID CARD",
      level: "H",
      foreground: "#111111",
      background: "#ffffff",
      padding: 0
    });
  }
  backQrEngine.size = QR_SOURCE_SIZE;
  backQrEngine.level = "H";
  backQrEngine.value = getQrSource();
  drawQrCenterLogo();

  const ctx = backQrCanvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, fitSize, fitSize);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, fitSize, fitSize);
  ctx.imageSmoothingEnabled = false;
  const drawSide = Math.max(1, fitSize - QR_DRAW_MARGIN * 2);
  const drawOffset = Math.floor((fitSize - drawSide) / 2);
  ctx.drawImage(
    backQrSourceCanvas,
    0,
    0,
    backQrSourceCanvas.width || QR_SOURCE_SIZE,
    backQrSourceCanvas.height || QR_SOURCE_SIZE,
    drawOffset,
    drawOffset,
    drawSide,
    drawSide
  );
}

function renderQrVisibility() {
  const showQr = !showQrCodeInput || !!showQrCodeInput.checked;
  if (backQrWrap) backQrWrap.hidden = !showQr;
  if (backCard) backCard.classList.toggle("qr-hidden", !showQr);
  if (qrAdjustToggle) qrAdjustToggle.disabled = !showQr;
  if (qrAdjustPanel && !showQr) qrAdjustPanel.hidden = true;
}

employeeNoInput.addEventListener("input", updateBarcode);
barcodeValueInput.addEventListener("input", updateBarcode);

updateBarcode();
updateBackQr();
renderQrVisibility();
window.addEventListener("resize", updateBackQr);

if (showQrCodeInput) {
  showQrCodeInput.addEventListener("input", renderQrVisibility);
  showQrCodeInput.addEventListener("change", renderQrVisibility);
}
if (previewAccessToggle) {
  previewAccessToggle.addEventListener("input", () => {
    previewAccessEnabled = !!previewAccessToggle.checked;
    savePreviewAccessSetting();
    writeLocalSetting(previewAccessStorageKey, previewAccessEnabled ? "true" : "false");
    markLocalSettingUpdated(previewAccessStorageKey);
  });
  previewAccessToggle.addEventListener("change", () => {
    previewAccessEnabled = !!previewAccessToggle.checked;
    savePreviewAccessSetting();
    writeLocalSetting(previewAccessStorageKey, previewAccessEnabled ? "true" : "false");
    markLocalSettingUpdated(previewAccessStorageKey);
  });
}
if (previewInfoToggle) {
  previewInfoToggle.addEventListener("input", () => {
    previewInfoEnabled = !!previewInfoToggle.checked;
    savePreviewInfoSetting();
    writeLocalSetting(previewInfoStorageKey, previewInfoEnabled ? "true" : "false");
    markLocalSettingUpdated(previewInfoStorageKey);
  });
  previewInfoToggle.addEventListener("change", () => {
    previewInfoEnabled = !!previewInfoToggle.checked;
    savePreviewInfoSetting();
    writeLocalSetting(previewInfoStorageKey, previewInfoEnabled ? "true" : "false");
    markLocalSettingUpdated(previewInfoStorageKey);
  });
}

const companyMainNameInput =
  document.getElementById("companyMainName") || document.getElementById("companyName");
const companySubNameInput = document.getElementById("companySubName");
const brandLines = document.querySelector(".brand-lines");
const frontKaking = document.getElementById("frontKaking");
const frontCompany = document.getElementById("frontCompany");
const frontCompanyImage = document.getElementById("frontCompanyImage");
const companyTextModeInput = document.getElementById("companyTextMode");
const companyFontFamilyInput = document.getElementById("companyFontFamily");
const companyMainColorInput = document.getElementById("companyMainColor");
const companySubColorInput = document.getElementById("companySubColor");
const companyNameImageRow = document.getElementById("companyNameImageRow");
const companyNameImageFileInput = document.getElementById("companyNameImageFile");
const companyX = document.getElementById("companyX");
const companyY = document.getElementById("companyY");
const companySubX = document.getElementById("companySubX");
const companySubY = document.getElementById("companySubY");
const companyMainFont = document.getElementById("companyMainFont");
const companySubFont = document.getElementById("companySubFont");
const companyAdjustToggle = document.getElementById("companyAdjustToggle");
const companyAdjustPanel = document.getElementById("companyAdjustPanel");

function renderCompany() {
  const mainValue = (companyMainNameInput && companyMainNameInput.value ? companyMainNameInput.value : "").trim();
  const subValue = (companySubNameInput && companySubNameInput.value ? companySubNameInput.value : "").trim();

  if (!mainValue && !subValue) {
    frontKaking.textContent = "\u00A0";
    frontCompany.textContent = "\u00A0";
    return;
  }

  frontKaking.textContent = mainValue || "\u00A0";
  frontCompany.textContent = subValue || "\u00A0";
  renderCompanyAdjustments();
}

function fitBrandText(element, maxPx, minPx) {
  if (!element) return;
  const floor = Number.isFinite(minPx) ? minPx : 10;
  let size = Number.isFinite(maxPx) ? maxPx : 28;
  element.style.fontSize = `${size}px`;
  while (element.scrollWidth > element.clientWidth && size > floor) {
    size -= 0.5;
    element.style.fontSize = `${size}px`;
  }
}

if (companyMainNameInput) {
  companyMainNameInput.addEventListener("input", renderCompany);
}
if (companySubNameInput) {
  companySubNameInput.addEventListener("input", renderCompany);
}
renderCompany();

function renderCompanyAdjustments() {
  frontKaking.style.fontFamily = (companyFontFamilyInput && companyFontFamilyInput.value) || "Oswald";
  frontCompany.style.fontFamily = (companyFontFamilyInput && companyFontFamilyInput.value) || "Oswald";
  frontKaking.style.color = (companyMainColorInput && companyMainColorInput.value) || "#ffffff";
  frontCompany.style.color = (companySubColorInput && companySubColorInput.value) || "#f3c84d";
  frontKaking.style.transform = `translate(${companyX ? companyX.value : 0}px, ${companyY ? companyY.value : 0}px)`;
  frontCompany.style.transform = `translate(${companySubX ? companySubX.value : 0}px, ${companySubY ? companySubY.value : 0}px)`;
  if (!brandLines.hidden) {
    fitBrandText(frontKaking, Number(companyMainFont.value), 10);
    fitBrandText(frontCompany, Number(companySubFont.value), 9);
  } else {
    frontKaking.style.fontSize = `${companyMainFont.value}px`;
    frontCompany.style.fontSize = `${companySubFont.value}px`;
  }
}

[companyX, companyY, companySubX, companySubY, companyMainFont, companySubFont, companyFontFamilyInput, companyMainColorInput, companySubColorInput].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", renderCompanyAdjustments);
  el.addEventListener("change", renderCompanyAdjustments);
});

renderCompanyAdjustments();
window.addEventListener("resize", renderCompanyAdjustments);

function setCompanyDisplayMode(mode) {
  const normalized = mode === "image" ? "image" : "text";
  if (companyTextModeInput) companyTextModeInput.value = normalized;
  if (brandLines) brandLines.hidden = normalized !== "text";
  if (frontCompanyImage) frontCompanyImage.hidden = normalized !== "image";
  if (companyNameImageRow) companyNameImageRow.hidden = normalized !== "image";
  renderCompanyAdjustments();
}

const frontLogo = document.getElementById("frontLogo");
const logoFileInput = document.getElementById("logoFile");
const logoDefaultToggle = document.getElementById("logoFileDefault");
const logoAdjustToggle = document.getElementById("logoAdjustToggle");
const logoAdjustPanel = document.getElementById("logoAdjustPanel");
const profilePhoto = document.getElementById("profilePhoto");
const photoRing = document.getElementById("photoRing");
const profileMask = document.getElementById("profileMask");
const photoFileInput = document.getElementById("photoFile");
const profileFrameShapeInput = document.getElementById("profileFrameShape");
const profileFrameSizeInput = document.getElementById("profileFrameSize");
const profileAdjustToggle = document.getElementById("profileAdjustToggle");
const profileAdjustPanel = document.getElementById("profileAdjustPanel");
const profileFrameAdjustToggle = document.getElementById("profileFrameAdjustToggle");
const profileFrameAdjustPanel = document.getElementById("profileFrameAdjustPanel");
const employeeSignature = document.getElementById("employeeSignature");
const signatureFileInput = document.getElementById("signatureFile");
const signatureColorInput = document.getElementById("signatureColor");
const authorizedSignature = document.getElementById("authorizedSignature");
const authSignatureModeInput = document.getElementById("authSignatureMode");
const authSignatureColorInput = document.getElementById("authSignatureColor");
const authSignatureUploadRow = document.getElementById("authSignatureUploadRow");
const authSignatureFileInput = document.getElementById("authSignatureFile");
const authSignatureDefaultToggle = document.getElementById("authSignatureFileDefault");
const authSignatureAdjustToggle = document.getElementById("authSignatureAdjustToggle");
const authSignatureAdjustPanel = document.getElementById("authSignatureAdjustPanel");
const authSignaturePadWrap = document.getElementById("authSignaturePadWrap");
const authSignaturePad = document.getElementById("authSignaturePad");
const clearAuthSignaturePadBtn = document.getElementById("clearAuthSignaturePad");
const useAuthPadSignatureBtn = document.getElementById("useAuthPadSignature");
const signatureModeInput = document.getElementById("signatureMode");
const signatureUploadRow = document.getElementById("signatureUploadRow");
const signatureAdjustToggle = document.getElementById("signatureAdjustToggle");
const signatureAdjustPanel = document.getElementById("signatureAdjustPanel");
const signaturePadWrap = document.getElementById("signaturePadWrap");
const signaturePad = document.getElementById("signaturePad");
const clearSignaturePadBtn = document.getElementById("clearSignaturePad");
const usePadSignatureBtn = document.getElementById("usePadSignature");
const signaturePadSourceRow = document.getElementById("signaturePadSourceRow");
const signaturePadSource = document.getElementById("signaturePadSource");
const signaturePhonePanel = document.getElementById("signaturePhonePanel");
const signaturePhoneQr = document.getElementById("signaturePhoneQr");
const signaturePhoneLink = document.getElementById("signaturePhoneLink");
const signaturePhoneStatus = document.getElementById("signaturePhoneStatus");
const signaturePhoneCopy = document.getElementById("signaturePhoneCopy");
const signaturePhoneCancel = document.getElementById("signaturePhoneCancel");
const logoX = document.getElementById("logoX");
const logoY = document.getElementById("logoY");
const logoScale = document.getElementById("logoScale");

const fallbackLogo =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Crect width='100%25' height='100%25' fill='transparent'/%3E%3C/svg%3E";
const fallbackPhoto =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='340' height='340'%3E%3Crect width='100%25' height='100%25' fill='%23d7d7d7'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23666' font-size='28' font-family='Arial'%3EPHOTO%3C/text%3E%3C/svg%3E";
const fallbackSignature =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='120'%3E%3Crect width='100%25' height='100%25' fill='transparent'/%3E%3C/svg%3E";
const fallbackCompanyNameImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='120'%3E%3Crect width='100%25' height='100%25' fill='transparent'/%3E%3C/svg%3E";

let logoUrl;
let photoUrl;
let signatureUrl;
let authSignatureUrl;
let companyNameImageUrl;
let employeeSignatureBaseDataUrl = fallbackSignature;
let authorizedSignatureBaseDataUrl = fallbackSignature;
let employeeSignatureColorToken = 0;
let authorizedSignatureColorToken = 0;
let employeeSignatureRenderPromise = Promise.resolve();
let authorizedSignatureRenderPromise = Promise.resolve();

function setImageFromFile(input, element, fallback, oldObjectUrl) {
  const file = input.files && input.files[0];
  if (!file) {
    element.src = fallback;
    return oldObjectUrl;
  }

  if (oldObjectUrl) URL.revokeObjectURL(oldObjectUrl);

  const objectUrl = URL.createObjectURL(file);
  element.src = objectUrl;
  return objectUrl;
}

function syncEntryLoginLogo() {
  if (!entryLoginLogo || !frontLogo) return;
  entryLoginLogo.src = frontLogo.src || fallbackLogo;
}

function persistCurrentLogoDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return;
  if (!dataUrl.startsWith("data:image/")) return;
  try {
    setStoreItem(currentLogoStorageKey, dataUrl);
  } catch {
    // ignore storage errors
  }
}

function persistCurrentLogoFromFile(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (dataUrl) persistCurrentLogoDataUrl(dataUrl);
      resolve();
    };
    reader.onerror = () => resolve();
    reader.readAsDataURL(file);
  });
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load selected image."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Failed to read selected file."));
    reader.readAsDataURL(file);
  });
}

function parseHexColor(color) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#111111";
  return {
    r: Number.parseInt(safe.slice(1, 3), 16),
    g: Number.parseInt(safe.slice(3, 5), 16),
    b: Number.parseInt(safe.slice(5, 7), 16)
  };
}

async function tintSignatureDataUrl(dataUrl, color) {
  if (!dataUrl || dataUrl === fallbackSignature) return fallbackSignature;
  const img = await loadImageFromSource(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width || 1;
  canvas.height = img.naturalHeight || img.height || 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const rgb = parseHexColor(color);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = rgb.r;
    data[i + 1] = rgb.g;
    data[i + 2] = rgb.b;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

function getSelectedSignatureColor(inputEl) {
  if (!inputEl || !inputEl.value) return "#111111";
  return /^#[0-9a-fA-F]{6}$/.test(inputEl.value) ? inputEl.value : "#111111";
}

function waitForImageReady(imgEl, timeoutMs = 2500) {
  return new Promise((resolve) => {
    if (!imgEl) {
      resolve();
      return;
    }
    if (imgEl.complete && (imgEl.naturalWidth > 0 || imgEl.src === fallbackSignature)) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      imgEl.removeEventListener("load", onDone);
      imgEl.removeEventListener("error", onDone);
      clearTimeout(timer);
      resolve();
    };
    const onDone = () => finish();
    const timer = setTimeout(finish, Math.max(200, timeoutMs));
    imgEl.addEventListener("load", onDone, { once: true });
    imgEl.addEventListener("error", onDone, { once: true });
  });
}

async function flushSignatureRenders() {
  try {
    await Promise.all([employeeSignatureRenderPromise, authorizedSignatureRenderPromise]);
  } catch {
    // Signature fallback paths already handle render failures.
  }
  await Promise.all([waitForImageReady(employeeSignature), waitForImageReady(authorizedSignature)]);
}

function renderEmployeeSignatureFromBase() {
  const token = ++employeeSignatureColorToken;
  const base = employeeSignatureBaseDataUrl || fallbackSignature;
  const color = getSelectedSignatureColor(signatureColorInput);
  if (base === fallbackSignature) {
    employeeSignature.src = fallbackSignature;
    employeeSignatureRenderPromise = waitForImageReady(employeeSignature);
    return employeeSignatureRenderPromise;
  }
  employeeSignatureRenderPromise = tintSignatureDataUrl(base, color)
    .then(async (colored) => {
      if (token !== employeeSignatureColorToken) return;
      employeeSignature.src = colored;
      await waitForImageReady(employeeSignature);
    })
    .catch(async () => {
      if (token !== employeeSignatureColorToken) return;
      employeeSignature.src = base;
      await waitForImageReady(employeeSignature);
    });
  return employeeSignatureRenderPromise;
}

function renderAuthorizedSignatureFromBase() {
  const token = ++authorizedSignatureColorToken;
  const base = authorizedSignatureBaseDataUrl || fallbackSignature;
  const color = getSelectedSignatureColor(authSignatureColorInput);
  if (base === fallbackSignature) {
    if (authorizedSignature) authorizedSignature.src = fallbackSignature;
    authorizedSignatureRenderPromise = waitForImageReady(authorizedSignature);
    return authorizedSignatureRenderPromise;
  }
  authorizedSignatureRenderPromise = tintSignatureDataUrl(base, color)
    .then(async (colored) => {
      if (token !== authorizedSignatureColorToken) return;
      if (authorizedSignature) authorizedSignature.src = colored;
      await waitForImageReady(authorizedSignature);
    })
    .catch(async () => {
      if (token !== authorizedSignatureColorToken) return;
      if (authorizedSignature) authorizedSignature.src = base;
      await waitForImageReady(authorizedSignature);
    });
  return authorizedSignatureRenderPromise;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getCornerAverageRgb(data, width, height) {
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1]
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  corners.forEach(([x, y]) => {
    const i = (y * width + x) * 4;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  });
  return { r: r / 4, g: g / 4, b: b / 4 };
}

function getLuma(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function findForegroundBounds(data, width, height, bg, threshold) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const dist = Math.hypot(r - bg.r, g - bg.g, b - bg.b);
      if (dist > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) return null;
  return { minX, minY, maxX, maxY };
}

async function autoCenterProfileToSquareDataUrl(file) {
  // Keep full uploaded photo as-is (no automatic square crop).
  const img = await loadImageFromFile(file);
  const out = document.createElement("canvas");
  out.width = img.naturalWidth || img.width || 1;
  out.height = img.naturalHeight || img.height || 1;
  const outCtx = out.getContext("2d");
  outCtx.drawImage(img, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

function removeSignatureBackgroundDataUrl(file) {
  return loadImageFromFile(file).then((img) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    const cornerBg = getCornerAverageRgb(data, canvas.width, canvas.height);
    const edgeBg = {
      r: (data[0] + data[(canvas.width - 1) * 4] + data[(canvas.width * (canvas.height - 1)) * 4]) / 3,
      g:
        (data[1] +
          data[(canvas.width - 1) * 4 + 1] +
          data[(canvas.width * (canvas.height - 1)) * 4 + 1]) /
        3,
      b:
        (data[2] +
          data[(canvas.width - 1) * 4 + 2] +
          data[(canvas.width * (canvas.height - 1)) * 4 + 2]) /
        3
    };
    const bg = {
      r: (cornerBg.r + edgeBg.r) / 2,
      g: (cornerBg.g + edgeBg.g) / 2,
      b: (cornerBg.b + edgeBg.b) / 2
    };
    const bgLuma = getLuma(bg.r, bg.g, bg.b);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      const luma = getLuma(r, g, b);
      const dist = Math.hypot(r - bg.r, g - bg.g, b - bg.b);
      const inkStrength = bgLuma - luma;

      // Stronger paper cleanup to remove gray shadows and uneven lighting.
      if (inkStrength <= 22 && dist <= 36) {
        data[i + 3] = 0;
      } else if (inkStrength <= 48 && dist <= 68) {
        const alphaBoost = clamp((inkStrength - 18) * 6, 0, 255);
        data[i + 3] = Math.round(clamp(alphaBoost, 0, a));
      } else {
        // Normalize stroke to dark ink so it stays visible on light backgrounds.
        const dark = Math.round(clamp(8 + inkStrength * 0.4, 0, 52));
        data[i] = dark;
        data[i + 1] = dark;
        data[i + 2] = dark;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Trim transparent edges.
    const trimmed = document.createElement("canvas");
    const tctx = trimmed.getContext("2d", { willReadFrequently: true });
    const finalData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = 0;
    let maxY = 0;
    let found = false;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const idx = (y * canvas.width + x) * 4 + 3;
        if (finalData[idx] > 18) {
          found = true;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (!found) return fallbackSignature;

    const pad = 10;
    minX = clamp(minX - pad, 0, canvas.width - 1);
    minY = clamp(minY - pad, 0, canvas.height - 1);
    maxX = clamp(maxX + pad, 0, canvas.width - 1);
    maxY = clamp(maxY + pad, 0, canvas.height - 1);

    const w = Math.max(maxX - minX + 1, 1);
    const h = Math.max(maxY - minY + 1, 1);
    trimmed.width = w;
    trimmed.height = h;
    tctx.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
    return trimmed.toDataURL("image/png");
  });
}

function initSignaturePad() {
  if (!signaturePad) return;
  const ctx = signaturePad.getContext("2d");
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#111";

  let drawing = false;
  let hasInk = false;
  let lastX = 0;
  let lastY = 0;

  function getPointFromEvent(evt) {
    const rect = signaturePad.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) * signaturePad.width) / rect.width;
    const y = ((evt.clientY - rect.top) * signaturePad.height) / rect.height;
    return { x, y };
  }

  function startDraw(evt) {
    evt.preventDefault();
    const { x, y } = getPointFromEvent(evt);
    drawing = true;
    lastX = x;
    lastY = y;
  }

  function draw(evt) {
    if (!drawing) return;
    evt.preventDefault();
    const { x, y } = getPointFromEvent(evt);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastX = x;
    lastY = y;
    hasInk = true;
  }

  function stopDraw() {
    drawing = false;
  }

  function clearPad() {
    ctx.clearRect(0, 0, signaturePad.width, signaturePad.height);
    hasInk = false;
    if (signatureModeInput && signatureModeInput.value === "draw") {
      employeeSignatureBaseDataUrl = fallbackSignature;
      renderEmployeeSignatureFromBase();
    }
  }

  function usePadSignature() {
    if (!hasInk) {
      setStatus("Draw your signature on the pad first.", true);
      return;
    }
    employeeSignatureBaseDataUrl = signaturePad.toDataURL("image/png");
    renderEmployeeSignatureFromBase();
    applySignatureAdjustDefaults();
    renderAdjustments();
    setStatus("Electronic signature applied.");
  }

  signaturePad.addEventListener("pointerdown", startDraw);
  signaturePad.addEventListener("pointermove", draw);
  signaturePad.addEventListener("pointerup", stopDraw);
  signaturePad.addEventListener("pointerleave", stopDraw);
  signaturePad.addEventListener("pointercancel", stopDraw);

  if (clearSignaturePadBtn) {
    clearSignaturePadBtn.addEventListener("click", clearPad);
  }
  if (usePadSignatureBtn) {
    usePadSignatureBtn.addEventListener("click", usePadSignature);
  }
}

  function initAuthSignaturePad() {
    if (!authSignaturePad) return;
  const ctx = authSignaturePad.getContext("2d");
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#111";

  let drawing = false;
  let hasInk = false;
  let lastX = 0;
  let lastY = 0;

  function getPointFromEvent(evt) {
    const rect = authSignaturePad.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) * authSignaturePad.width) / rect.width;
    const y = ((evt.clientY - rect.top) * authSignaturePad.height) / rect.height;
    return { x, y };
  }

  function startDraw(evt) {
    evt.preventDefault();
    const { x, y } = getPointFromEvent(evt);
    drawing = true;
    lastX = x;
    lastY = y;
  }

  function draw(evt) {
    if (!drawing) return;
    evt.preventDefault();
    const { x, y } = getPointFromEvent(evt);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastX = x;
    lastY = y;
    hasInk = true;
  }

  function stopDraw() {
    drawing = false;
  }

  function clearPad() {
    ctx.clearRect(0, 0, authSignaturePad.width, authSignaturePad.height);
    hasInk = false;
    if (authSignatureModeInput && authSignatureModeInput.value === "draw" && authorizedSignature) {
      authorizedSignatureBaseDataUrl = fallbackSignature;
      renderAuthorizedSignatureFromBase();
    }
  }

  function usePadSignature() {
    if (!hasInk) {
      setStatus("Draw the authorized signature first.", true);
      return;
    }
    authorizedSignatureBaseDataUrl = authSignaturePad.toDataURL("image/png");
    renderAuthorizedSignatureFromBase();
    if (authSignatureX) authSignatureX.value = "0";
    if (authSignatureY) authSignatureY.value = "0";
    if (authSignatureScale) authSignatureScale.value = "100";
    renderAdjustments();
    if (authSignatureDefaultToggle && authSignatureDefaultToggle.checked && authorizedSignatureBaseDataUrl) {
      defaultFieldState.values[authSignatureDefaultId] = authorizedSignatureBaseDataUrl;
      saveDefaultFieldState();
    }
    setStatus("Authorized electronic signature applied.");
  }

  authSignaturePad.addEventListener("pointerdown", startDraw);
  authSignaturePad.addEventListener("pointermove", draw);
  authSignaturePad.addEventListener("pointerup", stopDraw);
  authSignaturePad.addEventListener("pointerleave", stopDraw);
  authSignaturePad.addEventListener("pointercancel", stopDraw);

  if (clearAuthSignaturePadBtn) {
    clearAuthSignaturePadBtn.addEventListener("click", clearPad);
  }
  if (useAuthPadSignatureBtn) {
    useAuthPadSignatureBtn.addEventListener("click", usePadSignature);
  }
}

function setSignatureMode(mode) {
  const normalized = mode === "draw" ? "draw" : "upload";
  if (signatureModeInput) signatureModeInput.value = normalized;
  if (signatureUploadRow) signatureUploadRow.hidden = normalized !== "upload";
  if (signaturePadSourceRow) signaturePadSourceRow.hidden = normalized !== "draw";
  if (signatureFileInput) signatureFileInput.disabled = normalized !== "upload";
  if (normalized === "draw") {
    setStatus("Draw your signature, then click Use Drawn Signature.");
    updateSignaturePadSource("phone");
  } else {
    clearSignaturePhoneRequest();
    if (signaturePadWrap) signaturePadWrap.hidden = true;
  }
}

function updateSignaturePadSource(source) {
  const mode = signatureModeInput ? signatureModeInput.value : "upload";
  let resolved = source === "phone" ? "phone" : "desktop";
  if (resolved === "phone" && !supabaseClient) {
    resolved = "desktop";
    setStatus("Phone pad unavailable. Using desktop pad instead.", true);
  }
  if (signaturePadSource) signaturePadSource.value = resolved;
  if (mode !== "draw") {
    if (signaturePadWrap) signaturePadWrap.hidden = true;
    clearSignaturePhoneRequest();
    return;
  }
  if (resolved === "phone") {
    if (signaturePadWrap) signaturePadWrap.hidden = true;
    startSignaturePhoneRequest();
  } else {
    clearSignaturePhoneRequest();
    if (signaturePadWrap) signaturePadWrap.hidden = false;
  }
}

function setAuthSignatureMode(mode) {
  const normalized = mode === "draw" ? "draw" : "upload";
  if (authSignatureModeInput) authSignatureModeInput.value = normalized;
  if (authSignatureUploadRow) authSignatureUploadRow.hidden = normalized !== "upload";
  if (authSignaturePadWrap) authSignaturePadWrap.hidden = normalized !== "draw";
  if (authSignatureFileInput) authSignatureFileInput.disabled = normalized !== "upload";
}

  let signaturePhoneRequest = null;
  let signaturePhonePollTimer = null;
  let signaturePhoneQrEngine = null;
  const SIGNATURE_PHONE_POLL_MS = 8000;

function setSignaturePhoneStatus(text, isError = false) {
  if (!signaturePhoneStatus) return;
  signaturePhoneStatus.textContent = text;
  signaturePhoneStatus.style.color = isError ? "#ff8fa0" : "";
}

function stopSignaturePhonePolling() {
  if (signaturePhonePollTimer) clearInterval(signaturePhonePollTimer);
  signaturePhonePollTimer = null;
}

function clearSignaturePhoneRequest() {
  stopSignaturePhonePolling();
  signaturePhoneRequest = null;
  if (signaturePhoneLink) {
    signaturePhoneLink.textContent = "";
    signaturePhoneLink.removeAttribute("href");
  }
  if (signaturePhonePanel) signaturePhonePanel.hidden = true;
  // no toggle button now
}

async function cancelSignaturePhoneRequest() {
  if (signaturePhoneRequest && supabaseClient) {
    try {
      await supabaseClient
        .from("signature_requests")
        .delete()
        .eq("token", signaturePhoneRequest.token);
    } catch {
      // ignore cancel errors
    }
  }
  setSignaturePhoneStatus("Request cancelled.");
  clearSignaturePhoneRequest();
}

  async function pollSignaturePhoneRequest() {
    if (!signaturePhoneRequest || !supabaseClient) return;
    const { token } = signaturePhoneRequest;
    try {
      const { data, error } = await supabaseClient
        .from("signature_requests")
        .select("signature_data, used_at")
        .eq("token", token)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setSignaturePhoneStatus("Signature request not found.", true);
        stopSignaturePhonePolling();
        return;
      }
      if (data.signature_data) {
        employeeSignatureBaseDataUrl = data.signature_data;
        renderEmployeeSignatureFromBase();
        applySignatureAdjustDefaults();
        renderAdjustments();
        setStatus("Signature received from phone.");
        stopSignaturePhonePolling();
        try {
          await supabaseClient
            .from("signature_requests")
            .update({ signature_data: null, used_at: null })
            .eq("token", token);
        } catch {
          // ignore cleanup errors
        }
        clearSignaturePhoneRequest();
      }
    } catch (err) {
      setSignaturePhoneStatus(`Polling failed: ${err.message || err}`, true);
    }
  }

  async function startSignaturePhoneRequest() {
    if (!signaturePhonePanel) return;
    if (!supabaseClient) {
      setSignaturePhoneStatus("Supabase unavailable.", true);
      return;
    }
    signaturePhonePanel.hidden = false;
    setSignaturePhoneStatus("Creating secure link...");
    const token = "shared";
    try {
      const { error } = await supabaseClient
        .from("signature_requests")
        .upsert({ token }, { onConflict: "token" });
      if (error) throw error;
      const url = resolvePublicUrl("signature-pad.html?v=3");
      signaturePhoneRequest = { token, url };
    if (signaturePhoneLink) {
      signaturePhoneLink.textContent = url;
      signaturePhoneLink.href = url;
    }
    if (signaturePhoneQr && typeof window.QRious === "function") {
      if (!signaturePhoneQrEngine) {
        signaturePhoneQrEngine = new window.QRious({
          element: signaturePhoneQr,
          value: url,
          size: 160,
          level: "H"
        });
      } else {
        signaturePhoneQrEngine.value = url;
      }
    }
    setSignaturePhoneStatus("Waiting for signature...");
    stopSignaturePhonePolling();
    signaturePhonePollTimer = setInterval(pollSignaturePhoneRequest, SIGNATURE_PHONE_POLL_MS);
    await pollSignaturePhoneRequest();
  } catch (err) {
    setSignaturePhoneStatus(`Failed to create link: ${err.message || err}`, true);
  }
}

function toggleSignatureAdjustPanel() {
  if (!signatureAdjustPanel) return;
  signatureAdjustPanel.hidden = !signatureAdjustPanel.hidden;
  if (signatureAdjustToggle) {
    signatureAdjustToggle.textContent = signatureAdjustPanel.hidden ? "Adjust" : "Hide Adjust";
  }
}

function toggleProfileAdjustPanel() {
  if (!profileAdjustPanel) return;
  profileAdjustPanel.hidden = !profileAdjustPanel.hidden;
  syncProfileAdjustPreviewMode();
  if (profileAdjustToggle) {
    profileAdjustToggle.textContent = profileAdjustPanel.hidden ? "Adjust" : "Hide Adjust";
  }
}
function toggleProfileFrameAdjustPanel() {
  if (!profileFrameAdjustPanel) return;
  profileFrameAdjustPanel.hidden = !profileFrameAdjustPanel.hidden;
  if (profileFrameAdjustToggle) {
    profileFrameAdjustToggle.textContent = profileFrameAdjustPanel.hidden ? "Adjust" : "Hide Adjust";
  }
}

function syncProfileAdjustPreviewMode() {
  if (!photoRing) return;
  photoRing.classList.remove("adjust-mode");
}

function toggleCompanyAdjustPanel() {
  if (!companyAdjustPanel) return;
  companyAdjustPanel.hidden = !companyAdjustPanel.hidden;
  if (companyAdjustToggle) {
    companyAdjustToggle.textContent = companyAdjustPanel.hidden ? "Adjust" : "Hide Adjust";
  }
}

function toggleLogoAdjustPanel() {
  if (!logoAdjustPanel) return;
  logoAdjustPanel.hidden = !logoAdjustPanel.hidden;
  if (logoAdjustToggle) {
    logoAdjustToggle.textContent = logoAdjustPanel.hidden ? "Adjust Logo" : "Hide Logo Adjust";
  }
}

function toggleQrAdjustPanel() {
  if (!qrAdjustPanel) return;
  qrAdjustPanel.hidden = !qrAdjustPanel.hidden;
  if (qrAdjustToggle) {
    qrAdjustToggle.textContent = qrAdjustPanel.hidden ? "Adjust QR" : "Hide QR Adjust";
  }
}

function toggleAuthSignatureAdjustPanel() {
  if (!authSignatureAdjustPanel) return;
  authSignatureAdjustPanel.hidden = !authSignatureAdjustPanel.hidden;
  if (authSignatureAdjustToggle) {
    authSignatureAdjustToggle.textContent = authSignatureAdjustPanel.hidden ? "Adjust" : "Hide Adjust";
  }
}

logoFileInput.addEventListener("change", () => {
  logoUrl = setImageFromFile(logoFileInput, frontLogo, fallbackLogo, logoUrl);
  syncEntryLoginLogo();
  const file = logoFileInput.files && logoFileInput.files[0];
  if (file) {
    persistCurrentLogoFromFile(file);
  } else {
    persistCurrentLogoDataUrl(fallbackLogo);
  }
  if (!logoDefaultToggle || !logoDefaultToggle.checked) return;
  if (!file) {
    delete defaultFieldState.values[logoDefaultId];
    saveDefaultFieldState();
    return;
  }
  saveLogoDefaultFromFile(file).catch((err) => setStatus(err.message, true));
});

if (companyNameImageFileInput) {
  companyNameImageFileInput.addEventListener("change", () => {
    if (!frontCompanyImage) return;
    companyNameImageUrl = setImageFromFile(
      companyNameImageFileInput,
      frontCompanyImage,
      fallbackCompanyNameImage,
      companyNameImageUrl
    );
  });
}

photoFileInput.addEventListener("change", async () => {
  const file = photoFileInput.files && photoFileInput.files[0];
  if (!file) {
    profilePhoto.src = fallbackPhoto;
    return;
  }
  try {
    const rawDataUrl = await readFileAsDataUrl(file);
    const useAi = !profileAiToggle || profileAiToggle.checked;
    const processed = useAi
      ? await segmentProfileToWhite(rawDataUrl).catch(() => rawDataUrl)
      : rawDataUrl;
    profilePhoto.src = processed || fallbackPhoto;
    photoUrl = processed || rawDataUrl || photoUrl;
    profileX.value = "0";
    profileY.value = "0";
    profileScale.value = "100";
    if (profileRotate) profileRotate.value = "0";
    renderAdjustments();
    setStatus(useAi ? "Profile ready. Background removed and enhanced." : "Profile uploaded.");
  } catch (err) {
    photoUrl = setImageFromFile(photoFileInput, profilePhoto, fallbackPhoto, photoUrl);
    profileX.value = "0";
    profileY.value = "0";
    profileScale.value = "100";
    if (profileRotate) profileRotate.value = "0";
    renderAdjustments();
    setStatus("Profile uploaded. Adjust position and frame as needed.");
  }
});

signatureFileInput.addEventListener("change", () => {
  if (signatureModeInput && signatureModeInput.value === "draw") return;
  const file = signatureFileInput.files && signatureFileInput.files[0];
  if (!file) {
    employeeSignatureBaseDataUrl = fallbackSignature;
    renderEmployeeSignatureFromBase();
    return;
  }
  removeSignatureBackgroundDataUrl(file)
    .then((dataUrl) => {
      employeeSignatureBaseDataUrl = dataUrl;
      renderEmployeeSignatureFromBase();
      applySignatureAdjustDefaults();
      renderAdjustments();
      setStatus("Signature background removed.");
    })
    .catch((err) => {
      signatureUrl = setImageFromFile(
        signatureFileInput,
        employeeSignature,
        fallbackSignature,
        signatureUrl
      );
      employeeSignatureBaseDataUrl = employeeSignature.src || fallbackSignature;
      renderEmployeeSignatureFromBase();
      applySignatureAdjustDefaults();
      renderAdjustments();
      setStatus(`Signature cleanup failed: ${err.message}`, true);
    });
});

if (authSignatureFileInput) {
  authSignatureFileInput.addEventListener("change", () => {
    const file = authSignatureFileInput.files && authSignatureFileInput.files[0];
    if (!file) {
      authorizedSignatureBaseDataUrl = fallbackSignature;
      renderAuthorizedSignatureFromBase();
      if (authSignatureDefaultToggle && authSignatureDefaultToggle.checked) {
        delete defaultFieldState.values[authSignatureDefaultId];
        saveDefaultFieldState();
      }
      return;
    }

    removeSignatureBackgroundDataUrl(file)
      .then((dataUrl) => {
        authorizedSignatureBaseDataUrl = dataUrl;
        renderAuthorizedSignatureFromBase();
        if (authSignatureX) authSignatureX.value = "0";
        if (authSignatureY) authSignatureY.value = "0";
        if (authSignatureScale) authSignatureScale.value = "100";
        renderAdjustments();
        if (authSignatureDefaultToggle && authSignatureDefaultToggle.checked) {
          defaultFieldState.values[authSignatureDefaultId] = authorizedSignatureBaseDataUrl;
          saveDefaultFieldState();
        }
        setStatus("Authorized signature applied.");
      })
      .catch((err) => {
        authSignatureUrl = setImageFromFile(
          authSignatureFileInput,
          authorizedSignature,
          fallbackSignature,
          authSignatureUrl
        );
        if (authSignatureDefaultToggle && authSignatureDefaultToggle.checked && authorizedSignature) {
          authorizedSignatureBaseDataUrl = authorizedSignature.src || fallbackSignature;
          defaultFieldState.values[authSignatureDefaultId] = authorizedSignatureBaseDataUrl;
          saveDefaultFieldState();
        }
        renderAuthorizedSignatureFromBase();
        setStatus(`Authorized signature cleanup failed: ${err.message}`, true);
      });
  });
}

frontLogo.addEventListener("error", () => {
  frontLogo.src = fallbackLogo;
  syncEntryLoginLogo();
  persistCurrentLogoDataUrl(fallbackLogo);
  updateBackQr();
});
frontLogo.addEventListener("load", updateBackQr);

if (frontCompanyImage) {
  frontCompanyImage.addEventListener("error", () => {
    frontCompanyImage.src = fallbackCompanyNameImage;
  });
}

profilePhoto.addEventListener("error", () => {
  profilePhoto.src = fallbackPhoto;
});

employeeSignature.addEventListener("error", () => {
  employeeSignature.src = fallbackSignature;
});

if (authorizedSignature) {
  authorizedSignature.addEventListener("error", () => {
    authorizedSignature.src = fallbackSignature;
  });
}

const profileX = document.getElementById("profileX");
const profileY = document.getElementById("profileY");
const profileScale = document.getElementById("profileScale");
const profileRotate = document.getElementById("profileRotate");
const profileAiToggle = document.getElementById("profileAiToggle");
const profileFrameX = document.getElementById("profileFrameX");
const profileFrameY = document.getElementById("profileFrameY");
const profileFrameSize = document.getElementById("profileFrameSize");
const signatureX = document.getElementById("signatureX");
const signatureY = document.getElementById("signatureY");
const signatureScale = document.getElementById("signatureScale");
const signatureRotate = document.getElementById("signatureRotate");
const authSignatureX = document.getElementById("authSignatureX");
const authSignatureY = document.getElementById("authSignatureY");
const authSignatureScale = document.getElementById("authSignatureScale");
const authSignatureRotate = document.getElementById("authSignatureRotate");

function applySignatureAdjustDefaults() {
  const apply = (el, id, fallback) => {
    if (!el) return;
    const useDefault = defaultFieldState.selected.has(id) && typeof defaultFieldState.values[id] === "string";
    el.value = useDefault ? defaultFieldState.values[id] : fallback;
  };
  apply(signatureX, "signatureX", "0");
  apply(signatureY, "signatureY", "0");
  apply(signatureScale, "signatureScale", "100");
  if (signatureRotate) {
    apply(signatureRotate, "signatureRotate", "0");
  }
}

function renderProfileFrameShape() {
  if (!photoRing) return;
  const shape = profileFrameShapeInput && profileFrameShapeInput.value === "square" ? "square" : "circle";
  if (profileFrameShapeInput) profileFrameShapeInput.value = shape;
  photoRing.classList.toggle("shape-square", shape === "square");
}

function clampRangeInputValue(input, value) {
  const min = Number(input && input.min ? input.min : -Infinity);
  const max = Number(input && input.max ? input.max : Infinity);
  const safeValue = Number.isFinite(value) ? value : 0;
  const clamped = Math.max(min, Math.min(max, safeValue));
  return Math.round(clamped);
}

function getPointerClientPoint(evt) {
  if (!evt) return { x: 0, y: 0 };
  if (typeof evt.clientX === "number" && typeof evt.clientY === "number") {
    return { x: evt.clientX, y: evt.clientY };
  }
  const touch = evt.touches && evt.touches[0];
  if (touch) return { x: touch.clientX, y: touch.clientY };
  return { x: 0, y: 0 };
}

let profileDragState = null;
function startProfileDrag(evt) {
  if (!photoRing || !profileX || !profileY) return;
  if (profileAdjustPanel && profileAdjustPanel.hidden) return;
  if (!evt.altKey) return;
  if (typeof evt.button === "number" && evt.button !== 0) return;
  const point = getPointerClientPoint(evt);
  profileDragState = {
    startX: point.x,
    startY: point.y,
    baseX: Number(profileX.value || 0),
    baseY: Number(profileY.value || 0)
  };
  photoRing.classList.add("profile-dragging");
  if (typeof photoRing.setPointerCapture === "function" && typeof evt.pointerId === "number") {
    try {
      photoRing.setPointerCapture(evt.pointerId);
    } catch {}
  }
  evt.preventDefault();
}

function moveProfileDrag(evt) {
  if (profileAdjustPanel && profileAdjustPanel.hidden) {
    endProfileDrag();
    return;
  }
  if (!profileDragState || !profileX || !profileY) return;
  const point = getPointerClientPoint(evt);
  const dx = point.x - profileDragState.startX;
  const dy = point.y - profileDragState.startY;
  profileX.value = `${clampRangeInputValue(profileX, profileDragState.baseX + dx)}`;
  profileY.value = `${clampRangeInputValue(profileY, profileDragState.baseY + dy)}`;
  renderAdjustments();
}

function endProfileDrag() {
  if (!profileDragState) return;
  profileDragState = null;
  if (photoRing) photoRing.classList.remove("profile-dragging");
}

function renderAdjustments() {
  if (backQrWrap) {
    backQrWrap.style.setProperty("--qr-x", `${qrX ? qrX.value : 0}px`);
    backQrWrap.style.setProperty("--qr-y", `${qrY ? qrY.value : 0}px`);
  }

  if (frontLogo) {
    frontLogo.style.setProperty("--logo-x", `${logoX ? logoX.value : 0}px`);
    frontLogo.style.setProperty("--logo-y", `${logoY ? logoY.value : 0}px`);
    frontLogo.style.setProperty("--logo-scale", `${logoScale ? Number(logoScale.value) / 100 : 1}`);
  }

  profilePhoto.style.setProperty("--profile-x", `${profileX.value}px`);
  profilePhoto.style.setProperty("--profile-y", `${profileY.value}px`);
  profilePhoto.style.setProperty("--profile-scale", `${Number(profileScale.value) / 100}`);
  if (profileRotate) {
    profilePhoto.style.setProperty("--profile-rotate", `${profileRotate.value}deg`);
  }
  if (photoRing && profileFrameX && profileFrameY) {
    photoRing.style.setProperty("--profile-frame-x", `${profileFrameX.value}px`);
    photoRing.style.setProperty("--profile-frame-y", `${profileFrameY.value}px`);
  }
  if (photoRing && profileFrameSize) {
    photoRing.style.setProperty("--profile-frame-size", `${profileFrameSize.value}px`);
  }
  renderProfileFrameShape();

  employeeSignature.style.setProperty("--signature-x", `${signatureX.value}px`);
  employeeSignature.style.setProperty("--signature-y", `${signatureY.value}px`);
  employeeSignature.style.setProperty("--signature-scale", `${Number(signatureScale.value) / 100}`);
  if (signatureRotate) {
    employeeSignature.style.setProperty("--signature-rotate", `${signatureRotate.value}deg`);
  }

  if (authorizedSignature) {
    authorizedSignature.style.setProperty("--auth-signature-x", `${authSignatureX.value}px`);
    authorizedSignature.style.setProperty("--auth-signature-y", `${authSignatureY.value}px`);
    authorizedSignature.style.setProperty(
      "--auth-signature-scale",
      `${Number(authSignatureScale.value) / 100}`
    );
    if (authSignatureRotate) {
      authorizedSignature.style.setProperty("--auth-signature-rotate", `${authSignatureRotate.value}deg`);
    }
  }
}

[qrX, qrY, logoX, logoY, logoScale, profileX, profileY, profileScale, profileRotate, profileFrameX, profileFrameY, profileFrameShapeInput, profileFrameSize, signatureX, signatureY, signatureScale, signatureRotate, authSignatureX, authSignatureY, authSignatureScale, authSignatureRotate].forEach((el) => {
  if (!el) return;
  el.addEventListener("input", renderAdjustments);
});

if (profileFrameShapeInput) {
  profileFrameShapeInput.addEventListener("change", renderAdjustments);
}
if (profileAiToggle) {
  loadProfileAiSetting();
  profileAiToggle.addEventListener("change", () => {
    saveProfileAiSetting(profileAiToggle.checked);
  });
}

function loadProfileAiSetting() {
  const cloudValue = getStoreItem(profileAiStorageKey);
  const localValue = readLocalSetting(profileAiStorageKey);
  const safeTs = localSettingsTs && typeof localSettingsTs === "object" ? localSettingsTs : {};
  const localTs = safeTs[profileAiStorageKey] || 0;
  const hasCloud = cloudValue !== null && cloudValue !== undefined;
  const hasLocal = localValue !== null && localValue !== undefined;
  const useLocal = (hasLocal && Date.now() - localTs < 10 * 60 * 1000) || !hasCloud;
  const enabled = parseStoredBool(useLocal ? localValue : cloudValue, true);
  if (profileAiToggle) profileAiToggle.checked = enabled;
}

function saveProfileAiSetting(value) {
  if (!profileAiToggle) return;
  const next = value ?? profileAiToggle.checked;
  setStoreItem(profileAiStorageKey, next ? "true" : "false");
  writeLocalSetting(profileAiStorageKey, next ? "true" : "false");
  markLocalSettingUpdated(profileAiStorageKey);
}
if (photoRing) {
  photoRing.addEventListener("pointerdown", startProfileDrag);
}
window.addEventListener("pointermove", moveProfileDrag);
window.addEventListener("pointerup", endProfileDrag);
window.addEventListener("pointercancel", endProfileDrag);

renderAdjustments();
syncProfileAdjustPreviewMode();
initSignaturePad();
initAuthSignaturePad();
setCompanyDisplayMode(companyTextModeInput ? companyTextModeInput.value : "text");
if (companyTextModeInput) {
  companyTextModeInput.addEventListener("input", () => setCompanyDisplayMode(companyTextModeInput.value));
  companyTextModeInput.addEventListener("change", () => setCompanyDisplayMode(companyTextModeInput.value));
}
setSignatureMode(signatureModeInput ? signatureModeInput.value : "upload");
setAuthSignatureMode(authSignatureModeInput ? authSignatureModeInput.value : "upload");
if (signatureAdjustToggle) {
  signatureAdjustToggle.addEventListener("click", toggleSignatureAdjustPanel);
}
if (profileAdjustToggle) {
  profileAdjustToggle.addEventListener("click", toggleProfileAdjustPanel);
}
if (signaturePadSource) {
  signaturePadSource.addEventListener("change", () => {
    updateSignaturePadSource(signaturePadSource.value);
  });
}
if (signaturePhoneCopy) {
  signaturePhoneCopy.addEventListener("click", async () => {
    const link = signaturePhoneRequest && signaturePhoneRequest.url ? signaturePhoneRequest.url : "";
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setSignaturePhoneStatus("Link copied.");
    } catch {
      setSignaturePhoneStatus("Copy failed. Select the link manually.", true);
    }
  });
}
if (signaturePhoneCancel) {
  signaturePhoneCancel.addEventListener("click", cancelSignaturePhoneRequest);
}
if (profileFrameAdjustToggle) {
  profileFrameAdjustToggle.addEventListener("click", toggleProfileFrameAdjustPanel);
}
if (companyAdjustToggle) {
  companyAdjustToggle.addEventListener("click", toggleCompanyAdjustPanel);
}
if (logoAdjustToggle) {
  logoAdjustToggle.addEventListener("click", toggleLogoAdjustPanel);
}
if (qrAdjustToggle) {
  qrAdjustToggle.addEventListener("click", toggleQrAdjustPanel);
}
if (authSignatureAdjustToggle) {
  authSignatureAdjustToggle.addEventListener("click", toggleAuthSignatureAdjustPanel);
}
if (signatureModeInput) {
  signatureModeInput.addEventListener("input", () => setSignatureMode(signatureModeInput.value));
  signatureModeInput.addEventListener("change", () => setSignatureMode(signatureModeInput.value));
}
if (authSignatureModeInput) {
  authSignatureModeInput.addEventListener("input", () => setAuthSignatureMode(authSignatureModeInput.value));
  authSignatureModeInput.addEventListener("change", () => setAuthSignatureMode(authSignatureModeInput.value));
}
if (signatureColorInput) {
  signatureColorInput.addEventListener("input", renderEmployeeSignatureFromBase);
  signatureColorInput.addEventListener("change", renderEmployeeSignatureFromBase);
}
if (authSignatureColorInput) {
  authSignatureColorInput.addEventListener("input", renderAuthorizedSignatureFromBase);
  authSignatureColorInput.addEventListener("change", renderAuthorizedSignatureFromBase);
}

const downloadFrontBtn = document.getElementById("downloadFront");
const downloadBackBtn = document.getElementById("downloadBack");
const printBothBtn = document.getElementById("printBoth");
const approveIdBtn = document.getElementById("approveId");
const openApprovedIdsBtn = document.getElementById("openApprovedIds");
const cardZoomModal = document.getElementById("cardZoomModal");
const cardZoomTitle = document.getElementById("cardZoomTitle");
const cardZoomImage = document.getElementById("cardZoomImage");
const cardZoomCloseBtn = document.getElementById("cardZoomClose");
const statusEl = document.getElementById("downloadStatus");
const appRoot = document.querySelector("main.app");
const appCredit = document.querySelector(".app-credit");
const entryLoginModal = document.getElementById("entryLoginModal");
const entryLoginUsernameInput = document.getElementById("entryLoginUsername");
const entryLoginPasswordInput = document.getElementById("entryLoginPassword");
const entryLoginSubmitBtn = document.getElementById("entryLoginSubmit");
const entryLoginErrorEl = document.getElementById("entryLoginError");
const entryLoginLogo = document.getElementById("entryLoginLogo");
const creatorCreditPhoto = document.getElementById("creatorCreditPhoto");
const creatorCreditText = document.getElementById("creatorCreditText");
const openCameraBtn = document.getElementById("openCameraBtn");
const cameraModal = document.getElementById("cameraModal");
const cameraVideo = document.getElementById("cameraVideo");
const cameraCanvas = document.getElementById("cameraCanvas");
const cameraCancel = document.getElementById("cameraCancel");
const cameraCapture = document.getElementById("cameraCapture");
const cameraUse = document.getElementById("cameraUse");
const cameraError = document.getElementById("cameraError");
const cameraHint = document.getElementById("cameraHint");
const cameraDeviceSelect = document.getElementById("cameraDeviceSelect");
let cameraStream = null;
let cameraDataUrl = "";
const creatorTrademarkBtn = document.getElementById("creatorTrademarkBtn");
const creatorTrademarkModal = document.getElementById("creatorTrademarkModal");
const creatorTrademarkUsernameInput = document.getElementById("creatorTrademarkUsername");
const creatorTrademarkPasswordInput = document.getElementById("creatorTrademarkPassword");
const creatorCreditTextInput = document.getElementById("creatorCreditTextInput");
const creatorCreditPhotoFileInput = document.getElementById("creatorCreditPhotoFile");
const creatorTrademarkSaveBtn = document.getElementById("creatorTrademarkSave");
const creatorTrademarkCancelBtn = document.getElementById("creatorTrademarkCancel");
const creatorTrademarkErrorEl = document.getElementById("creatorTrademarkError");
const adminAccessStateEl = document.getElementById("adminAccessState");
const adminLoginBtn = document.getElementById("adminLoginBtn");
const adminLockBtn = document.getElementById("adminLockBtn");
const entryLogoutBtn = document.getElementById("entryLogoutBtn");
const adminLoginModal = document.getElementById("adminLoginModal");
const adminUsernameInput = document.getElementById("adminUsername");
const adminPasswordInput = document.getElementById("adminPassword");
const adminLoginSubmitBtn = document.getElementById("adminLoginSubmit");
const adminLoginCancelBtn = document.getElementById("adminLoginCancel");
const adminLoginErrorEl = document.getElementById("adminLoginError");
const adminSettingsPanel = document.getElementById("adminSettingsPanel");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const superAdminCurrentPasswordInput = document.getElementById("superAdminCurrentPassword");
const superAdminNewUsernameInput = document.getElementById("superAdminNewUsername");
const superAdminNewPasswordInput = document.getElementById("superAdminNewPassword");
const superAdminConfirmPasswordInput = document.getElementById("superAdminConfirmPassword");
const saveSuperAdminCredentialsBtn = document.getElementById("saveSuperAdminCredentials");
const adminAccountCurrentSuperPasswordInput = document.getElementById("adminAccountCurrentSuperPassword");
const adminAccountNewUsernameInput = document.getElementById("adminAccountNewUsername");
const adminAccountNewPasswordInput = document.getElementById("adminAccountNewPassword");
const adminAccountConfirmPasswordInput = document.getElementById("adminAccountConfirmPassword");
const saveAdminAccountCredentialsBtn = document.getElementById("saveAdminAccountCredentials");

const superAdminCredentialsStorageKey = "idCardCreatorSuperAdminCredentialsV1";
const adminCredentialsStorageKey = "idCardCreatorAdminCredentialsV1";
const interfaceThemeStorageKey = "idCardCreatorInterfaceThemeV1";
const entryLoginSessionStorageKey = "idCardCreatorEntryLoginSessionV1";
const adminSessionStorageKey = "idCardCreatorAdminSessionV1";
const logoutTsStorageKey = "idCardCreatorLogoutTsV1";
const approvedIdsNavContextKey = "idCardCreatorApprovedIdsNavContextV1";
const approvedIdsPendingOverlayKey = "idCardCreatorApprovedIdsPendingOverlayV1";
const creatorCreditPhotoStorageKey = "idCardCreatorCreatorCreditPhotoV1";
const creatorCreditTextStorageKey = "idCardCreatorCreatorCreditTextV1";
const currentLogoStorageKey = "idCardCreatorCurrentLogoV1";
const approvedIdsStorageKey = "idCardCreatorApprovedIdsV1";
const supabaseProjectUrl = "https://faqzsjpdxeeuflusudjy.supabase.co";
const supabaseAnonKey =
  "sb_publishable_EQjWw8Un9js04SLKhMBdUA_Utq-kiR6";
const supabaseClient = window.__idCardSupabaseClient || null;
const authChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("idcard-auth") : null;
async function getAuthSession() {
  if (!supabaseClient) return null;
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) return null;
    return data && data.session ? data.session : null;
  } catch {
    return null;
  }
}

async function signInWithPassword(email, password) {
  if (!supabaseClient) throw new Error("Supabase client unavailable.");
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data && data.session ? data.session : null;
}

async function signOutAuth() {
  if (!supabaseClient) return;
  try {
    await supabaseClient.auth.signOut();
  } catch {
    // ignore sign-out errors
  }
}
const adminInactivityMs = 5 * 60 * 1000;
let superAdminUsername = "superadmin";
let superAdminPassword = "admin123";
let adminUsername = "admin";
let adminPassword = "admin123";
const adminAllowedWhileLocked = new Set([
  "downloadFront",
  "downloadBack",
  "printBoth",
  "approveId",
  "openApprovedIds",
  "adminLoginBtn",
  "adminLockBtn",
  "entryLogoutBtn",
  "photoFile",
  "openCameraBtn",
  "profileAdjustToggle",
  "profileFrameAdjustToggle",
  "profileX",
  "profileY",
  "profileScale",
  "profileRotate",
  "profileAiToggle",
  "profileFrameX",
  "profileFrameY",
  "profileFrameShape",
  "profileFrameSize",
  "signatureMode",
  "signaturePadSource",
  "signatureColor",
  "signatureFile",
  "signatureAdjustToggle",
  "signatureX",
  "signatureY",
  "signatureScale",
  "signatureRotate",
  "signaturePhoneCopy",
  "signaturePhoneCancel",
  "authSignatureMode",
  "authSignatureColor",
  "authSignatureFile",
  "authSignatureFileDefault",
  "authSignatureAdjustToggle",
  "authSignatureX",
  "authSignatureY",
  "authSignatureScale",
  "authSignatureRotate",
  "clearAuthSignaturePad",
  "useAuthPadSignature",
  "clearSignaturePad",
  "usePadSignature",
  "employeeName",
  "position",
  "employeeNo",
  "dateHired",
  "validUntil",
  "phoneNo",
  "barcodeValue",
  "homeAddress",
  "emergencyPerson",
  "emergencyNo",
  "returnContact",
  "returnContactNo",
  "signatory",
  "signatoryTitle",
  "address",
  "telephone",
  "previewAccessToggle",
  "previewInfoToggle"
]);
let adminUnlocked = false;
let isDarkMode = false;
let adminInactivityTimer = null;
let adminLastActivityTs = 0;
let appSignedIn = false;
let appSignedInRole = "admin";
let cardZoomToken = 0;
let cardZoomHideTimer = null;
let entryGateCheckInProgress = false;
let settingsFlushTimer = null;
var localSettingsTs = {};
let settingsHydrating = false;

const settingsPersistExcludeIds = new Set([
  "adminUsername",
  "adminPassword",
  "entryLoginUsername",
  "entryLoginPassword",
  "superAdminCurrentPassword",
  "superAdminNewUsername",
  "superAdminNewPassword",
  "superAdminConfirmPassword",
  "adminAccountCurrentSuperPassword",
  "adminAccountNewUsername",
  "adminAccountNewPassword",
  "adminAccountConfirmPassword",
  "creatorTrademarkUsername",
  "creatorTrademarkPassword",
  "creatorCreditTextInput",
  "creatorCreditPhotoFile",
  "photoFile",
  "logoFile",
  "signatureFile",
  "authSignatureFile",
  "frontThemeFile",
  "backThemeFile",
  "companyNameImageFile",
  "previewAccessToggle",
  "previewInfoToggle",
  "showWatermark",
  "watermarkText",
  "watermarkLayer",
  "watermarkRows",
  "watermarkCols",
  "watermarkOpacity",
  "watermarkColor",
  "watermarkSize",
  "watermarkRotate"
]);

function getSettingsStorageKeyForElement(el) {
  if (!el || !el.id) return "";
  return `${settingsValuePrefix}${el.id}`;
}

function isPersistableSettingElement(el) {
  if (!el || !el.id) return false;
  if (settingsPersistExcludeIds.has(el.id)) return false;
  if (el.type === "file") return false;
  if (el.id.endsWith("Default")) return false;
  return true;
}

function readElementValue(el) {
  if (!el) return "";
  if (el.type === "checkbox") return el.checked ? "true" : "false";
  if (el.type === "radio") return el.checked ? el.value : "";
  return el.value ?? "";
}

function writeElementValue(el, value) {
  if (!el) return false;
  if (el.type === "checkbox") {
    const next = parseStoredBool(value, el.checked);
    if (el.checked !== next) el.checked = next;
    return true;
  }
  if (el.type === "radio") {
    if (!value) return false;
    const group = el.name
      ? document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`)
      : [el];
    let changed = false;
    group.forEach((radio) => {
      if (radio.value === value) {
        radio.checked = true;
        changed = true;
      }
    });
    return changed;
  }
  if (typeof value === "string" && el.value !== value) {
    el.value = value;
    return true;
  }
  return false;
}

function persistSettingElement(el) {
  const key = getSettingsStorageKeyForElement(el);
  if (!key) return;
  const value = readElementValue(el);
  if (value === "") {
    setStoreItem(key, "");
    writeLocalSetting(key, "");
  } else {
    setStoreItem(key, value);
    writeLocalSetting(key, value);
  }
  markLocalSettingUpdated(key);
}

function applyPersistedSettings(scope) {
  const root = scope || document;
  const inputs = Array.from(root.querySelectorAll("input, select, textarea"));
  settingsHydrating = true;
  inputs.forEach((el) => {
    if (!isPersistableSettingElement(el)) return;
    const key = getSettingsStorageKeyForElement(el);
    const stored = readStoredOrLocalSetting(key);
    if (stored === null || stored === undefined) return;
    const changed = writeElementValue(el, stored);
    if (changed) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  settingsHydrating = false;
}

function bindSettingPersistence(scope) {
  const root = scope || document;
  const inputs = Array.from(root.querySelectorAll("input, select, textarea"));
  inputs.forEach((el) => {
    if (!isPersistableSettingElement(el)) return;
    const handler = () => {
      if (settingsHydrating) return;
      persistSettingElement(el);
    };
    el.addEventListener("input", handler);
    el.addEventListener("change", handler);
  });
}

function scheduleSettingsFlush() {
  if (!cloudStore || typeof cloudStore.flush !== "function") return;
  if (settingsFlushTimer) clearTimeout(settingsFlushTimer);
  settingsFlushTimer = setTimeout(() => {
    settingsFlushTimer = null;
    cloudStore.flush().catch(() => {});
  }, 300);
}

function loadLocalSettingsTs() {
  try {
    const raw = window.localStorage.getItem(localSettingsTsKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      Object.assign(localSettingsTs, parsed);
    }
  } catch {
    // ignore local storage failures
  }
}

function saveLocalSettingsTs() {
  try {
    window.localStorage.setItem(localSettingsTsKey, JSON.stringify(localSettingsTs));
  } catch {
    // ignore local storage failures
  }
}

function markLocalSettingUpdated(key) {
  localSettingsTs[key] = Date.now();
  saveLocalSettingsTs();
}

function readLocalSetting(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalSetting(key, value) {
  try {
    if (value === null || value === undefined) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, String(value));
    }
  } catch {
    // ignore local storage failures
  }
}

function readStoredOrLocalSetting(key) {
  const localValue = readLocalSetting(key);
  const localTs = localSettingsTs[key] || 0;
  const useLocal = localValue !== null && localValue !== undefined && Date.now() - localTs < 10 * 60 * 1000;
  if (useLocal) return localValue;
  const cloudValue = getStoreItem(key);
  if (cloudValue !== null && cloudValue !== undefined) return cloudValue;
  return localValue;
}

function persistEntryLoginSession(source = "entry") {
  removeStoreItem(logoutTsStorageKey);
  setStoreItem(
    entryLoginSessionStorageKey,
    JSON.stringify({
      signedIn: appSignedIn,
      role: appSignedInRole,
      source,
      unlocked: adminUnlocked
    })
  );
}

function clearEntryLoginSession() {
  removeStoreItem(entryLoginSessionStorageKey);
  removeStoreItem(approvedIdsNavContextKey);
}

function clearApprovedIdsNavContext() {
  removeStoreItem(approvedIdsNavContextKey);
}

function loadEntryLoginSession() {
  try {
    // no logout cooldown guard; session persists
    const raw = getStoreItem(entryLoginSessionStorageKey);
    let parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || !parsed.signedIn) {
      // Fallback: recover from approved page navigation context if available.
      const navRaw = getStoreItem(approvedIdsNavContextKey);
      const navParsed = navRaw ? JSON.parse(navRaw) : null;
      if (!navParsed || typeof navParsed !== "object" || !navParsed.signedIn) return;
      parsed = {
        signedIn: true,
        role: navParsed.role === "superadmin" ? "superadmin" : "admin",
        source: "entry"
      };
      setStoreItem(entryLoginSessionStorageKey, JSON.stringify(parsed));
    }

    const role = parsed.role === "superadmin" ? "superadmin" : "admin";
    appSignedIn = true;
    appSignedInRole = role;
    adminUnlocked = !!parsed.unlocked;
    if (adminUnlocked) adminLastActivityTs = Date.now();
  } catch {
    clearEntryLoginSession();
  }
}

async function refreshAuthState() {
  const session = await getAuthSession();
  if (!session) {
    appSignedIn = false;
    appSignedInRole = "admin";
    adminUnlocked = false;
    clearEntryLoginSession();
    return false;
  }
  loadEntryLoginSession();
  if (!appSignedIn) {
    appSignedIn = true;
    appSignedInRole = "admin";
    adminUnlocked = false;
    persistEntryLoginSession();
  }
  loadAdminSession();
  return true;
}

function notifyAuthChange(state) {
  if (!authChannel) return;
  try {
    authChannel.postMessage({ type: "auth", state, ts: Date.now() });
  } catch {
    // ignore broadcast failures
  }
}

function persistAdminSession() {
  setStoreItem(
    adminSessionStorageKey,
    JSON.stringify({
      unlocked: adminUnlocked,
      lastActivity: adminLastActivityTs
    })
  );
}

function clearAdminSession() {
  removeStoreItem(adminSessionStorageKey);
}

function stopAdminInactivityTimer() {
  if (!adminInactivityTimer) return;
  clearTimeout(adminInactivityTimer);
  adminInactivityTimer = null;
}

function autoLogoutAdminByInactivity() {
  if (!adminUnlocked) return;
  adminUnlocked = false;
  appSignedInRole = "admin";
  persistEntryLoginSession();
  adminLastActivityTs = 0;
  stopAdminInactivityTimer();
  clearAdminSession();
  applyAdminAccessState();
  setStatus("Auto-logged out after 5 minutes of inactivity.");
}

function scheduleAdminInactivityTimer() {
  if (!adminUnlocked) {
    stopAdminInactivityTimer();
    return;
  }
  const now = Date.now();
  const baseTs = adminLastActivityTs || now;
  const elapsed = now - baseTs;
  const remaining = adminInactivityMs - elapsed;
  stopAdminInactivityTimer();
  if (remaining <= 0) {
    autoLogoutAdminByInactivity();
    return;
  }
  adminInactivityTimer = setTimeout(autoLogoutAdminByInactivity, remaining);
}

function touchAdminActivity() {
  if (!adminUnlocked) return;
  const now = Date.now();
  const shouldPersist = now - adminLastActivityTs > 5000;
  adminLastActivityTs = now;
  scheduleAdminInactivityTimer();
  if (shouldPersist) persistAdminSession();
}

function loadAdminSession() {
  try {
    const raw = getStoreItem(adminSessionStorageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.unlocked) return;
    const lastActivity = Number(parsed.lastActivity || 0);
    if (!lastActivity) return;
    if (Date.now() - lastActivity > adminInactivityMs) {
      clearAdminSession();
      return;
    }
    adminUnlocked = true;
    adminLastActivityTs = lastActivity;
  } catch {
    clearAdminSession();
  }
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  if (isDarkMode) {
    statusEl.style.color = isError ? "#ff8fa0" : "#9fc1ff";
    return;
  }
  statusEl.style.color = isError ? "#b5122a" : "#2147b8";
}



function applyInterfaceTheme() {
  const body = document.body;
  if (!body) return;
  body.classList.toggle("theme-dark", isDarkMode);
  if (themeToggleBtn) {
    themeToggleBtn.textContent = isDarkMode ? "Light Mode" : "Dark Mode";
    themeToggleBtn.setAttribute("aria-pressed", isDarkMode ? "true" : "false");
  }
}

function canManageInterfaceTheme() {
  return appSignedIn && appSignedInRole === "superadmin";
}

function loadInterfaceTheme() {
  try {
    const saved = readStoredOrLocalSetting(interfaceThemeStorageKey);
    if (saved === "dark" || saved === "light") {
      isDarkMode = saved === "dark";
    } else {
      isDarkMode = true;
    }
  } catch {
    isDarkMode = true;
  }
  applyInterfaceTheme();
}

function toggleInterfaceTheme() {
  if (!canManageInterfaceTheme()) {
    setStatus("Only super admin can change interface theme.", true);
    return;
  }
  isDarkMode = !isDarkMode;
  applyInterfaceTheme();
  const nextValue = isDarkMode ? "dark" : "light";
  setStoreItem(interfaceThemeStorageKey, nextValue);
  writeLocalSetting(interfaceThemeStorageKey, nextValue);
  markLocalSettingUpdated(interfaceThemeStorageKey);
}

function loadSuperAdminCredentials() {
  try {
    const raw = getStoreItem(superAdminCredentialsStorageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    const username = typeof parsed.username === "string" ? parsed.username.trim() : "";
    const password = typeof parsed.password === "string" ? parsed.password : "";
    if (username) superAdminUsername = username;
    if (password) superAdminPassword = password;
  } catch {
    superAdminUsername = "superadmin";
    superAdminPassword = "admin123";
  }
}

function saveSuperAdminCredentials() {
  setStoreItem(
    superAdminCredentialsStorageKey,
    JSON.stringify({ username: superAdminUsername, password: superAdminPassword })
  );
}

function loadAdminCredentials() {
  try {
    const raw = getStoreItem(adminCredentialsStorageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    const username = typeof parsed.username === "string" ? parsed.username.trim() : "";
    const password = typeof parsed.password === "string" ? parsed.password : "";
    if (username) adminUsername = username;
    if (password) adminPassword = password;
  } catch {
    adminUsername = "admin";
    adminPassword = "admin123";
  }
}

function saveAdminCredentials() {
  setStoreItem(
    adminCredentialsStorageKey,
    JSON.stringify({ username: adminUsername, password: adminPassword })
  );
}

function getSetupManagedControls() {
  const scope = document.querySelector(".form-panel");
  if (!scope) return [];
  return Array.from(scope.querySelectorAll("input, select, button"));
}

let adminPanelHideTimer = null;
let userPanelHideTimer = null;
const panelSwitchAnimationMs = 220;

function showPanelAnimated(panel, className, hideTimerRefName) {
  if (!panel) return;
  if (hideTimerRefName === "admin" && adminPanelHideTimer) {
    clearTimeout(adminPanelHideTimer);
    adminPanelHideTimer = null;
  }
  if (hideTimerRefName === "user" && userPanelHideTimer) {
    clearTimeout(userPanelHideTimer);
    userPanelHideTimer = null;
  }
  panel.hidden = false;
  requestAnimationFrame(() => {
    panel.classList.add(className);
    panel.classList.remove("panel-leaving");
  });
}

function hidePanelAnimated(panel, className, hideTimerRefName) {
  if (!panel) return;
  panel.classList.remove(className);
  panel.classList.add("panel-leaving");
  const hideFn = () => {
    panel.hidden = true;
    panel.classList.remove("panel-leaving");
  };
  if (hideTimerRefName === "admin") {
    if (adminPanelHideTimer) clearTimeout(adminPanelHideTimer);
    adminPanelHideTimer = setTimeout(hideFn, panelSwitchAnimationMs);
    return;
  }
  if (hideTimerRefName === "user") {
    if (userPanelHideTimer) clearTimeout(userPanelHideTimer);
    userPanelHideTimer = setTimeout(hideFn, panelSwitchAnimationMs);
  }
}

function applyAdminSectionVisibility() {
  const scope = document.querySelector(".form-panel");
  if (!scope) return;
  const adminPanel = scope.querySelector("#adminSettingsPanel");
  const userPanel = scope.querySelector("#userSettingsPanel");
  if (adminUnlocked) {
    showPanelAnimated(adminPanel, "panel-open", "admin");
    hidePanelAnimated(userPanel, "panel-open", "user");
    return;
  }
  hidePanelAnimated(adminPanel, "panel-open", "admin");
  showPanelAnimated(userPanel, "panel-open", "user");
}

function applyAdminAccessState() {
  const scope = document.querySelector(".form-panel");
  const allowedDefaultBases = new Set([
    "employeeName",
    "position",
    "employeeNo",
    "dateHired",
    "validUntil",
    "phoneNo",
    "barcodeValue",
    "homeAddress",
    "emergencyPerson",
    "emergencyNo",
    "returnContact",
    "returnContactNo",
    "profileX",
    "profileY",
    "profileScale",
    "profileRotate",
    "profileFrameX",
    "profileFrameY",
    "profileFrameShape",
    "profileFrameSize",
    "signatureColor",
    "signatureX",
    "signatureY",
    "signatureScale",
    "signatureRotate",
    "signatory",
    "signatoryTitle",
    "address",
    "telephone",
    "authSignatureX",
    "authSignatureY",
    "authSignatureScale",
    "authSignatureRotate"
  ]);
  appSignedInRole = adminUnlocked ? "superadmin" : "admin";
  getSetupManagedControls().forEach((el) => {
    if (!el || !el.id) return;
    if (el.id.endsWith("Default")) {
      const baseId = el.id.slice(0, -7);
      if (allowedDefaultBases.has(baseId)) {
        el.disabled = false;
        return;
      }
    }
    if (adminAllowedWhileLocked.has(el.id)) {
      el.disabled = false;
      return;
    }
    el.disabled = !adminUnlocked;
  });
    if (signatureRotate) signatureRotate.disabled = false;
    if (authSignatureRotate) authSignatureRotate.disabled = false;

  if (adminAccessStateEl) {
    adminAccessStateEl.textContent = adminUnlocked ? "Settings are unlocked" : "Settings are locked";
    adminAccessStateEl.style.color = adminUnlocked ? "#1f8f45" : "#c62828";
  }
  if (themeToggleBtn) {
    themeToggleBtn.hidden = !canManageInterfaceTheme();
    themeToggleBtn.disabled = !canManageInterfaceTheme();
  }
  if (adminLoginBtn) adminLoginBtn.hidden = adminUnlocked;
  if (adminLockBtn) adminLockBtn.hidden = !adminUnlocked;
  if (scope) scope.classList.toggle("settings-locked", !adminUnlocked);
  applyAdminSectionVisibility();
  if (adminUnlocked) {
    if (!adminLastActivityTs) adminLastActivityTs = Date.now();
    scheduleAdminInactivityTimer();
    persistAdminSession();
  } else {
    adminLastActivityTs = 0;
    stopAdminInactivityTimer();
    clearAdminSession();
  }
}

function openAdminLoginModal() {
  if (!adminLoginModal) return;
  adminLoginModal.hidden = false;
  if (adminLoginErrorEl) adminLoginErrorEl.hidden = true;
  if (adminUsernameInput) adminUsernameInput.value = "";
  if (adminPasswordInput) adminPasswordInput.value = "";
  if (adminUsernameInput) adminUsernameInput.focus();
}

function closeAdminLoginModal() {
  if (!adminLoginModal) return;
  adminLoginModal.hidden = true;
}

function submitAdminLogin() {
  const email = (adminUsernameInput && adminUsernameInput.value ? adminUsernameInput.value : "").trim();
  const password = adminPasswordInput && adminPasswordInput.value ? adminPasswordInput.value : "";
  getAuthSession()
    .then((session) => {
      if (session) return session;
      if (!email || !password) throw new Error("Enter email and password.");
      return signInWithPassword(email, password);
    })
    .then((session) => {
      if (!session) throw new Error("Sign-in failed.");
      appSignedIn = true;
      appSignedInRole = "admin";
      adminUnlocked = true;
      adminLastActivityTs = Date.now();
      persistEntryLoginSession("unlock");
      applyAdminAccessState();
      applyEntryGateState();
      closeAdminLoginModal();
      setStatus("Signed in. Super admin can unlock settings.");
      notifyAuthChange("signed_in");
    })
    .catch((err) => {
      if (adminLoginErrorEl) adminLoginErrorEl.hidden = false;
      setStatus(err && err.message ? err.message : "Invalid admin credentials.", true);
    });
}

function handleSuperAdminCredentialsSave() {
  setStatus("Super admin credentials are managed in Supabase Auth.", true);
}

function handleAdminAccountCredentialsSave() {
  setStatus("Admin credentials are managed in Supabase Auth.", true);
}

function handleAdminLock() {
  adminUnlocked = false;
  appSignedInRole = "admin";
  persistEntryLoginSession();
  applyAdminAccessState();
  setStatus("Settings locked.");
}

function applyEntryGateState() {
  if (!cloudReady && !appSignedIn) {
    return;
  }
  if (!appSignedIn) {
    if (!entryGateCheckInProgress && cloudStore && typeof cloudStore.pull === "function") {
      entryGateCheckInProgress = true;
      cloudStore
        .pull()
        .catch(() => {})
        .finally(() => {
          entryGateCheckInProgress = false;
          loadEntryLoginSession();
          if (appSignedIn) {
            applyEntryGateState();
            return;
          }
          navigateWithTransition("index.html", { replace: true, delay: 120 });
        });
      return;
    }
    navigateWithTransition("index.html", { replace: true, delay: 120 });
    return;
  }
  if (appRoot) appRoot.hidden = false;
  if (appCredit) appCredit.hidden = false;
  if (entryLoginModal) entryLoginModal.hidden = true;
  if (entryLogoutBtn) entryLogoutBtn.hidden = false;
  if (creatorTrademarkBtn) creatorTrademarkBtn.hidden = appSignedInRole !== "superadmin";
  if (creatorTrademarkModal && appSignedInRole !== "superadmin") creatorTrademarkModal.hidden = true;
}

function submitEntryLogin() {
  const email = (entryLoginUsernameInput && entryLoginUsernameInput.value
    ? entryLoginUsernameInput.value
    : "").trim();
  const password = entryLoginPasswordInput && entryLoginPasswordInput.value
    ? entryLoginPasswordInput.value
    : "";
  if (!email || !password) {
    if (entryLoginErrorEl) entryLoginErrorEl.hidden = false;
    setStatus("Email and password are required.", true);
    return;
  }
  signInWithPassword(email, password)
    .then((session) => {
      if (!session) throw new Error("Sign-in failed.");
      appSignedIn = true;
      appSignedInRole = "admin";
      adminUnlocked = false;
      persistEntryLoginSession();
      applyAdminAccessState();
      applyEntryGateState();
      setStatus("Signed in. Super admin can unlock settings.");
      notifyAuthChange("signed_in");
    })
    .catch((err) => {
      if (entryLoginErrorEl) entryLoginErrorEl.hidden = false;
      setStatus(err && err.message ? err.message : "Invalid sign-in credentials.", true);
    });
}

async function logoutEntrySession() {
  appSignedIn = false;
  appSignedInRole = "admin";
  adminUnlocked = false;
  // no logout cooldown guard
  clearEntryLoginSession();
  clearApprovedIdsNavContext();
  applyAdminAccessState();
  applyEntryGateState();
  if (adminLoginModal) adminLoginModal.hidden = true;
  if (creatorTrademarkModal) creatorTrademarkModal.hidden = true;
  if (entryLoginErrorEl) entryLoginErrorEl.hidden = true;
  if (entryLoginPasswordInput) entryLoginPasswordInput.value = "";
  setStatus("Logged out.");
  const doNavigate = () => navigateWithTransition("index.html");
  try {
    await signOutAuth();
  } finally {
    notifyAuthChange("signed_out");
  }
  if (cloudStore && typeof cloudStore.flush === "function") {
    cloudStore.flush().catch(() => {}).finally(doNavigate);
    return;
  }
  doNavigate();
}

function initPerFieldDefaults() {
  loadDefaultFieldState();
  applySavedDefaultValues();
  attachPerFieldDefaultCheckboxes();
  if (logoDefaultToggle) {
    logoDefaultToggle.checked = defaultFieldState.selected.has(logoDefaultId);
    logoDefaultToggle.addEventListener("change", () => {
      if (logoDefaultToggle.checked) {
        defaultFieldState.selected.add(logoDefaultId);
        const file = logoFileInput.files && logoFileInput.files[0];
        if (!file) {
          saveDefaultFieldState();
          setStatus("Logo default enabled. Choose a logo to save it.");
          return;
        }
        saveLogoDefaultFromFile(file)
          .then(() => setStatus("Logo saved as default."))
          .catch((err) => setStatus(err.message, true));
        return;
      }

      defaultFieldState.selected.delete(logoDefaultId);
      delete defaultFieldState.values[logoDefaultId];
      saveDefaultFieldState();
      logoFileInput.value = "";
      frontLogo.src = fallbackLogo;
      syncEntryLoginLogo();
      persistCurrentLogoDataUrl(fallbackLogo);
      setStatus("Logo default cleared.");
    });

    if (
      logoDefaultToggle.checked &&
      typeof defaultFieldState.values[logoDefaultId] === "string" &&
      defaultFieldState.values[logoDefaultId]
    ) {
      frontLogo.src = defaultFieldState.values[logoDefaultId];
      syncEntryLoginLogo();
      persistCurrentLogoDataUrl(defaultFieldState.values[logoDefaultId]);
    }
  }

  if (frontThemeFileDefaultToggle) {
    frontThemeFileDefaultToggle.checked = defaultFieldState.selected.has(frontThemeFileDefaultId);
    frontThemeFileDefaultToggle.addEventListener("change", () => {
      if (frontThemeFileDefaultToggle.checked) {
        defaultFieldState.selected.add(frontThemeFileDefaultId);
        const file = frontThemeFileInput.files && frontThemeFileInput.files[0];
        if (!file) {
          saveDefaultFieldState();
          setStatus("Front theme photo default enabled. Choose a photo to save it.");
          return;
        }
        saveImageDefaultFromFile(file, frontThemeFileDefaultId)
          .then(() => setStatus("Front theme photo saved as default."))
          .catch((err) => setStatus(err.message, true));
        return;
      }

      defaultFieldState.selected.delete(frontThemeFileDefaultId);
      delete defaultFieldState.values[frontThemeFileDefaultId];
      saveDefaultFieldState();
      if (frontThemeImageUrl) URL.revokeObjectURL(frontThemeImageUrl);
      frontThemeImageUrl = undefined;
      if (frontThemeFileInput) frontThemeFileInput.value = "";
      if (frontCard) {
        frontCard.classList.remove("custom-theme-image");
        frontCard.style.removeProperty("background-image");
      }
      updateFrontCardContrastMode();
      applyThemeSourceMode("front", getThemeSourceMode("front"), false);
      setStatus("Front theme photo default cleared.");
    });

    if (
      frontThemeFileDefaultToggle.checked &&
      typeof defaultFieldState.values[frontThemeFileDefaultId] === "string" &&
      defaultFieldState.values[frontThemeFileDefaultId]
    ) {
      if (frontCard) {
        frontCard.style.backgroundImage = `url("${defaultFieldState.values[frontThemeFileDefaultId]}")`;
        frontCard.classList.add("custom-theme-image");
        updateFrontCardContrastMode();
        applyThemeSourceMode("front", "file", false);
      }
    }
  }

  if (backThemeFileDefaultToggle) {
    backThemeFileDefaultToggle.checked = defaultFieldState.selected.has(backThemeFileDefaultId);
    backThemeFileDefaultToggle.addEventListener("change", () => {
      if (backThemeFileDefaultToggle.checked) {
        defaultFieldState.selected.add(backThemeFileDefaultId);
        const file = backThemeFileInput.files && backThemeFileInput.files[0];
        if (!file) {
          saveDefaultFieldState();
          setStatus("Back theme photo default enabled. Choose a photo to save it.");
          return;
        }
        saveImageDefaultFromFile(file, backThemeFileDefaultId)
          .then(() => setStatus("Back theme photo saved as default."))
          .catch((err) => setStatus(err.message, true));
        return;
      }

      defaultFieldState.selected.delete(backThemeFileDefaultId);
      delete defaultFieldState.values[backThemeFileDefaultId];
      saveDefaultFieldState();
      if (backThemeImageUrl) URL.revokeObjectURL(backThemeImageUrl);
      backThemeImageUrl = undefined;
      if (backThemeFileInput) backThemeFileInput.value = "";
      if (backCard) {
        backCard.classList.remove("custom-theme-image");
        backCard.style.removeProperty("background-image");
      }
      updateBackCardContrastMode();
      applyThemeSourceMode("back", getThemeSourceMode("back"), false);
      setStatus("Back theme photo default cleared.");
    });

    if (
      backThemeFileDefaultToggle.checked &&
      typeof defaultFieldState.values[backThemeFileDefaultId] === "string" &&
      defaultFieldState.values[backThemeFileDefaultId]
    ) {
      if (backCard) {
        backCard.style.backgroundImage = `url("${defaultFieldState.values[backThemeFileDefaultId]}")`;
        backCard.classList.add("custom-theme-image");
        updateBackCardContrastMode();
        applyThemeSourceMode("back", "file", false);
      }
    }
  }

  if (authSignatureDefaultToggle) {
    authSignatureDefaultToggle.checked = defaultFieldState.selected.has(authSignatureDefaultId);
    authSignatureDefaultToggle.addEventListener("change", () => {
      if (authSignatureDefaultToggle.checked) {
        defaultFieldState.selected.add(authSignatureDefaultId);
        const file = authSignatureFileInput && authSignatureFileInput.files && authSignatureFileInput.files[0];
        if (!file) {
          if (authorizedSignature && authorizedSignature.src && authorizedSignature.src !== fallbackSignature) {
            defaultFieldState.values[authSignatureDefaultId] = authorizedSignatureBaseDataUrl;
          }
          saveDefaultFieldState();
          setStatus("Authorized signature default enabled. Choose a signature to save it.");
          return;
        }
        removeSignatureBackgroundDataUrl(file)
          .then((dataUrl) => {
            authorizedSignatureBaseDataUrl = dataUrl;
            renderAuthorizedSignatureFromBase();
            defaultFieldState.values[authSignatureDefaultId] = authorizedSignatureBaseDataUrl;
            saveDefaultFieldState();
            setStatus("Authorized signature saved as default.");
          })
          .catch((err) =>
            setStatus(`Failed to save authorized signature default: ${err.message}`, true)
          );
        return;
      }

      defaultFieldState.selected.delete(authSignatureDefaultId);
      delete defaultFieldState.values[authSignatureDefaultId];
      saveDefaultFieldState();
      if (authSignatureFileInput) authSignatureFileInput.value = "";
      authorizedSignatureBaseDataUrl = fallbackSignature;
      renderAuthorizedSignatureFromBase();
      setStatus("Authorized signature default cleared.");
    });

    if (
      authSignatureDefaultToggle.checked &&
      typeof defaultFieldState.values[authSignatureDefaultId] === "string" &&
      defaultFieldState.values[authSignatureDefaultId]
    ) {
      authorizedSignatureBaseDataUrl = defaultFieldState.values[authSignatureDefaultId];
      renderAuthorizedSignatureFromBase();
    }
  }
  defaultFieldIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function captureCard(cardId) {
  const card = document.getElementById(cardId);
  if (!window.html2canvas) {
    throw new Error("html2canvas library is not loaded.");
  }

  renderAdjustments();

  let prevRingTransform = "";
  let prevRingWidth = "";
  let prevRingHeight = "";
  let prevPhotoTransform = "";
  let prevPhotoObjectFit = "";
  let prevPhotoObjectPosition = "";
  let prevMaskOverflow = "";
  let prevMaskBorderRadius = "";
  let prevEmployeeSignatureVisibility = "";
  let prevAuthorizedSignatureVisibility = "";

  const isFrontCapture = cardId === "frontCard";
  const isBackCapture = cardId === "backCard";

  if (photoRing) {
    photoRing.classList.remove("adjust-mode");
    prevRingTransform = photoRing.style.transform;
    prevRingWidth = photoRing.style.width;
    prevRingHeight = photoRing.style.height;
    const frameX = profileFrameX ? Number(profileFrameX.value || 0) : 0;
    const frameY = profileFrameY ? Number(profileFrameY.value || 0) : 0;
    const frameSize = profileFrameSize ? Number(profileFrameSize.value || 178) : 178;
    photoRing.style.transform = `translateX(-50%) translate(${frameX}px, ${frameY}px)`;
    photoRing.style.width = `${frameSize}px`;
    photoRing.style.height = `${frameSize}px`;
  }
  if (profileMask) {
    prevMaskOverflow = profileMask.style.overflow;
    prevMaskBorderRadius = profileMask.style.borderRadius;
    profileMask.style.overflow = "hidden";
    profileMask.style.borderRadius = "inherit";
  }
  if (profilePhoto) {
    prevPhotoTransform = profilePhoto.style.transform;
    prevPhotoObjectFit = profilePhoto.style.objectFit;
    prevPhotoObjectPosition = profilePhoto.style.objectPosition;
    const px = profileX ? Number(profileX.value || 0) : 0;
    const py = profileY ? Number(profileY.value || 0) : 0;
    const ps = profileScale ? Number(profileScale.value || 100) / 100 : 1;
    const pr = profileRotate ? Number(profileRotate.value || 0) : 0;
    profilePhoto.style.transform = `translate(${px}px, ${py}px) scale(${ps}) rotate(${pr}deg)`;
    profilePhoto.style.objectFit = "contain";
    profilePhoto.style.objectPosition = "center center";
  }
  if (isFrontCapture && employeeSignature) {
    prevEmployeeSignatureVisibility = employeeSignature.style.visibility;
    employeeSignature.style.visibility = "hidden";
  }
  if (isBackCapture && authorizedSignature) {
    prevAuthorizedSignatureVisibility = authorizedSignature.style.visibility;
    authorizedSignature.style.visibility = "hidden";
  }

  try {
    // Higher render scale for sharper saved/downloaded approved previews.
    const renderScale = 3;
    const canvas = await window.html2canvas(card, {
      scale: renderScale,
      backgroundColor: null,
      useCORS: true
    });
    if (cardId === "frontCard") {
      burnInProfileToFrontCapture(canvas);
      burnInEmployeeSignatureToFrontCapture(canvas);
    }
    if (cardId === "backCard") {
      burnInAuthorizedSignatureToBackCapture(canvas);
      burnInQrToBackCapture(canvas);
    }
    return canvas;
  } finally {
    if (photoRing) {
      photoRing.style.transform = prevRingTransform;
      photoRing.style.width = prevRingWidth;
      photoRing.style.height = prevRingHeight;
    }
    if (profileMask) {
      profileMask.style.overflow = prevMaskOverflow;
      profileMask.style.borderRadius = prevMaskBorderRadius;
    }
    if (profilePhoto) {
      profilePhoto.style.transform = prevPhotoTransform;
      profilePhoto.style.objectFit = prevPhotoObjectFit;
      profilePhoto.style.objectPosition = prevPhotoObjectPosition;
    }
    if (isFrontCapture && employeeSignature) {
      employeeSignature.style.visibility = prevEmployeeSignatureVisibility;
    }
    if (isBackCapture && authorizedSignature) {
      authorizedSignature.style.visibility = prevAuthorizedSignatureVisibility;
    }
  }
}

function addRoundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function burnInProfileToFrontCapture(frontCanvas) {
  if (!frontCanvas || !frontCard || !photoRing || !profileMask || !profilePhoto) return;
  const cardRect = frontCard.getBoundingClientRect();
  const ringRect = photoRing.getBoundingClientRect();
  const maskRect = profileMask.getBoundingClientRect();
  if (!cardRect.width || !cardRect.height || !ringRect.width || !ringRect.height || !maskRect.width || !maskRect.height) return;

  const img = profilePhoto;
  const imgW = img.naturalWidth || img.width || 0;
  const imgH = img.naturalHeight || img.height || 0;
  if (!imgW || !imgH) return;

  const ctx = frontCanvas.getContext("2d");
  if (!ctx) return;

  const scaleX = frontCanvas.width / cardRect.width;
  const scaleY = frontCanvas.height / cardRect.height;

  const ringX = (ringRect.left - cardRect.left) * scaleX;
  const ringY = (ringRect.top - cardRect.top) * scaleY;
  const ringW = ringRect.width * scaleX;
  const ringH = ringRect.height * scaleY;

  const maskX = (maskRect.left - cardRect.left) * scaleX;
  const maskY = (maskRect.top - cardRect.top) * scaleY;
  const maskW = maskRect.width * scaleX;
  const maskH = maskRect.height * scaleY;

  const px = profileX ? Number(profileX.value || 0) * scaleX : 0;
  const py = profileY ? Number(profileY.value || 0) * scaleY : 0;
  const ps = profileScale ? Number(profileScale.value || 100) / 100 : 1;
  const containScale = Math.min(maskW / imgW, maskH / imgH) * ps;
  const drawW = imgW * containScale;
  const drawH = imgH * containScale;
  const centerX = maskX + maskW / 2 + px;
  const centerY = maskY + maskH / 2 + py;
  const drawX = centerX - drawW / 2;
  const drawY = centerY - drawH / 2;
  const rotateDeg = profileRotate ? Number(profileRotate.value || 0) : 0;
  const rotateRad = (rotateDeg * Math.PI) / 180;

  const isSquare = !!(profileFrameShapeInput && profileFrameShapeInput.value === "square");
  const ringRadius = isSquare ? Math.min(ringW, ringH) * 0.08 : Math.min(ringW, ringH) / 2;
  const maskRadius = isSquare ? Math.min(maskW, maskH) * 0.08 : Math.min(maskW, maskH) / 2;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.imageSmoothingEnabled = true;

  // Repaint ring base to avoid html2canvas mask drift.
  if (isSquare) {
    addRoundedRectPath(ctx, ringX, ringY, ringW, ringH, ringRadius);
  } else {
    ctx.beginPath();
    ctx.ellipse(ringX + ringW / 2, ringY + ringH / 2, ringW / 2, ringH / 2, 0, 0, Math.PI * 2);
    ctx.closePath();
  }
  ctx.fillStyle = "#f2f2f2";
  ctx.fill();

  // Clip to inner mask and draw profile photo using current adjustments.
  if (isSquare) {
    addRoundedRectPath(ctx, maskX, maskY, maskW, maskH, maskRadius);
  } else {
    ctx.beginPath();
    ctx.ellipse(maskX + maskW / 2, maskY + maskH / 2, maskW / 2, maskH / 2, 0, 0, Math.PI * 2);
    ctx.closePath();
  }
  ctx.clip();
  if (rotateRad) {
    ctx.translate(centerX, centerY);
    ctx.rotate(rotateRad);
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  } else {
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  }
  ctx.restore();
}

function burnInEmployeeSignatureToFrontCapture(frontCanvas) {
  if (!frontCanvas || !frontCard || !employeeSignature) return;
  const cardRect = frontCard.getBoundingClientRect();
  const sigRect = employeeSignature.getBoundingClientRect();
  if (!cardRect.width || !cardRect.height || !sigRect.width || !sigRect.height) return;

  const img = employeeSignature;
  const imgW = img.naturalWidth || img.width || 0;
  const imgH = img.naturalHeight || img.height || 0;
  if (!imgW || !imgH) return;

  const ctx = frontCanvas.getContext("2d");
  if (!ctx) return;

  const scaleX = frontCanvas.width / cardRect.width;
  const scaleY = frontCanvas.height / cardRect.height;
  const boxX = (sigRect.left - cardRect.left) * scaleX;
  const boxY = (sigRect.top - cardRect.top) * scaleY;
  const boxW = sigRect.width * scaleX;
  const boxH = sigRect.height * scaleY;

  const containScale = Math.min(boxW / imgW, boxH / imgH);
  const drawW = imgW * containScale;
  const drawH = imgH * containScale;
  const drawX = boxX + (boxW - drawW) / 2;
  const drawY = boxY + (boxH - drawH) / 2;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.restore();
}

function burnInAuthorizedSignatureToBackCapture(backCanvas) {
  if (!backCanvas || !backCard || !authorizedSignature) return;
  const cardRect = backCard.getBoundingClientRect();
  const sigRect = authorizedSignature.getBoundingClientRect();
  if (!cardRect.width || !cardRect.height || !sigRect.width || !sigRect.height) return;

  const img = authorizedSignature;
  const imgW = img.naturalWidth || img.width || 0;
  const imgH = img.naturalHeight || img.height || 0;
  if (!imgW || !imgH) return;

  const ctx = backCanvas.getContext("2d");
  if (!ctx) return;

  const scaleX = backCanvas.width / cardRect.width;
  const scaleY = backCanvas.height / cardRect.height;
  const boxX = (sigRect.left - cardRect.left) * scaleX;
  const boxY = (sigRect.top - cardRect.top) * scaleY;
  const boxW = sigRect.width * scaleX;
  const boxH = sigRect.height * scaleY;

  const containScale = Math.min(boxW / imgW, boxH / imgH);
  const drawW = imgW * containScale;
  const drawH = imgH * containScale;
  const drawX = boxX + (boxW - drawW) / 2;
  const drawY = boxY + (boxH - drawH) / 2;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.restore();
}

function burnInQrToBackCapture(backCanvas) {
  if (!backCanvas || !backQrWrap || !backCard || typeof window.QRious !== "function") return;
  const cardRect = backCard.getBoundingClientRect();
  const qrRect = backQrWrap.getBoundingClientRect();
  if (!cardRect.width || !cardRect.height || !qrRect.width || !qrRect.height) return;

  const ctx = backCanvas.getContext("2d");
  if (!ctx) return;
  const scaleX = backCanvas.width / cardRect.width;
  const scaleY = backCanvas.height / cardRect.height;
  const left = (qrRect.left - cardRect.left) * scaleX;
  const top = (qrRect.top - cardRect.top) * scaleY;
  const right = (qrRect.right - cardRect.left) * scaleX;
  const bottom = (qrRect.bottom - cardRect.top) * scaleY;
  const dx = Math.floor(left);
  const dy = Math.floor(top);
  const dw = Math.max(1, Math.ceil(right) - dx);
  const dh = Math.max(1, Math.ceil(bottom) - dy);
  const sourceSide = Math.max(1, Math.max(dw, dh));
  backQrExportCanvas.width = sourceSide;
  backQrExportCanvas.height = sourceSide;
  const exportQrEngine = new window.QRious({
    element: backQrExportCanvas,
    size: sourceSide,
    value: getQrSource(),
    level: "H",
    foreground: "#111111",
    background: "#ffffff",
    padding: 0
  });
  exportQrEngine.value = getQrSource();
  const crop = getCanvasInkBounds(backQrExportCanvas) || {
    x: 0,
    y: 0,
    w: Math.max(1, backQrExportCanvas.width || sourceSide),
    h: Math.max(1, backQrExportCanvas.height || sourceSide)
  };
  ctx.save();
  // html2canvas may leave a non-identity transform on the output context.
  // Reset it so QR is drawn using raw pixel coordinates.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(dx, dy, dw, dh);
  ctx.drawImage(
    backQrExportCanvas,
    crop.x,
    crop.y,
    crop.w,
    crop.h,
    dx,
    dy,
    dw,
    dh
  );
  drawQrCenterLogoInRect(ctx, dx, dy, dw, dh);
  ctx.restore();
}

function downloadCanvas(canvas, fileName) {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = fileName;
  a.click();
}

async function downloadCard(cardId, fileName) {
  setStatus("Preparing download...");
  try {
    const canvas = await captureCard(cardId);
    downloadCanvas(canvas, fileName);
    setStatus(`Downloaded ${fileName}`);
  } catch (err) {
    setStatus(`Download failed: ${err.message}`, true);
  }
}

function closeCardZoomModal() {
  cardZoomToken += 1;
  if (!cardZoomModal) return;
  cardZoomModal.classList.remove("show");
  if (cardZoomHideTimer) clearTimeout(cardZoomHideTimer);
  cardZoomHideTimer = setTimeout(() => {
    if (cardZoomModal) cardZoomModal.hidden = true;
    if (cardZoomImage) cardZoomImage.removeAttribute("src");
  }, 280);
}

async function openCardZoomModal(cardId, label) {
  if (!cardZoomModal || !cardZoomImage) return;
  if (cardZoomHideTimer) {
    clearTimeout(cardZoomHideTimer);
    cardZoomHideTimer = null;
  }
  const token = ++cardZoomToken;
  cardZoomModal.classList.remove("show");
  cardZoomModal.hidden = false;
  cardZoomImage.removeAttribute("src");
  if (cardZoomTitle) cardZoomTitle.textContent = `Preparing ${label}...`;
  try {
    await waitForUiPaint(2);
    const canvas = await captureCard(cardId);
    if (token !== cardZoomToken) return;
    cardZoomImage.src = canvas.toDataURL("image/png");
    if (cardZoomTitle) cardZoomTitle.textContent = label;
    requestAnimationFrame(() => {
      if (token !== cardZoomToken) return;
      if (cardZoomModal) cardZoomModal.classList.add("show");
    });
  } catch (err) {
    closeCardZoomModal();
    setStatus(`Preview zoom failed: ${err.message}`, true);
  }
}

async function printBothCards() {
  setStatus("Preparing print layout...");
  try {
    const [frontCanvas, backCanvas] = await Promise.all([captureCard("frontCard"), captureCard("backCard")]);
    const front = frontCanvas.toDataURL("image/png");
    const back = backCanvas.toDataURL("image/png");
    const win = window.open("", "_blank");
    if (!win) throw new Error("Popup blocked by browser.");

    win.document.write(`
      <!doctype html>
      <html>
      <head>
        <title>Print ID</title>
        <style>
          body { margin: 0; padding: 16px; font-family: Arial, sans-serif; }
          .row { display: flex; gap: 16px; justify-content: center; align-items: flex-start; }
          img { width: 330px; height: 535px; box-shadow: 0 4px 18px rgba(0,0,0,0.18); }
          @media print {
            body { padding: 0; }
            .row { gap: 12mm; }
            img { box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <div class="row">
          <img src="${front}" alt="ID Front">
          <img src="${back}" alt="ID Back">
        </div>
        <script>
          window.onload = () => window.print();
        <\/script>
      </body>
      </html>
    `);
    win.document.close();
    setStatus("Print window opened.");
  } catch (err) {
    setStatus(`Print failed: ${err.message}`, true);
  }
}

let approvedIdsCache = [];
let approvedIdsLastSync = 0;
let approvedIdsFetchPromise = null;
const APPROVED_IDS_CACHE_MS = 5 * 60 * 1000;

function loadApprovedIds() {
  return Array.isArray(approvedIdsCache) ? approvedIdsCache : [];
}

function setApprovedIdsCache(records) {
  approvedIdsCache = Array.isArray(records) ? records : [];
  approvedIdsLastSync = Date.now();
}

function saveApprovedIds(records, changedRecords) {
  setApprovedIdsCache(records);
  if (Array.isArray(changedRecords)) {
    if (!changedRecords.length) return;
    syncApprovedIdsToCloud(changedRecords).catch((err) => {
      console.warn("Supabase save sync failed:", err && err.message ? err.message : err);
    });
    return;
  }
  syncApprovedIdsToCloud(records).catch((err) => {
    console.warn("Supabase save sync failed:", err && err.message ? err.message : err);
  });
}

function mapCloudRowToApprovedRecord(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: row.id || "",
    approvedAt: row.approved_at || "",
    employeeNo: row.employee_no || "",
    employeeName: row.employee_name || "",
    position: row.position || "",
    validUntil: row.valid_until || "N/A",
    qrToken: row.qr_token || "",
    qrValue: row.qr_value || "",
    previewUrl: row.preview_url || "",
    frontImage: row.front_image || "",
    backImage: row.back_image || ""
  };
}

function mapApprovedRecordToCloudRow(record) {
  const safe = record && typeof record === "object" ? record : {};
  return {
    id: String(safe.id || generateRecordId()),
    approved_at: safe.approvedAt || new Date().toISOString(),
    employee_no: safe.employeeNo || "",
    employee_name: safe.employeeName || "",
    position: safe.position || "",
    valid_until: safe.validUntil || "N/A",
    qr_token: safe.qrToken || "",
    qr_value: safe.qrValue || "",
    preview_url: safe.previewUrl || "",
    front_image: safe.frontImage || "",
    back_image: safe.backImage || ""
  };
}

async function loadApprovedIdsFromCloudAndCache({ force = false } = {}) {
  if (!supabaseClient) return null;
  const now = Date.now();
  if (!force && approvedIdsCache.length && now - approvedIdsLastSync < APPROVED_IDS_CACHE_MS) {
    return approvedIdsCache;
  }
  if (approvedIdsFetchPromise) return approvedIdsFetchPromise;
  approvedIdsFetchPromise = (async () => {
    const { data, error } = await supabaseClient
      .from("id_records")
      .select("id, approved_at, employee_no, employee_name, position, valid_until, qr_token, qr_value, preview_url, front_image, back_image")
      .order("approved_at", { ascending: false });
    if (error) throw error;
    const cloudRecords = Array.isArray(data)
      ? data.map(mapCloudRowToApprovedRecord).filter(Boolean)
      : [];
    setApprovedIdsCache(cloudRecords);
    return cloudRecords;
  })();
  try {
    return await approvedIdsFetchPromise;
  } finally {
    approvedIdsFetchPromise = null;
  }
}

async function syncApprovedIdsToCloud(records) {
  if (!supabaseClient) return;
  const rows = (Array.isArray(records) ? records : []).map(mapApprovedRecordToCloudRow);

  if (rows.length) {
    const { error: upsertError } = await supabaseClient
      .from("id_records")
      .upsert(rows, { onConflict: "id" });
    if (upsertError) throw upsertError;
  }
}

function isQuotaExceededError(err) {
  if (!err) return false;
  const msg = String((err && err.message) || "").toLowerCase();
  return (
    (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "QuotaExceededError") ||
    msg.includes("exceeded the quota") ||
    msg.includes("quota")
  );
}

function compressCanvasForStorage(canvas, options = {}) {
  const format = typeof options.format === "string" ? options.format : "image/jpeg";
  const quality = typeof options.quality === "number" ? options.quality : 0.82;
  const maxPixels = typeof options.maxPixels === "number" ? options.maxPixels : 850000;
  const fillBackground = options.fillBackground !== false;
  const pixelated = !!options.pixelated;
  const srcW = canvas.width || 1;
  const srcH = canvas.height || 1;
  const srcPixels = srcW * srcH;

  let targetCanvas = canvas;
  if (srcPixels > maxPixels) {
    const scale = Math.sqrt(maxPixels / srcPixels);
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const resized = document.createElement("canvas");
    resized.width = w;
    resized.height = h;
    const ctx = resized.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingEnabled = !pixelated;
      if (fillBackground) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
      }
      ctx.drawImage(canvas, 0, 0, w, h);
      targetCanvas = resized;
    }
  }

  try {
    if (format === "image/png") {
      return targetCanvas.toDataURL("image/png");
    }
    return targetCanvas.toDataURL(format, quality);
  } catch {
    return targetCanvas.toDataURL("image/png");
  }
}

function recompressDataUrlForStorage(dataUrl, options = {}) {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== "string") {
      resolve("");
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const srcW = Math.max(1, img.naturalWidth || img.width || 1);
        const srcH = Math.max(1, img.naturalHeight || img.height || 1);
        const maxPixels = typeof options.maxPixels === "number" ? options.maxPixels : 360000;
        const quality = typeof options.quality === "number" ? options.quality : 0.52;
        const format = typeof options.format === "string" ? options.format : "image/jpeg";
        const fillBackground = options.fillBackground !== false;
        const pixelated = !!options.pixelated;
        const srcPixels = srcW * srcH;
        let targetW = srcW;
        let targetH = srcH;
        if (srcPixels > maxPixels) {
          const scale = Math.sqrt(maxPixels / srcPixels);
          targetW = Math.max(1, Math.round(srcW * scale));
          targetH = Math.max(1, Math.round(srcH * scale));
        }
        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.imageSmoothingEnabled = !pixelated;
        if (fillBackground) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, targetW, targetH);
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        if (format === "image/png") {
          resolve(canvas.toDataURL("image/png"));
          return;
        }
        resolve(canvas.toDataURL(format, quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function compressExistingApprovedRecords(records) {
  const sorted = Array.isArray(records) ? [...records] : [];
  sorted.sort((a, b) => {
    const at = Date.parse((a && a.approvedAt) || "") || 0;
    const bt = Date.parse((b && b.approvedAt) || "") || 0;
    return at - bt;
  });

  for (let i = 0; i < sorted.length; i += 1) {
    const rec = sorted[i];
    if (!rec || typeof rec !== "object") continue;
    rec.frontImage = await recompressDataUrlForStorage(rec.frontImage, {
      format: "image/jpeg",
      quality: 0.78,
      maxPixels: 1000000,
      fillBackground: true
    });
    rec.backImage = await recompressDataUrlForStorage(rec.backImage, {
      format: "image/png",
      maxPixels: 900000,
      fillBackground: true
    });
  }
  return sorted;
}

function generateRecordId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function generateShortToken(existingRecords, length = 6) {
  const used = new Set(
    (existingRecords || [])
      .map((item) => (item && typeof item.qrToken === "string" ? item.qrToken.trim() : ""))
      .filter(Boolean)
  );
  for (let i = 0; i < 32; i += 1) {
    const token = Math.random().toString(36).slice(2, 2 + length);
    if (token.length === length && !used.has(token)) return token;
  }
  return `${Date.now().toString(36).slice(-length)}`;
}

function persistApprovedIdsNavContext() {
  setStoreItem(
    approvedIdsNavContextKey,
    JSON.stringify({
      signedIn: appSignedIn,
      role: appSignedInRole,
      unlocked: adminUnlocked
    })
  );
}

async function approveCurrentId() {
  const employeeNo = (employeeNoInput && employeeNoInput.value ? employeeNoInput.value : "").trim();
  const validUntilInput = document.getElementById("validUntil");
  const validUntil = (validUntilInput && validUntilInput.value ? validUntilInput.value : "").trim();
  if (!employeeNo) {
    setStatus("Employee No is required before approving.", true);
    return;
  }

  setStoreItem(approvedIdsPendingOverlayKey, String(Date.now()));
  let existing = loadApprovedIds();
  try {
    const cloudRecords = await loadApprovedIdsFromCloudAndCache({ force: true });
    if (Array.isArray(cloudRecords)) existing = cloudRecords;
  } catch (cloudErr) {
    console.warn(
      "Supabase read sync failed before approve:",
      cloudErr && cloudErr.message ? cloudErr.message : cloudErr
    );
  }
  const hasDuplicate = existing.some((item) => {
    const savedNo = typeof item.employeeNo === "string" ? item.employeeNo.trim() : "";
    return savedNo.toLowerCase() === employeeNo.toLowerCase();
  });
  if (hasDuplicate) {
    removeStoreItem(approvedIdsPendingOverlayKey);
    setStatus("Employee No already approved. Duplicate is not allowed.", true);
    return;
  }

  const recordId = generateRecordId();
  const qrToken = generateShortToken(existing, 6);
  const previewUrl = buildRecordPreviewUrl(qrToken);
  try {
    qrOverrideValue = previewUrl || "";
    updateBackQr();
    await waitForUiPaint(2);
    await flushSignatureRenders();
    await waitForUiPaint(1);

    const [frontCanvas, backCanvas] = await Promise.all([
      captureCard("frontCard"),
      captureCard("backCard")
    ]);

    const record = {
      id: recordId,
      approvedAt: new Date().toISOString(),
      employeeNo,
      employeeName: employeeNameInput && employeeNameInput.value ? employeeNameInput.value.trim() : "",
      position: positionInput && positionInput.value ? positionInput.value.trim() : "",
      validUntil: validUntil || "N/A",
      qrToken,
      qrValue: previewUrl,
      previewUrl,
      frontImage: compressCanvasForStorage(frontCanvas, {
        format: "image/png",
        maxPixels: 2400000,
        fillBackground: true
      }),
      backImage: compressCanvasForStorage(backCanvas, {
        format: "image/png",
        maxPixels: 2800000,
        fillBackground: true
      })
    };

    existing.push(record);
    setApprovedIdsCache(existing);
    await syncApprovedIdsToCloud([record]);
    persistApprovedIdsNavContext();
    navigateWithTransition("approved-ids.html?src=approve");
    setStatus("ID approved and saved.");
  } catch (err) {
    removeStoreItem(approvedIdsPendingOverlayKey);
    setStatus(`Approve failed: ${err.message}`, true);
  } finally {
    qrOverrideValue = "";
    updateBackQr();
  }
}

function openApprovedIdsPage() {
  persistApprovedIdsNavContext();
  navigateWithTransition("approved-ids.html");
  setStatus("Opening approved ID previews...");
}

initPerFieldDefaults();
syncEntryLoginLogo();
updateAllCardContrastModes();
loadSuperAdminCredentials();
loadAdminCredentials();
loadLocalSettingsTs();
if (adminSettingsPanel) {
  applyPersistedSettings(adminSettingsPanel);
  bindSettingPersistence(adminSettingsPanel);
}
applyFrontInfoVisibility();
applyBackInfoVisibility();
loadInterfaceTheme();
applyAdminAccessState();
if (cloudReady) {
  loadEntryLoginSession();
  applyEntryGateState();
  if (document.body) document.body.classList.remove("app-loading");
}
if (adminLoginBtn) adminLoginBtn.addEventListener("click", openAdminLoginModal);
if (adminLockBtn) adminLockBtn.addEventListener("click", handleAdminLock);
if (entryLogoutBtn) entryLogoutBtn.addEventListener("click", logoutEntrySession);
if (adminLoginSubmitBtn) adminLoginSubmitBtn.addEventListener("click", submitAdminLogin);
if (adminLoginCancelBtn) adminLoginCancelBtn.addEventListener("click", closeAdminLoginModal);
if (entryLoginSubmitBtn) entryLoginSubmitBtn.addEventListener("click", submitEntryLogin);
if (adminSettingsPanel) {
  ["input", "change"].forEach((evtName) => {
    adminSettingsPanel.addEventListener(evtName, () => {
      if (settingsHydrating) return;
      if (!adminUnlocked) return;
      scheduleSettingsFlush();
    });
  });
}
if (entryLoginUsernameInput) {
  entryLoginUsernameInput.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") submitEntryLogin();
  });
}
if (entryLoginPasswordInput) {
  entryLoginPasswordInput.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") submitEntryLogin();
  });
  entryLoginPasswordInput.addEventListener("input", () => {
    if (entryLoginErrorEl) entryLoginErrorEl.hidden = true;
  });
}
if (entryLoginUsernameInput) {
  entryLoginUsernameInput.addEventListener("input", () => {
    if (entryLoginErrorEl) entryLoginErrorEl.hidden = true;
  });
}
if (saveSuperAdminCredentialsBtn) {
  saveSuperAdminCredentialsBtn.addEventListener("click", handleSuperAdminCredentialsSave);
}
if (saveAdminAccountCredentialsBtn) {
  saveAdminAccountCredentialsBtn.addEventListener("click", handleAdminAccountCredentialsSave);
}
if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", toggleInterfaceTheme);
}
if (adminPasswordInput) {
  adminPasswordInput.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") submitAdminLogin();
  });
}

if (creatorCreditPhoto && creatorCreditPhotoFileInput) {
  const savedCreatorPhoto = getStoreItem(creatorCreditPhotoStorageKey);
  if (savedCreatorPhoto) {
    creatorCreditPhoto.src = savedCreatorPhoto;
  }
}

if (creatorCreditText) {
  const savedCreatorText = getStoreItem(creatorCreditTextStorageKey);
  if (savedCreatorText && savedCreatorText.trim()) {
    creatorCreditText.textContent = savedCreatorText;
  }
}

let pendingCreatorPhotoDataUrl = "";

function openCreatorTrademarkModal() {
  if (appSignedInRole !== "superadmin") {
    setStatus("TM Editor is available only in Super Admin interface.", true);
    return;
  }
  if (!creatorTrademarkModal) return;
  creatorTrademarkModal.hidden = false;
  pendingCreatorPhotoDataUrl = "";
  if (creatorTrademarkErrorEl) creatorTrademarkErrorEl.hidden = true;
  if (creatorTrademarkUsernameInput) creatorTrademarkUsernameInput.value = "";
  if (creatorTrademarkPasswordInput) creatorTrademarkPasswordInput.value = "";
  if (creatorCreditTextInput && creatorCreditText) {
    creatorCreditTextInput.value = creatorCreditText.textContent || "";
  }
  if (creatorCreditPhotoFileInput) creatorCreditPhotoFileInput.value = "";
  if (creatorTrademarkUsernameInput) creatorTrademarkUsernameInput.focus();
}

function closeCreatorTrademarkModal() {
  if (!creatorTrademarkModal) return;
  creatorTrademarkModal.hidden = true;
  pendingCreatorPhotoDataUrl = "";
}

function stopCameraStream({ hard = false } = {}) {
  const stream = cameraStream || (cameraVideo ? cameraVideo.srcObject : null);
  if (stream && typeof stream.getTracks === "function") {
    stream.getTracks().forEach((track) => track.stop());
  }
  cameraStream = null;
  if (cameraVideo) {
    try {
      if (typeof cameraVideo.pause === "function") cameraVideo.pause();
    } catch {
      // ignore
    }
    cameraVideo.srcObject = null;
    cameraVideo.load();
  }
  if (hard && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((tmpStream) => {
        tmpStream.getTracks().forEach((track) => track.stop());
      })
      .catch(() => {});
  }
}

function closeCameraModal() {
  if (cameraModal) cameraModal.hidden = true;
  if (cameraModal) cameraModal.style.display = "";
  if (cameraModal) cameraModal.style.visibility = "";
  if (cameraModal) cameraModal.style.opacity = "";
  document.body.classList.remove("camera-open");
  if (cameraCanvas) cameraCanvas.hidden = true;
  if (cameraUse) cameraUse.hidden = true;
  if (cameraCapture) cameraCapture.hidden = false;
  if (cameraError) cameraError.hidden = true;
  cameraDataUrl = "";
  stopCameraStream({ hard: true });
}

async function populateCameraDevices(selectedId) {
  if (!cameraDeviceSelect || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device && device.kind === "videoinput");
    const current = selectedId || cameraDeviceSelect.value || "";
    const options = [
      { id: "", label: "Default camera" },
      ...cameras.map((device, index) => ({
        id: device.deviceId,
        label: device.label || `Camera ${index + 1}`
      }))
    ];
    cameraDeviceSelect.innerHTML = "";
    options.forEach((option) => {
      const el = document.createElement("option");
      el.value = option.id;
      el.textContent = option.label;
      cameraDeviceSelect.appendChild(el);
    });
    if (options.some((opt) => opt.id === current)) {
      cameraDeviceSelect.value = current;
    }
  } catch {
    // ignore device enumeration errors
  }
}

async function startCameraStream(deviceId) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return null;
  stopCameraStream();
  const constraints = deviceId
    ? { video: { deviceId: { exact: deviceId } }, audio: false }
    : { video: { facingMode: "user" }, audio: false };
  cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
  return cameraStream;
}

async function openCameraModal() {
  if (!cameraModal || !cameraVideo) return;
  if (cameraHint) cameraHint.hidden = true;
  if (cameraError) cameraError.hidden = true;
  cameraModal.hidden = false;
  cameraModal.removeAttribute("hidden");
  cameraModal.style.display = "grid";
  cameraModal.style.visibility = "visible";
  cameraModal.style.opacity = "1";
  document.body.classList.add("camera-open");
  window.scrollTo({ top: 0, behavior: "auto" });
  cameraCanvas.hidden = true;
  cameraUse.hidden = true;
  cameraCapture.hidden = false;
  if (cameraVideo) cameraVideo.style.display = "block";
  if (window.location.protocol === "file:") {
    if (cameraHint) cameraHint.hidden = false;
    if (cameraError) {
      cameraError.textContent = "Camera is blocked on file://. Use http://localhost or https://.";
      cameraError.hidden = false;
    }
    return;
  }
  if (!window.isSecureContext) {
    if (cameraError) {
      cameraError.textContent = "Camera requires a secure context (https:// or http://localhost).";
      cameraError.hidden = false;
    }
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (cameraError) {
      cameraError.textContent = "Camera is not supported in this browser.";
      cameraError.hidden = false;
    }
    return;
  }
  try {
    const preferredDeviceId = cameraDeviceSelect ? cameraDeviceSelect.value : "";
    cameraStream = await startCameraStream(preferredDeviceId);
    cameraVideo.srcObject = cameraStream;
    cameraVideo.muted = true;
    cameraVideo.playsInline = true;
    cameraVideo.setAttribute("playsinline", "");
    await populateCameraDevices(preferredDeviceId);
    if (typeof cameraVideo.play === "function") {
      await cameraVideo.play();
    }
    setTimeout(() => {
      if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) {
        if (cameraError) {
          cameraError.textContent = "Camera stream active but preview not available.";
          cameraError.hidden = false;
        }
      }
    }, 800);
  } catch (err) {
    if (cameraError) {
      cameraError.textContent = "Unable to access camera. Check browser and OS camera permissions.";
      cameraError.hidden = false;
    }
  }
}

// Expose for fallback handler if script loads after user click.
window.openCameraModal = openCameraModal;

function captureCameraPhoto() {
  if (!cameraVideo || !cameraCanvas) return;
  const width = cameraVideo.videoWidth || 640;
  const height = cameraVideo.videoHeight || 480;
  cameraCanvas.width = width;
  cameraCanvas.height = height;
  const ctx = cameraCanvas.getContext("2d");
  if (!ctx) return;
  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(cameraVideo, 0, 0, width, height);
  ctx.restore();
  cameraDataUrl = cameraCanvas.toDataURL("image/png");
  cameraCanvas.hidden = false;
  if (cameraVideo) cameraVideo.style.display = "none";
  stopCameraStream();
  if (cameraUse) cameraUse.hidden = false;
  if (cameraCapture) cameraCapture.hidden = true;
}

function useCapturedPhoto() {
  if (!cameraDataUrl) return;
  const file = dataUrlToFile(cameraDataUrl, "camera-profile.png");
  if (!file) return;
  if (photoFileInput) {
    const dt = new DataTransfer();
    dt.items.add(file);
    photoFileInput.files = dt.files;
    photoFileInput.dispatchEvent(new Event("change", { bubbles: true }));
  }
  closeCameraModal();
}

function saveCreatorTrademarkChanges() {
  if (!adminUnlocked || appSignedInRole !== "superadmin") {
    if (creatorTrademarkErrorEl) creatorTrademarkErrorEl.hidden = false;
    setStatus("Super admin access required.", true);
    return;
  }

  if (creatorTrademarkErrorEl) creatorTrademarkErrorEl.hidden = true;
  if (creatorCreditText && creatorCreditTextInput) {
    const text = (creatorCreditTextInput.value || "").trim();
    creatorCreditText.textContent = text || " ";
    setStoreItem(creatorCreditTextStorageKey, text);
    writeLocalSetting(creatorCreditTextStorageKey, text);
    markLocalSettingUpdated(creatorCreditTextStorageKey);
  }
  if (pendingCreatorPhotoDataUrl && creatorCreditPhoto) {
    creatorCreditPhoto.src = pendingCreatorPhotoDataUrl;
    setStoreItem(creatorCreditPhotoStorageKey, pendingCreatorPhotoDataUrl);
    writeLocalSetting(creatorCreditPhotoStorageKey, pendingCreatorPhotoDataUrl);
    markLocalSettingUpdated(creatorCreditPhotoStorageKey);
  }

  closeCreatorTrademarkModal();
  setStatus("Footer credit updated.");
}

if (creatorCreditPhotoFileInput) {
  creatorCreditPhotoFileInput.addEventListener("change", () => {
    const file = creatorCreditPhotoFileInput.files && creatorCreditPhotoFileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) return;
      pendingCreatorPhotoDataUrl = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

if (creatorTrademarkBtn) creatorTrademarkBtn.addEventListener("click", openCreatorTrademarkModal);
if (creatorTrademarkSaveBtn) creatorTrademarkSaveBtn.addEventListener("click", saveCreatorTrademarkChanges);
if (creatorTrademarkCancelBtn) creatorTrademarkCancelBtn.addEventListener("click", closeCreatorTrademarkModal);
if (openCameraBtn) openCameraBtn.addEventListener("click", openCameraModal);
if (cameraCancel) cameraCancel.addEventListener("click", closeCameraModal);
if (cameraCapture) cameraCapture.addEventListener("click", captureCameraPhoto);
if (cameraUse) cameraUse.addEventListener("click", useCapturedPhoto);
if (cameraDeviceSelect) {
  cameraDeviceSelect.addEventListener("change", async () => {
    if (!cameraModal || cameraModal.hidden) return;
    try {
      if (cameraError) cameraError.hidden = true;
      const deviceId = cameraDeviceSelect.value || "";
      const stream = await startCameraStream(deviceId);
      if (cameraVideo) {
        cameraVideo.srcObject = stream;
        if (typeof cameraVideo.play === "function") {
          await cameraVideo.play();
        }
      }
    } catch {
      if (cameraError) {
        cameraError.textContent = "Unable to access selected camera.";
        cameraError.hidden = false;
      }
    }
  });
}
if (cameraModal) {
  cameraModal.addEventListener("click", (evt) => {
    if (evt.target === cameraModal) closeCameraModal();
  });
}
window.addEventListener("beforeunload", () => stopCameraStream({ hard: false }));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") stopCameraStream({ hard: false });
});
if (creatorTrademarkPasswordInput) {
  creatorTrademarkPasswordInput.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") saveCreatorTrademarkChanges();
  });
}
if (creatorTrademarkUsernameInput) {
  creatorTrademarkUsernameInput.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") saveCreatorTrademarkChanges();
  });
}

if (frontCard) {
  frontCard.addEventListener("click", () => {
    if (!appSignedIn) return;
    openCardZoomModal("frontCard", "Front ID Preview");
  });
}
if (backCard) {
  backCard.addEventListener("click", () => {
    if (!appSignedIn) return;
    openCardZoomModal("backCard", "Back ID Preview");
  });
}
if (cardZoomCloseBtn) {
  cardZoomCloseBtn.addEventListener("click", closeCardZoomModal);
}
if (cardZoomModal) {
  cardZoomModal.addEventListener("click", (evt) => {
    if (evt.target === cardZoomModal) closeCardZoomModal();
  });
}
document.addEventListener("keydown", (evt) => {
  if (evt.key === "Escape" && cardZoomModal && !cardZoomModal.hidden) {
    closeCardZoomModal();
  }
  if (evt.key === "Escape" && cameraModal && !cameraModal.hidden) {
    closeCameraModal();
  }
});

function handleStoreChange(evt) {
  const key = evt && evt.detail ? evt.detail.key : "";
  if (key === interfaceThemeStorageKey) loadInterfaceTheme();
  if (key && key.startsWith(settingsValuePrefix)) {
    const ts = localSettingsTs[key] || 0;
    if (Date.now() - ts < 10 * 60 * 1000) return;
    const elId = key.replace(settingsValuePrefix, "");
    const el = elId ? document.getElementById(elId) : null;
    if (el && isPersistableSettingElement(el)) {
      const stored = readStoredOrLocalSetting(key);
      if (stored === null || stored === undefined) return;
      settingsHydrating = true;
      const changed = writeElementValue(el, stored);
      settingsHydrating = false;
      if (changed) {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }
  if (key === watermarkStorageKey) {
    loadWatermarkSettings();
    writeWatermarkSettingsToInputs();
    renderWatermark();
  }
  if (key === previewAccessStorageKey) {
    const ts = localSettingsTs[previewAccessStorageKey] || 0;
    if (Date.now() - ts < 10 * 60 * 1000) return;
    loadPreviewAccessSetting();
  }
  if (key === previewInfoStorageKey) {
    const ts = localSettingsTs[previewInfoStorageKey] || 0;
    if (Date.now() - ts < 10 * 60 * 1000) return;
    loadPreviewInfoSetting();
  }
  if (key === profileAiStorageKey) {
    const ts = localSettingsTs[profileAiStorageKey] || 0;
    if (Date.now() - ts < 10 * 60 * 1000) return;
    loadProfileAiSetting();
  }
  if (key === defaultsStorageKey) {
    loadDefaultFieldState();
    applySavedDefaultValues();
    syncEntryLoginLogo();
  }
  if (key === currentLogoStorageKey) syncEntryLoginLogo();
  if (key === creatorCreditPhotoStorageKey || key === creatorCreditTextStorageKey) {
    const ts = localSettingsTs[key] || 0;
    if (Date.now() - ts < 10 * 60 * 1000) return;
    const localOverride = readLocalSetting(key);
    if (localOverride !== null && localOverride !== undefined && localOverride !== "") {
      if (creatorCreditPhoto && key === creatorCreditPhotoStorageKey) creatorCreditPhoto.src = localOverride;
      if (creatorCreditText && key === creatorCreditTextStorageKey) creatorCreditText.textContent = localOverride;
      return;
    }
    if (creatorCreditPhoto && key === creatorCreditPhotoStorageKey) {
      const savedPhoto = getStoreItem(creatorCreditPhotoStorageKey);
      if (savedPhoto) creatorCreditPhoto.src = savedPhoto;
    }
    if (creatorCreditText && key === creatorCreditTextStorageKey) {
      const savedText = getStoreItem(creatorCreditTextStorageKey);
      if (savedText && savedText.trim()) creatorCreditText.textContent = savedText;
    }
    if (evt && evt.detail) {
      const nextValue = evt.detail.newValue;
      if (nextValue === null || nextValue === undefined) {
        writeLocalSetting(key, null);
      } else {
        writeLocalSetting(key, String(nextValue));
      }
      markLocalSettingUpdated(key);
    }
  }
}

window.addEventListener("id-card-store", handleStoreChange);

if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      appSignedIn = false;
      appSignedInRole = "admin";
      adminUnlocked = false;
      clearEntryLoginSession();
      applyAdminAccessState();
      applyEntryGateState();
      notifyAuthChange("signed_out");
      return;
    }
    if (event === "SIGNED_IN") {
      loadEntryLoginSession();
      if (!appSignedIn) {
        appSignedIn = true;
        appSignedInRole = "admin";
        adminUnlocked = false;
        persistEntryLoginSession();
      }
      loadAdminSession();
      applyAdminAccessState();
      applyEntryGateState();
      notifyAuthChange("signed_in");
    }
  });
}

if (authChannel) {
  authChannel.addEventListener("message", (evt) => {
    const msg = evt && evt.data ? evt.data : null;
    if (!msg || msg.type !== "auth") return;
    if (msg.state === "signed_out") {
      appSignedIn = false;
      appSignedInRole = "admin";
      adminUnlocked = false;
      clearEntryLoginSession();
      applyAdminAccessState();
      applyEntryGateState();
      return;
    }
    if (msg.state === "signed_in") {
      refreshAuthState().finally(() => {
        applyAdminAccessState();
        applyEntryGateState();
      });
    }
  });
}

if (window.__idCardCloudReady) {
  window.__idCardCloudReady.finally(() => {
    cloudReady = true;
    loadDefaultFieldState();
    applySavedDefaultValues();
    loadWatermarkSettings();
    writeWatermarkSettingsToInputs();
    renderWatermark();
    loadPreviewAccessSetting();
    loadPreviewInfoSetting();
    loadInterfaceTheme();
    loadSuperAdminCredentials();
    loadAdminCredentials();
    if (adminSettingsPanel) {
      applyPersistedSettings(adminSettingsPanel);
    }
    refreshAuthState().finally(() => {
      applyAdminAccessState();
      applyEntryGateState();
    });
    syncEntryLoginLogo();
    if (document.body) document.body.classList.remove("app-loading");
    const overlay = document.getElementById("appLoadingOverlay");
    if (overlay) overlay.hidden = true;
  });
}

if (document.body) {
  window.setTimeout(() => {
    if (document.body && document.body.classList.contains("app-loading")) {
      document.body.classList.remove("app-loading");
    }
    const overlay = document.getElementById("appLoadingOverlay");
    if (overlay) overlay.hidden = true;
  }, 1500);
}

["mousemove", "mousedown", "keydown", "touchstart", "scroll", "input", "change"].forEach((evtName) => {
  document.addEventListener(evtName, touchAdminActivity, { passive: true });
});

downloadFrontBtn.addEventListener("click", () => downloadCard("frontCard", "id-front.png"));
downloadBackBtn.addEventListener("click", () => downloadCard("backCard", "id-back.png"));
printBothBtn.addEventListener("click", printBothCards);
if (approveIdBtn) approveIdBtn.addEventListener("click", approveCurrentId);
if (openApprovedIdsBtn) openApprovedIdsBtn.addEventListener("click", openApprovedIdsPage);

loadApprovedIdsFromCloudAndCache().catch((err) => {
  console.warn("Initial Supabase sync skipped:", err && err.message ? err.message : err);
});

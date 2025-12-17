function clampInt(value, { min = 1, max = 20000 } = {}) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function parseSizeText(text) {
  if (text == null) return null;
  const raw = String(text).trim();
  if (!raw) return null;
  const m = /^\s*(\d{1,6})\s*[x×]\s*(\d{1,6})\s*(?:px)?\s*$/i.exec(raw);
  if (!m) return null;
  const width = clampInt(m[1]);
  const height = clampInt(m[2]);
  if (!width || !height) return null;
  return { width, height };
}

export function defaultImageExportPresets() {
  return [
    { key: '4050x5100', label: '4050×5100 px (8×10 @ 510 dpi)', width: 4050, height: 5100 },
    { key: '3840x2160', label: '3840×2160 px (4K)', width: 3840, height: 2160 },
    { key: '1920x1080', label: '1920×1080 px (HD)', width: 1920, height: 1080 },
    { key: '1080x1080', label: '1080×1080 px (square)', width: 1080, height: 1080 },
  ];
}

export async function promptImageExportSize({
  title = 'Export image',
  presets = defaultImageExportPresets(),
  defaultSize = null,
  includeFormulaOverlayOption = null,
} = {}) {
  // Prefer a proper <dialog> UI when available; fall back to prompt().
  if (typeof document === 'undefined') {
    return null;
  }

  const fallback = () => {
    const suggested = defaultSize ? `${defaultSize.width}x${defaultSize.height}` : (presets[0] ? `${presets[0].width}x${presets[0].height}` : '1920x1080');
    const raw = window.prompt(
      `${title}\n\nEnter size like 4050x5100 (px).\nPresets: ${presets.map((p) => `${p.width}x${p.height}`).join(', ')}`,
      suggested,
    );
    if (raw == null) return null;
    const size = parseSizeText(raw);
    if (!size) return null;
    let includeFormulaOverlay = false;
    if (includeFormulaOverlayOption) {
      try {
        const label =
          typeof includeFormulaOverlayOption === 'object' && includeFormulaOverlayOption?.label
            ? String(includeFormulaOverlayOption.label)
            : 'Overlay formula near bottom?';
        includeFormulaOverlay = window.confirm(label);
      } catch (_) {
        includeFormulaOverlay = false;
      }
    }
    return { ...size, includeFormulaOverlay };
  };

  const supportsDialog = typeof HTMLDialogElement !== 'undefined' && typeof document.createElement('dialog').showModal === 'function';
  if (!supportsDialog) {
    return fallback();
  }

  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', title);
  dialog.style.maxWidth = 'min(520px, calc(100vw - 24px))';
  dialog.style.width = '100%';
  dialog.style.border = '1px solid rgba(255,255,255,0.25)';
  dialog.style.borderRadius = '12px';
  dialog.style.padding = '14px 14px 12px';
  dialog.style.background = 'rgba(0,0,0,0.92)';
  dialog.style.color = '#f1f1f1';

  const heading = document.createElement('div');
  heading.textContent = title;
  heading.style.fontSize = '16px';
  heading.style.fontWeight = '600';
  heading.style.marginBottom = '10px';

  const form = document.createElement('form');
  form.method = 'dialog';

  const row = document.createElement('div');
  row.style.display = 'grid';
  row.style.gridTemplateColumns = '1fr 1fr';
  row.style.gap = '10px';
  row.style.marginBottom = '10px';

  const presetWrap = document.createElement('div');
  const presetLabel = document.createElement('label');
  presetLabel.textContent = 'Preset';
  presetLabel.style.display = 'block';
  presetLabel.style.fontSize = '12px';
  presetLabel.style.opacity = '0.85';
  presetLabel.style.marginBottom = '4px';

  const presetSelect = document.createElement('select');
  presetSelect.style.width = '100%';
  presetSelect.style.height = '36px';
  presetSelect.style.borderRadius = '8px';
  presetSelect.style.border = '1px solid rgba(255,255,255,0.25)';
  presetSelect.style.background = 'rgba(10,10,10,0.85)';
  presetSelect.style.color = 'inherit';
  presetSelect.style.padding = '0 10px';

  const customOption = document.createElement('option');
  customOption.value = '__custom__';
  customOption.textContent = 'Custom…';
  presetSelect.appendChild(customOption);

  presets.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.key || `${p.width}x${p.height}`;
    opt.textContent = p.label || `${p.width}×${p.height}px`;
    opt.dataset.width = String(p.width);
    opt.dataset.height = String(p.height);
    presetSelect.appendChild(opt);
  });

  presetWrap.appendChild(presetLabel);
  presetWrap.appendChild(presetSelect);

  const sizeWrap = document.createElement('div');
  const sizeLabel = document.createElement('label');
  sizeLabel.textContent = 'Size (px)';
  sizeLabel.style.display = 'block';
  sizeLabel.style.fontSize = '12px';
  sizeLabel.style.opacity = '0.85';
  sizeLabel.style.marginBottom = '4px';

  const sizeInput = document.createElement('input');
  sizeInput.type = 'text';
  sizeInput.inputMode = 'numeric';
  sizeInput.placeholder = '4050x5100';
  sizeInput.style.width = '100%';
  sizeInput.style.height = '34px';
  sizeInput.style.borderRadius = '8px';
  sizeInput.style.border = '1px solid rgba(255,255,255,0.25)';
  sizeInput.style.background = 'rgba(10,10,10,0.85)';
  sizeInput.style.color = 'inherit';
  sizeInput.style.padding = '0 10px';

  sizeWrap.appendChild(sizeLabel);
  sizeWrap.appendChild(sizeInput);

  row.appendChild(presetWrap);
  row.appendChild(sizeWrap);

  const hint = document.createElement('div');
  hint.style.fontSize = '12px';
  hint.style.opacity = '0.75';
  hint.style.marginBottom = '10px';
  hint.textContent = 'Tip: you can type “4050x5100”, “3840×2160”, or add “px”.';

  let includeFormulaOverlayCheckbox = null;
  let includeFormulaOverlayRow = null;
  if (includeFormulaOverlayOption) {
    const row2 = document.createElement('div');
    row2.style.display = 'flex';
    row2.style.alignItems = 'center';
    row2.style.gap = '10px';
    row2.style.marginBottom = '10px';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.style.width = '18px';
    checkbox.style.height = '18px';
    checkbox.style.margin = '0';
    checkbox.style.accentColor = 'rgba(255,255,255,0.8)';
    checkbox.checked = Boolean(
      typeof includeFormulaOverlayOption === 'object' && includeFormulaOverlayOption?.defaultChecked,
    );

    const label = document.createElement('label');
    label.style.fontSize = '13px';
    label.style.opacity = '0.92';
    label.style.cursor = 'pointer';
    label.textContent =
      typeof includeFormulaOverlayOption === 'object' && includeFormulaOverlayOption?.label
        ? String(includeFormulaOverlayOption.label)
        : 'Overlay formula near bottom';

    // Clicking the label toggles the checkbox.
    label.addEventListener('click', (event) => {
      event.preventDefault();
      checkbox.checked = !checkbox.checked;
    });

    row2.appendChild(checkbox);
    row2.appendChild(label);
    includeFormulaOverlayCheckbox = checkbox;
    includeFormulaOverlayRow = row2;
  }

  const error = document.createElement('div');
  error.style.fontSize = '12px';
  error.style.color = '#ffb4b4';
  error.style.minHeight = '1.2em';
  error.style.marginBottom = '10px';

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.justifyContent = 'flex-end';
  actions.style.gap = '8px';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.value = 'cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.height = '36px';
  cancelBtn.style.borderRadius = '8px';
  cancelBtn.style.border = '1px solid rgba(255,255,255,0.25)';
  cancelBtn.style.background = 'transparent';
  cancelBtn.style.color = 'inherit';
  cancelBtn.style.padding = '0 12px';

  const okBtn = document.createElement('button');
  okBtn.type = 'submit';
  okBtn.value = 'ok';
  okBtn.textContent = 'Export';
  okBtn.style.height = '36px';
  okBtn.style.borderRadius = '8px';
  okBtn.style.border = '1px solid rgba(255,255,255,0.35)';
  okBtn.style.background = 'rgba(255,255,255,0.10)';
  okBtn.style.color = 'inherit';
  okBtn.style.padding = '0 12px';

  actions.appendChild(cancelBtn);
  actions.appendChild(okBtn);

  form.appendChild(row);
  if (includeFormulaOverlayRow) {
    form.appendChild(includeFormulaOverlayRow);
  }
  form.appendChild(hint);
  form.appendChild(error);
  form.appendChild(actions);

  dialog.appendChild(heading);
  dialog.appendChild(form);

  const initial = defaultSize || (presets[0] ? { width: presets[0].width, height: presets[0].height } : { width: 1920, height: 1080 });
  sizeInput.value = `${initial.width}x${initial.height}`;
  presetSelect.value = '__custom__';

  function syncFromPreset() {
    const selected = presetSelect.selectedOptions[0];
    if (!selected) return;
    const w = selected.dataset.width ? Number(selected.dataset.width) : null;
    const h = selected.dataset.height ? Number(selected.dataset.height) : null;
    if (w && h) {
      sizeInput.value = `${w}x${h}`;
    }
  }

  function validate() {
    const parsed = parseSizeText(sizeInput.value);
    if (!parsed) {
      error.textContent = 'Please enter a size like 4050x5100 (max 20000×20000).';
      return null;
    }
    error.textContent = '';
    return parsed;
  }

  presetSelect.addEventListener('change', () => {
    if (presetSelect.value !== '__custom__') {
      syncFromPreset();
    }
    validate();
  });
  sizeInput.addEventListener('input', () => {
    presetSelect.value = '__custom__';
    validate();
  });

  cancelBtn.addEventListener('click', () => {
    try {
      dialog.close('cancel');
    } catch (_) {
      // ignore
    }
  });

  document.body.appendChild(dialog);

  let result = null;
  try {
    dialog.showModal();
    sizeInput.focus();
    sizeInput.select();

    result = await new Promise((resolve) => {
      dialog.addEventListener(
        'close',
        () => {
          if (dialog.returnValue !== 'ok') {
            resolve(null);
            return;
          }
          const size = validate();
          if (!size) {
            resolve(null);
            return;
          }
          const includeFormulaOverlay = includeFormulaOverlayCheckbox ? Boolean(includeFormulaOverlayCheckbox.checked) : false;
          resolve({ ...size, includeFormulaOverlay });
        },
        { once: true },
      );

      // If user hits Enter with invalid input, keep dialog open.
      form.addEventListener('submit', (event) => {
        const parsed = validate();
        if (!parsed) {
          event.preventDefault();
          event.stopPropagation();
        }
      });
    });
  } catch (err) {
    console.warn('Export size dialog failed; falling back.', err);
    result = fallback();
  } finally {
    try {
      dialog.remove();
    } catch (_) {
      // ignore
    }
  }

  return result;
}

export async function canvasToPngBlob(canvas) {
  if (!canvas) {
    throw new Error('No canvas provided');
  }
  if (canvas.toBlob) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) return blob;
  }
  // Fallback: data URL -> blob
  const dataUrl = canvas.toDataURL('image/png');
  const res = await fetch(dataUrl);
  return await res.blob();
}

export function triggerDownloadFromUrl(url, filename, { revoke = false } = {}) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  if (revoke) {
    try {
      URL.revokeObjectURL(url);
    } catch (_) {
      // ignore
    }
  }
}

export function downloadBlob(blob, filename) {
  if (!blob) {
    throw new Error('No blob provided');
  }
  const objectUrl = URL.createObjectURL(blob);
  triggerDownloadFromUrl(objectUrl, filename, { revoke: true });
}

export async function renderOffscreenCanvasToPngBlob({ width, height, render }) {
  if (typeof document === 'undefined') {
    throw new Error('Offscreen render requires a DOM');
  }
  const w = clampInt(width);
  const h = clampInt(height);
  if (!w || !h) {
    throw new Error(`Invalid export size: ${width}x${height}`);
  }
  if (typeof render !== 'function') {
    throw new Error('renderOffscreenCanvasToPngBlob requires a render(canvas) function');
  }

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = w;
  exportCanvas.height = h;

  // Keep it out of view; still in DOM in case callers rely on layout.
  exportCanvas.style.position = 'fixed';
  exportCanvas.style.left = '-10000px';
  exportCanvas.style.top = '-10000px';
  exportCanvas.style.width = `${w}px`;
  exportCanvas.style.height = `${h}px`;
  exportCanvas.style.pointerEvents = 'none';

  document.body.appendChild(exportCanvas);

  try {
    await render(exportCanvas);
    return await canvasToPngBlob(exportCanvas);
  } finally {
    try {
      exportCanvas.remove();
    } catch (_) {
      // ignore
    }
  }
}

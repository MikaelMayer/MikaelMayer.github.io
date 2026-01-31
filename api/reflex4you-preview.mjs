import { gunzipSync, gzipSync } from 'node:zlib';
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium as playwrightChromium } from 'playwright-core';
import chromium from '@sparticuz/chromium';
import { parseFormulaInput } from '../apps/reflex4you/arithmetic-parser.mjs';
import { formatCaretIndicator, getCaretSelection } from '../apps/reflex4you/parse-error-format.mjs';
import { compileFormulaForGpu, FINGER_DECIMAL_PLACES } from '../apps/reflex4you/core-engine.mjs';

const DEFAULT_CANVAS_RATIO = 0.5;
const DEFAULT_CANVAS_PIXELS = 1080;
const DEFAULT_WINDOW = Object.freeze({
  xMin: -2,
  xMax: 2,
  yMin: -4,
  yMax: 4,
});
const MAX_CANVAS_PIXELS = 20000;
const DECIMAL_PLACES = Number.isFinite(FINGER_DECIMAL_PLACES) ? FINGER_DECIMAL_PLACES : 4;
const FINGER_LABEL_REGEX = /^(?:[FD]\d+|W[012])$/;
const ROTATION_LABEL_REGEX = /^(?:RA|RB)$/;
const ALLOWED_LABEL_REGEX = /^(?:[FD]\d+|W[012]|RA|RB)$/;

let browserPromise = null;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function jsonResponse(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (!chunks.length) {
    return {};
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}

function parseBooleanInput(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

function readQueryBody(req) {
  const url = new URL(req.url || '', 'http://localhost');
  const params = url.searchParams;
  const body = {};
  if (params.has('source')) body.source = params.get('source');
  if (params.has('formula')) body.formula = params.get('formula');
  if (params.has('formulab64')) body.formulab64 = params.get('formulab64');
  if (params.has('values')) {
    const raw = params.get('values');
    if (raw) {
      body.values = raw;
      body.__valuesFromQuery = true;
    }
  }
  if (params.has('ratio')) body.ratio = params.get('ratio');
  if (params.has('pixels')) body.pixels = params.get('pixels');
  if (params.has('width')) body.width = params.get('width');
  if (params.has('height')) body.height = params.get('height');
  if (params.has('window')) body.window = params.get('window');
  if (params.has('xMin')) body.xMin = params.get('xMin');
  if (params.has('xMax')) body.xMax = params.get('xMax');
  if (params.has('yMin')) body.yMin = params.get('yMin');
  if (params.has('yMax')) body.yMax = params.get('yMax');
  if (params.has('waitMs')) body.waitMs = params.get('waitMs');
  if (params.has('format')) body.format = params.get('format');
  if (params.has('compile')) body.compile = parseBooleanInput(params.get('compile'), null);
  if (params.has('compress')) body.compress = parseBooleanInput(params.get('compress'), null);
  return body;
}

function parseRatioInput(value) {
  if (value == null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.includes(':') || raw.includes('x') || raw.includes('×')) {
    const parts = raw.split(/[:x×]/i).map((part) => Number(part.trim()));
    if (parts.length === 2 && parts.every((n) => Number.isFinite(n) && n > 0)) {
      return parts[0] / parts[1];
    }
  }
  if (raw.includes('/')) {
    const parts = raw.split('/').map((part) => Number(part.trim()));
    if (parts.length === 2 && parts.every((n) => Number.isFinite(n) && n > 0)) {
      return parts[0] / parts[1];
    }
  }
  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function parseWindowInput(input) {
  if (input == null) return null;
  if (typeof input === 'object') {
    const xMin = Number(input.xMin ?? input.xmin);
    const xMax = Number(input.xMax ?? input.xmax);
    const yMin = Number(input.yMin ?? input.ymin);
    const yMax = Number(input.yMax ?? input.ymax);
    if ([xMin, xMax, yMin, yMax].every((n) => Number.isFinite(n))) {
      return { xMin, xMax, yMin, yMax };
    }
  }
  const raw = String(input).trim();
  if (!raw) return null;
  const parts = raw.split(/[,\s]+/).map((part) => Number(part.trim())).filter((n) => Number.isFinite(n));
  if (parts.length === 4) {
    return { xMin: parts[0], xMax: parts[1], yMin: parts[2], yMax: parts[3] };
  }
  return null;
}

function clampInt(value, { min = 1, max = MAX_CANVAS_PIXELS } = {}) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

function resolveDimensions(body, errors) {
  const width = clampInt(body?.width);
  const height = clampInt(body?.height);
  if (width && height) {
    return { width, height, ratio: width / height };
  }
  const ratio = parseRatioInput(body?.ratio) ?? DEFAULT_CANVAS_RATIO;
  const pixels = clampInt(body?.pixels ?? body?.pixelSize ?? body?.size ?? DEFAULT_CANVAS_PIXELS);
  if (!ratio || !pixels) {
    errors.push('Invalid ratio/pixels parameters.');
    return null;
  }
  const effectiveRatio = ratio;
  let w;
  let h;
  if (effectiveRatio >= 1) {
    w = pixels;
    h = clampInt(pixels / effectiveRatio);
  } else {
    h = pixels;
    w = clampInt(pixels * effectiveRatio);
  }
  if (!w || !h) {
    errors.push('Invalid computed canvas dimensions.');
    return null;
  }
  return { width: w, height: h, ratio: effectiveRatio };
}

function resolveWindow(body, warnings, errors) {
  const fromWindow = parseWindowInput(body?.window);
  const fromFields =
    body?.xMin != null || body?.xMax != null || body?.yMin != null || body?.yMax != null
      ? {
        xMin: Number(body?.xMin),
        xMax: Number(body?.xMax),
        yMin: Number(body?.yMin),
        yMax: Number(body?.yMax),
      }
      : null;
  const candidate = fromWindow || fromFields || DEFAULT_WINDOW;
  const xMin = Number(candidate.xMin);
  const xMax = Number(candidate.xMax);
  const yMin = Number(candidate.yMin);
  const yMax = Number(candidate.yMax);
  if (![xMin, xMax, yMin, yMax].every((n) => Number.isFinite(n))) {
    errors.push('Invalid window bounds.');
    return null;
  }
  if (xMin >= xMax || yMin >= yMax) {
    errors.push('window bounds must satisfy xMin < xMax and yMin < yMax.');
    return null;
  }
  const xCenter = (xMin + xMax) / 2;
  const yCenter = (yMin + yMax) / 2;
  let adjXMin = xMin;
  let adjXMax = xMax;
  let adjYMin = yMin;
  let adjYMax = yMax;
  if (Math.abs(xCenter) > 1e-9 || Math.abs(yCenter) > 1e-9) {
    warnings.push('window is recentred around 0; Reflex4You view is origin-centered.');
    adjXMin = xMin - xCenter;
    adjXMax = xMax - xCenter;
    adjYMin = yMin - yCenter;
    adjYMax = yMax - yCenter;
  }
  return { xMin: adjXMin, xMax: adjXMax, yMin: adjYMin, yMax: adjYMax };
}

function computeViewSettings(windowBounds, ratio) {
  const halfSpanX = (windowBounds.xMax - windowBounds.xMin) / 2;
  const halfSpanY = (windowBounds.yMax - windowBounds.yMin) / 2;
  const baseHalfSpan =
    ratio >= 1
      ? Math.max(halfSpanX, halfSpanY * ratio)
      : Math.max(halfSpanY, halfSpanX / ratio);
  const viewXSpan = ratio >= 1 ? 2 * baseHalfSpan : 2 * baseHalfSpan * ratio;
  const viewYSpan = ratio >= 1 ? 2 * baseHalfSpan / ratio : 2 * baseHalfSpan;
  return {
    baseHalfSpan,
    viewXMin: -viewXSpan / 2,
    viewXMax: viewXSpan / 2,
    viewYMin: -viewYSpan / 2,
    viewYMax: viewYSpan / 2,
  };
}

function isFingerLabel(label) {
  return FINGER_LABEL_REGEX.test(label);
}

function isRotationLabel(label) {
  return ROTATION_LABEL_REGEX.test(label);
}

function parseComplexString(raw) {
  if (raw == null) return null;
  const normalized = String(raw).trim().replace(/\s+/g, '');
  if (!normalized) return null;

  if (normalized.includes(',')) {
    const parts = normalized.split(',');
    if (parts.length !== 2) return null;
    const re = Number(parts[0]);
    const im = Number(parts[1]);
    if (!Number.isFinite(re) || !Number.isFinite(im)) return null;
    return { re, im };
  }

  if (normalized.endsWith('i')) {
    const core = normalized.slice(0, -1);
    if (core === '' || core === '+') return { re: 0, im: 1 };
    if (core === '-') return { re: 0, im: -1 };
    const splitIdx = findRealImagSplit(core);
    if (splitIdx > 0) {
      const realPart = core.slice(0, splitIdx);
      const imagPart = core.slice(splitIdx);
      const re = Number(realPart);
      const im = Number(imagPart);
      if (!Number.isFinite(re) || !Number.isFinite(im)) return null;
      return { re, im };
    }
    const im = Number(core);
    if (!Number.isFinite(im)) return null;
    return { re: 0, im };
  }

  const re = Number(normalized);
  if (!Number.isFinite(re)) return null;
  return { re, im: 0 };
}

function findRealImagSplit(core) {
  for (let i = core.length - 1; i > 0; i -= 1) {
    const ch = core[i];
    if (ch !== '+' && ch !== '-') continue;
    const prev = core[i - 1];
    if (prev === 'e' || prev === 'E') continue;
    return i;
  }
  return -1;
}

function parseComplexInput(value) {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    return parseComplexString(value);
  }
  if (Array.isArray(value)) {
    if (value.length < 2) return null;
    const re = Number(value[0]);
    const im = Number(value[1]);
    if (!Number.isFinite(re) || !Number.isFinite(im)) return null;
    return { re, im };
  }
  if (typeof value === 'object') {
    const re = Number(value.re ?? value.x);
    const im = Number(value.im ?? value.y);
    if (!Number.isFinite(re) || !Number.isFinite(im)) return null;
    return { re, im };
  }
  return null;
}

function roundToPlaces(value) {
  if (!Number.isFinite(value)) return NaN;
  const factor = 10 ** DECIMAL_PLACES;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatNumberForQuery(value) {
  const rounded = roundToPlaces(value);
  if (!Number.isFinite(rounded)) return null;
  return rounded.toFixed(DECIMAL_PLACES).replace(/\.?0+$/, '');
}

function formatComplexForQuery(re, im) {
  const real = formatNumberForQuery(re);
  const imag = formatNumberForQuery(Math.abs(im));
  if (real == null || imag == null) return null;
  const sign = im >= 0 ? '+' : '-';
  return `${real}${sign}${imag}i`;
}

function normalizeValueMap(input, errors) {
  const parseFingerValues = {};
  const queryValues = new Map();
  if (!input || typeof input !== 'object') {
    return { parseFingerValues, queryValues };
  }
  for (const rawLabel of Object.keys(input)) {
    const label = String(rawLabel || '').trim();
    if (!ALLOWED_LABEL_REGEX.test(label)) {
      errors.push(`Invalid label "${label}". Allowed: F#, D#, W0/W1/W2, RA, RB.`);
      continue;
    }
    const parsed = parseComplexInput(input[rawLabel]);
    if (!parsed) {
      errors.push(`Invalid complex value for "${label}".`);
      continue;
    }
    const formatted = formatComplexForQuery(parsed.re, parsed.im);
    if (!formatted) {
      errors.push(`Unable to format complex value for "${label}".`);
      continue;
    }
    queryValues.set(label, formatted);
    if (isFingerLabel(label) || isRotationLabel(label)) {
      parseFingerValues[label] = { re: parsed.re, im: parsed.im };
    }
  }
  return { parseFingerValues, queryValues };
}

function decodeBase64Url(encoded) {
  const normalized = String(encoded || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, 'base64');
}

function decodeFormulaFromBase64Url(encoded) {
  const buffer = decodeBase64Url(encoded);
  return gunzipSync(buffer).toString('utf8');
}

function encodeFormulaToBase64Url(formula) {
  const gz = gzipSync(Buffer.from(String(formula), 'utf8'));
  return Buffer.from(gz)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function resolveFormulaSource(body, errors) {
  const raw = body?.source ?? body?.formula ?? null;
  if (raw != null && String(raw).trim()) {
    return String(raw);
  }
  const encoded = body?.formulab64 ?? null;
  if (encoded != null && String(encoded).trim()) {
    try {
      return decodeFormulaFromBase64Url(encoded);
    } catch (error) {
      errors.push('Invalid formulab64 value.');
      return null;
    }
  }
  return null;
}

function buildQueryParams({ source, queryValues, compress }) {
  const params = new URLSearchParams();
  if (compress) {
    const encoded = encodeFormulaToBase64Url(source);
    params.set('formulab64', encoded);
  } else {
    params.set('formula', source);
  }
  for (const [label, value] of queryValues.entries()) {
    params.set(label, value);
  }
  return params;
}

function resolveRepoRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..');
}

function contentTypeForPath(filePath) {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.mjs':
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.ico':
      return 'image/x-icon';
    default:
      return 'application/octet-stream';
  }
}

async function startStaticServer(rootDir) {
  return await new Promise((resolvePromise, rejectPromise) => {
    const server = createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://localhost');
        let pathname = decodeURIComponent(url.pathname);
        if (pathname === '/') {
          pathname = '/apps/reflex4you/index.html';
        }
        const safePath = resolve(rootDir, `.${pathname}`);
        if (!safePath.startsWith(rootDir)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }
        let stat;
        try {
          stat = statSync(safePath);
        } catch (_) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        if (stat.isDirectory()) {
          const indexPath = join(safePath, 'index.html');
          try {
            stat = statSync(indexPath);
          } catch (_) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', contentTypeForPath(indexPath));
          createReadStream(indexPath).pipe(res);
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', contentTypeForPath(safePath));
        createReadStream(safePath).pipe(res);
      } catch (error) {
        res.statusCode = 500;
        res.end('Server error');
      }
    });
    server.on('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => resolvePromise(server));
  });
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const executablePath = await chromium.executablePath();
      const launchArgs = [
        ...chromium.args,
        '--ignore-gpu-blocklist',
        '--use-gl=swiftshader',
        '--enable-webgl',
      ];
      return await playwrightChromium.launch({
        args: launchArgs,
        executablePath: executablePath || undefined,
        headless: chromium.headless,
      });
    })();
  }
  try {
    return await browserPromise;
  } catch (error) {
    browserPromise = null;
    throw error;
  }
}

async function renderPreview({ url, width, height, baseHalfSpan, waitMs }) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__reflexReady));
    const actualView = await page.evaluate(async (settings) => {
      await window.__reflexReady;
      const core = window.__reflexCore;
      if (!core) {
        throw new Error('Reflex core not available');
      }
      if (Number.isFinite(settings.baseHalfSpan)) {
        core.baseHalfSpan = settings.baseHalfSpan;
      }
      core.renderToPixelSize(settings.width, settings.height);
      if (core.gl && typeof core.gl.finish === 'function') {
        core.gl.finish();
      }
      return {
        viewXMin: core.viewXMin,
        viewXMax: core.viewXMax,
        viewYMin: core.viewYMin,
        viewYMax: core.viewYMax,
      };
    }, { width, height, baseHalfSpan });
    if (waitMs > 0) {
      await page.waitForTimeout(waitMs);
    }
    const canvas = await page.$('#glcanvas');
    if (!canvas) {
      throw new Error('Canvas not found');
    }
    const buffer = await canvas.screenshot({ type: 'png' });
    return { buffer, actualView };
  } finally {
    await page.close();
    await context.close();
  }
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    jsonResponse(res, 405, { ok: false, error: 'GET or POST only' });
    return;
  }

  let body = {};
  if (req.method === 'GET') {
    body = readQueryBody(req);
  } else {
    try {
      body = await readJsonBody(req);
    } catch (error) {
      jsonResponse(res, 400, { ok: false, error: 'Invalid JSON body' });
      return;
    }
  }

  if (body?.__valuesFromQuery && typeof body.values === 'string') {
    try {
      body.values = JSON.parse(body.values);
    } catch (error) {
      jsonResponse(res, 400, { ok: false, error: 'Invalid values JSON in query.' });
      return;
    }
  }

  const errors = [];
  const warnings = [];
  const source = resolveFormulaSource(body, errors);
  if (!source || !source.trim()) {
    jsonResponse(res, 400, { ok: false, error: 'source is required', details: errors.length ? errors : null });
    return;
  }

  const valuesInput = body?.values ?? body?.fingerValues ?? null;
  const { parseFingerValues, queryValues } = normalizeValueMap(valuesInput, errors);

  const dimensions = resolveDimensions(body, errors);
  const windowBounds = resolveWindow(body, warnings, errors);

  if (errors.length) {
    jsonResponse(res, 400, { ok: false, error: 'Invalid request', details: errors });
    return;
  }

  const viewSettings = computeViewSettings(windowBounds, dimensions.ratio);
  const compile = Boolean(body?.compile);
  const compress = Boolean(body?.compress);
  const waitMs = clampInt(body?.waitMs, { min: 0, max: 10000 }) ?? 100;

  const parseResult = parseFormulaInput(source, { fingerValues: parseFingerValues });
  if (!parseResult.ok) {
    jsonResponse(res, 200, {
      ok: false,
      caretMessage: formatCaretIndicator(source, parseResult),
      caretSelection: getCaretSelection(source, parseResult),
    });
    return;
  }

  if (compile) {
    try {
      compileFormulaForGpu(parseResult.value);
    } catch (error) {
      const message = error?.message ? String(error.message) : String(error || 'Compilation error');
      jsonResponse(res, 200, {
        ok: false,
        caretMessage: `Compilation error:\n${message}`,
        caretSelection: null,
      });
      return;
    }
  }

  const queryParams = buildQueryParams({ source, queryValues, compress });
  const rootDir = resolveRepoRoot();
  const server = await startStaticServer(rootDir);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  if (!port) {
    server.close();
    jsonResponse(res, 500, { ok: false, error: 'Failed to allocate preview server port' });
    return;
  }
  const previewUrl = `http://127.0.0.1:${port}/apps/reflex4you/index.html?${queryParams.toString()}`;

  try {
    const { buffer, actualView } = await renderPreview({
      url: previewUrl,
      width: dimensions.width,
      height: dimensions.height,
      baseHalfSpan: viewSettings.baseHalfSpan,
      waitMs,
    });
    const wantsJson = String(body?.format || '').toLowerCase() === 'json';
    if (wantsJson) {
      jsonResponse(res, 200, {
        ok: true,
        width: dimensions.width,
        height: dimensions.height,
        ratio: dimensions.ratio,
        window: windowBounds,
        view: actualView,
        warnings: warnings.length ? warnings : null,
        image: buffer.toString('base64'),
        imageType: 'image/png',
      });
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  } catch (error) {
    const message = error?.message ? String(error.message) : String(error || 'Preview render error');
    jsonResponse(res, 500, { ok: false, error: message });
  } finally {
    server.close();
  }
}

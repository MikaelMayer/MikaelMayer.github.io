const FORMULA_PARAM = 'formula';
const FORMULA_B64_PARAM = 'formulab64';
const LAST_STATE_SEARCH_KEY = 'reflex4you:lastSearch';

const sharedTextEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const sharedTextDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

function persistSearchToLocalStorage(search, env = {}) {
  const storage =
    env.localStorage ??
    (typeof window !== 'undefined' ? window.localStorage : null);
  if (!storage) {
    return;
  }
  try {
    storage.setItem(LAST_STATE_SEARCH_KEY, String(search || ''));
  } catch (_) {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

function getWindowSecureContextFlag() {
  if (typeof window === 'undefined') {
    return false;
  }
  return Boolean(window.isSecureContext);
}

function detectStreamSupport() {
  const secure = getWindowSecureContextFlag();
  return (
    secure &&
    typeof CompressionStream === 'function' &&
    typeof DecompressionStream === 'function'
  );
}

let supportsCompressionStream = detectStreamSupport();
let supportsDecompressionStream = detectStreamSupport();

function disableCompressionStreams() {
  supportsCompressionStream = false;
  supportsDecompressionStream = false;
  syncCompressionFlagToWindow();
}

export function getCompressionEnabled() {
  return supportsCompressionStream && supportsDecompressionStream;
}

export function syncCompressionFlagToWindow(win = typeof window !== 'undefined' ? window : null) {
  if (!win) {
    return;
  }
  win.__reflexCompressionEnabled = getCompressionEnabled();
}

function encodeUtf8(value) {
  if (sharedTextEncoder) {
    return sharedTextEncoder.encode(value);
  }
  const percentEncoded = encodeURIComponent(value);
  const bytes = [];
  for (let i = 0; i < percentEncoded.length; ) {
    const ch = percentEncoded[i];
    if (ch === '%') {
      const hex = percentEncoded.slice(i + 1, i + 3);
      bytes.push(parseInt(hex, 16));
      i += 3;
    } else {
      bytes.push(ch.charCodeAt(0));
      i += 1;
    }
  }
  return Uint8Array.from(bytes);
}

function decodeUtf8(bytes) {
  if (sharedTextDecoder) {
    return sharedTextDecoder.decode(bytes);
  }
  let percentEncoded = '';
  for (let i = 0; i < bytes.length; i++) {
    percentEncoded += `%${bytes[i].toString(16).padStart(2, '0')}`;
  }
  try {
    return decodeURIComponent(percentEncoded);
  } catch (_) {
    return percentEncoded;
  }
}

function base64UrlEncodeBytes(bytes) {
  if (typeof btoa !== 'function') {
    throw new Error('base64 encoding unavailable (btoa missing)');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecodeToBytes(encoded) {
  if (typeof atob !== 'function') {
    throw new Error('base64 decoding unavailable (atob missing)');
  }
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const paddingNeeded = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(paddingNeeded);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function normalizeDecodeErrorReason(error) {
  if (!error) {
    return '';
  }
  const raw =
    typeof error === 'string'
      ? error
      : typeof error?.message === 'string'
        ? error.message
        : String(error);
  const compact = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!compact || compact === '[object Object]' || compact === 'Error') {
    return '';
  }
  if (compact.length > 120) {
    return `${compact.slice(0, 117)}...`;
  }
  return compact;
}

function formatFormulab64DecodeErrorMessage(error, fallbackDescription) {
  const fallback = String(fallbackDescription || 'the default formula');
  const reason = normalizeDecodeErrorReason(error);
  if (reason) {
    return `Could not decode formulab64 query parameter (${reason}). Loaded ${fallback}.`;
  }
  return `Could not decode formulab64 query parameter. Loaded ${fallback}.`;
}

function notifyFormulab64DecodeError(options, error, fallbackDescription) {
  if (!error || typeof options?.onDecodeError !== 'function') {
    return;
  }
  const message = formatFormulab64DecodeErrorMessage(error, fallbackDescription);
  try {
    options.onDecodeError(error, message);
  } catch (_) {
    // ignore errors in callback
  }
}

async function transformWithStream(bytes, StreamConstructor) {
  if (typeof Blob === 'undefined' || typeof ReadableStream === 'undefined') {
    throw new Error('Streaming compression not supported');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new StreamConstructor('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function compressBytes(bytes) {
  if (!supportsCompressionStream) {
    throw new Error('CompressionStream API not supported');
  }
  return transformWithStream(bytes, CompressionStream);
}

async function decompressBytes(bytes) {
  if (!supportsDecompressionStream) {
    throw new Error('DecompressionStream API not supported');
  }
  return transformWithStream(bytes, DecompressionStream);
}

async function encodeFormulaToCompressedParam(source) {
  const utf8 = encodeUtf8(source);
  if (!supportsCompressionStream) {
    return null;
  }
  try {
    const compressed = await compressBytes(utf8);
    return base64UrlEncodeBytes(compressed);
  } catch (error) {
    console.warn(
      'CompressionStream failed; falling back to legacy formula parameter.',
      error,
    );
    disableCompressionStreams();
    return null;
  }
}

async function decodeFormulaFromCompressedParam(encoded) {
  if (!supportsDecompressionStream) {
    return { ok: false, error: new Error('CompressionStream API unavailable') };
  }
  try {
    const compressed = base64UrlDecodeToBytes(encoded);
    const decompressed = await decompressBytes(compressed);
    const decoded = decodeUtf8(decompressed);
    return { ok: true, value: decoded };
  } catch (error) {
    disableCompressionStreams();
    return { ok: false, error };
  }
}

export async function verifyCompressionSupport() {
  if (!supportsCompressionStream) {
    syncCompressionFlagToWindow();
    return;
  }
  try {
    await compressBytes(encodeUtf8('probe'));
  } catch (error) {
    console.warn(
      'CompressionStream is unavailable in this context; falling back to legacy query parameters.',
      error,
    );
    disableCompressionStreams();
  }
  syncCompressionFlagToWindow();
}

export async function writeFormulaToSearchParams(params, source) {
  params.delete(FORMULA_PARAM);
  params.delete(FORMULA_B64_PARAM);
  if (!source || !source.trim()) {
    return;
  }
  try {
    const encoded = await encodeFormulaToCompressedParam(source);
    if (encoded) {
      params.set(FORMULA_B64_PARAM, encoded);
    } else {
      params.set(FORMULA_PARAM, source);
    }
  } catch (error) {
    console.warn(
      'Failed to encode formula into formulab64 parameter. Falling back to raw text.',
      error,
    );
    params.set(FORMULA_PARAM, source);
  }
}

export function replaceUrlSearch(params, env = {}) {
  const location = env.location ?? (typeof window !== 'undefined' ? window.location : null);
  const history = env.history ?? (typeof window !== 'undefined' ? window.history : null);
  if (!location || !history) {
    return;
  }
  const newQuery = params.toString();
  const newUrl = `${location.pathname}${newQuery ? `?${newQuery}` : ''}`;
  history.replaceState({}, '', newUrl);
  persistSearchToLocalStorage(newQuery ? `?${newQuery}` : '', env);
}

async function upgradeLegacyFormulaParam(source, env = {}) {
  const location = env.location ?? (typeof window !== 'undefined' ? window.location : null);
  if (!location) {
    return;
  }
  const params = new URLSearchParams(location.search);
  await writeFormulaToSearchParams(params, source);
  replaceUrlSearch(params, env);
}

export async function readFormulaFromQuery(options = {}) {
  const location = options.location ?? (typeof window !== 'undefined' ? window.location : null);
  if (!location) {
    return null;
  }
  const params = new URLSearchParams(location.search);
  const encoded = params.get(FORMULA_B64_PARAM);
  let formulab64DecodeError = null;
  if (encoded) {
    const decoded = await decodeFormulaFromCompressedParam(encoded);
    if (decoded.ok) {
      return decoded.value;
    }
    formulab64DecodeError = decoded.error;
    console.warn(
      'Failed to decode formulab64 parameter, falling back to default formula.',
      decoded.error,
    );
    params.delete(FORMULA_B64_PARAM);
    replaceUrlSearch(params, options);
  }
  const raw = params.get(FORMULA_PARAM);
  const hasLegacyFormulaFallback = typeof raw === 'string' && raw.trim().length > 0;
  if (!raw) {
    notifyFormulab64DecodeError(options, formulab64DecodeError, 'the default formula');
    return null;
  }
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch (_) {
    // Already decoded.
  }
  notifyFormulab64DecodeError(
    options,
    formulab64DecodeError,
    hasLegacyFormulaFallback ? 'the legacy formula parameter' : 'the default formula',
  );
  if (options.upgradeLegacy !== false) {
    await upgradeLegacyFormulaParam(decoded, options);
  }
  return decoded;
}

export async function updateFormulaQueryParam(source, options = {}) {
  const location = options.location ?? (typeof window !== 'undefined' ? window.location : null);
  if (!location) {
    return;
  }
  const params = new URLSearchParams(location.search);
  await writeFormulaToSearchParams(params, source);
  replaceUrlSearch(params, options);
}

export function updateFormulaQueryParamImmediately(source, options = {}) {
  const location = options.location ?? (typeof window !== 'undefined' ? window.location : null);
  if (!location) {
    return;
  }
  const params = new URLSearchParams(location.search);
  params.delete(FORMULA_B64_PARAM);
  if (!source || !source.trim()) {
    params.delete(FORMULA_PARAM);
  } else {
    params.set(FORMULA_PARAM, source);
  }
  replaceUrlSearch(params, options);
}

export { FORMULA_PARAM, FORMULA_B64_PARAM, LAST_STATE_SEARCH_KEY };

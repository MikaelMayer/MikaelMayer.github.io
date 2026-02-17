/**
 * Prune finger-related URLSearchParams so they only refer to active fingers.
 *
 * Reflex4You encodes:
 * - per-finger value:   D1=1+2i
 * - per-finger animation interval: D1A=1+2i..3+4i
 * - shared animation time: t=5s
 *
 * When a formula changes, active finger labels can change. Any params for
 * inactive fingers must be removed; otherwise stale values and animation
 * intervals can "come back" later and unexpectedly animate.
 */

export function pruneFingerUrlParams(
  params,
  {
    knownLabels = [],
    activeLabels = [],
    animationSuffix = 'A',
    animationTimeParam = 't',
  } = {},
) {
  if (!params || typeof params.delete !== 'function' || typeof params.has !== 'function') {
    throw new TypeError('Expected a URLSearchParams instance');
  }

  const activeSet = new Set((activeLabels || []).filter(Boolean));
  const labels = Array.from(new Set((knownLabels || []).filter(Boolean)));

  for (const label of labels) {
    if (activeSet.has(label)) continue;
    params.delete(label);
    params.delete(`${label}${animationSuffix}`);
  }

  // If no active finger has an animation interval, drop the shared timing param.
  // This prevents stale `t=` from unexpectedly applying if animations are added back later.
  let hasAnyActiveAnimation = false;
  for (const label of activeSet) {
    const key = `${label}${animationSuffix}`;
    if (params.has(key)) {
      const value = params.get(key);
      if (value != null && String(value).trim() !== '') {
        hasAnyActiveAnimation = true;
        break;
      }
    }
  }
  if (!hasAnyActiveAnimation) {
    params.delete(animationTimeParam);
  }

  return params;
}


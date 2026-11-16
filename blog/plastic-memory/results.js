/* Numbers from code/study.js. Regenerate with `node study.js` and paste.
 * 5 seeds, 1500 meta-training steps each, 1803s wall clock.
 * Evaluated on streams 3x longer than training, on keys never seen.
 */
window.PT_RESULTS = {
  provenance: '5 seeds, 1500 steps, 30 minutes on a laptop',
  delayBins: [0, 10, 20, 30, 50, 80, 120, 200, 300],
  rows: [
    { name: 'no forgetting',      overall: .382, acc: [.35,.31,.26,.24,.20,.18,.16,.17,.16] },
    { name: 'one rate, tau=5',    overall: .472, acc: [.96,.49,.16,.13,.12,.13,.13,.11,.10] },
    { name: 'one rate, tau=20',   overall: .493, acc: [.76,.58,.37,.25,.16,.13,.12,.12,.11], highlight: true },
    { name: 'one rate, tau=60',   overall: .430, acc: [.48,.42,.33,.28,.22,.17,.15,.13,.14] },
    { name: 'one rate, tau=200',  overall: .398, acc: [.38,.34,.28,.26,.21,.17,.15,.17,.14] },
    { name: 'three rates',        overall: .445, acc: [.77,.36,.25,.20,.16,.16,.14,.14,.13] },
    { name: '48 log-spaced',      overall: .470, acc: [.81,.45,.26,.20,.15,.14,.15,.11,.12] },
    { name: '48, shuffled order', overall: .467, acc: [.81,.45,.26,.20,.16,.14,.13,.13,.11] },
    { name: '48, learned',        overall: .508, acc: [.92,.62,.28,.16,.13,.13,.12,.12,.12], highlight: true }
  ],
  /* standard deviation of overall accuracy across the 5 seeds, in points */
  sd: { 'no forgetting': 0.7, 'one rate, tau=5': 0.5, 'one rate, tau=20': 0.4,
        'one rate, tau=60': 0.2, 'one rate, tau=200': 0.8, 'three rates': 0.3,
        '48 log-spaced': 0.5, '48, shuffled order': 0.5, '48, learned': 0.6 }
};

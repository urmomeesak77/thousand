'use strict';

// Per-bot imperfect, decaying memory of cards already played (feature 010).
// Recall is a pure function of the round's play log and the bot's traits, recomputed
// each decision — so memory is inherently per-round (FR-002) and reproducible (FR-008).
//
// Recall strength by card age is the impulse response of a first-order low-pass filter
// specified in the frequency domain (the user-mandated Fourier model, FR-004):
//
//   H(ω) = 1 / (1 + (ω / ω_c)²)        ω_c = cutoff, shrinks as memorySkill rises
//
// Its inverse Fourier transform is the decaying recall envelope kernel[age]
// (analytically ∝ e^(−ω_c·age) — the time-domain twin of the filter). We evaluate it
// with a short discrete inverse transform: a Riemann sum of H(ω)·cos(ω·age) over
// frequencies sampled in units of ω_c, so the Lorentzian is resolved identically at
// every cutoff. Higher memorySkill ⇒ lower cutoff ⇒ slower decay ⇒ longer memory
// (FR-011); at max skill ω_c = 0 and every cos term is 1, so the bot recalls everything.

const MAX_AGE = 7;                 // max card age in an 8-trick round (trick 8 − trick 1)
const OMEGA_AT_ZERO_SKILL = 0.6;   // cutoff ω_c at memorySkill 0 (fastest forgetting)
const FREQ_STEP = 0.25;            // frequency sample spacing, in units of ω_c
const FREQ_SAMPLES = 120;          // sample count; FREQ_STEP·FREQ_SAMPLES = 30 ≫ Lorentzian tail

// raw[0] of the transform (cos(0)=1 for every tap) — the normaliser giving kernel[0]=1.
const NORMALIZER = sumFrequencyResponse();

class BotMemory {
  constructor(memorySkill, memorySeed) {
    this.memorySkill = clamp01(memorySkill);
    this.memorySeed = memorySeed;
  }

  // Set of past-trick (age ≥ 1) cardIds the bot currently recalls as gone. Age-0 cards
  // are on the table and excluded here (C2). Pure: same args ⇒ same Set (C1); monotonic
  // because kernel decreases with age while each card's draw is fixed (C3).
  recalledGoneCardIds(playedLog, currentTrickNumber, roundKey) {
    const kernel = BotMemory.recallKernel(this.memorySkill, MAX_AGE);
    const recalled = new Set();
    for (const { cardId, trickNumber } of playedLog) {
      const age = currentTrickNumber - trickNumber;
      if (age < 1) { continue; }
      const strength = kernel[Math.min(age, MAX_AGE)];
      if (BotMemory.recallDraw(this.memorySeed, roundKey, cardId) < strength) {
        recalled.add(cardId);
      }
    }
    return recalled;
  }

  // kernel[age] ∈ [0,1]: the low-pass impulse response via a discrete inverse transform
  // of H(ω). kernel[0] = 1, clamped monotone non-increasing (the min-guard absorbs any
  // residual quadrature noise so C3/monotonicity holds exactly).
  static recallKernel(memorySkill, maxAge) {
    const cutoff = (1 - clamp01(memorySkill)) * OMEGA_AT_ZERO_SKILL;
    const kernel = [];
    let prev = Infinity;
    for (let age = 0; age <= maxAge; age++) {
      let raw = 0;
      for (let k = 0; k <= FREQ_SAMPLES; k++) {
        raw += tapWeight(k) * frequencyResponse(k) * Math.cos(k * FREQ_STEP * cutoff * age);
      }
      const value = Math.min(prev, clamp01(raw / NORMALIZER));
      kernel.push(value);
      prev = value;
    }
    return kernel;
  }

  // Deterministic per-card draw d ∈ [0,1): hash(seed, roundKey, cardId). Stable across
  // calls and well-spread across cards, so recall is reproducible per round (FR-008).
  static recallDraw(memorySeed, roundKey, cardId) {
    return hashTo01(toInt(memorySeed), toInt(roundKey), toInt(cardId));
  }
}

// ── module-private pure helpers ────────────────────────────────────────────────

// H(ω) at the k-th sample, with ω expressed in units of ω_c: 1 / (1 + (k·step)²).
// Independent of the cutoff, so the same taps serve every skill.
function frequencyResponse(k) {
  return 1 / (1 + (k * FREQ_STEP) ** 2);
}

// Trapezoidal-rule weight: the ω=0 endpoint tap counts half. This turns the one-sided
// cosine sum into half the two-sided sum, whose Poisson-summation value is exactly
// (π/Δ)·e^(−ω_c·age) — so the normalized kernel reproduces the analytic exponential
// envelope (aliases are O(e^−25), negligible) instead of decaying too slowly.
function tapWeight(k) {
  return k === 0 ? 0.5 : 1;
}

function sumFrequencyResponse() {
  let sum = 0;
  for (let k = 0; k <= FREQ_SAMPLES; k++) { sum += tapWeight(k) * frequencyResponse(k); }
  return sum;
}

function clamp01(x) {
  if (!Number.isFinite(x)) { return 0; }
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// 32-bit integer view of a seed/key/cardId (strings folded by char code).
function toInt(value) {
  if (typeof value === 'number') { return value >>> 0; }
  const s = String(value);
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; }
  return h >>> 0;
}

// Mix integers into a uniform draw in [0,1). MurmurHash3-style finalizer per input.
function hashTo01(...nums) {
  let h = 0x9e3779b1 | 0;
  for (const n of nums) {
    h ^= n | 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}

module.exports = BotMemory;

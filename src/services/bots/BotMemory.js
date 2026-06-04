'use strict';

// Per-bot imperfect, decaying memory of cards already played (feature 010).
// Recall is a pure function of the round's play log and the bot's traits, so it is
// recomputed each decision (per-round, stateless/reproducible — FR-002/FR-008).
// The Fourier low-pass recall model and the deterministic per-card draw land in T009
// as module-private pure helpers; this skeleton exists so dependents can import it.
class BotMemory {
  constructor(memorySkill, memorySeed) {
    this.memorySkill = memorySkill;
    this.memorySeed = memorySeed;
  }

  recalledGoneCardIds(_playedLog, _currentTrickNumber, _roundKey) {
    return new Set();
  }
}

module.exports = BotMemory;

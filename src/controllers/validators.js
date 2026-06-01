'use strict';

function validateNickname(nickname) {
  if (!nickname || typeof nickname !== 'string') {return false;}
  const trimmed = nickname.trim();
  if (trimmed.length < 3 || trimmed.length > 20) {return false;}
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed.charCodeAt(i);
    // control chars (C0: 0-31, DEL: 127, C1: 128-159)
    if (c <= 31 || (c >= 127 && c <= 159)) {return false;}
    // zero-width chars: U+200B-U+200D
    if (c >= 0x200b && c <= 0x200d) {return false;}
    // bidi marks: U+200E-U+200F (LRM/RLM)
    if (c === 0x200e || c === 0x200f) {return false;}
    // BOM / zero-width no-break space: U+FEFF
    if (c === 0xfeff) {return false;}
    // bidirectional overrides: U+202A-U+202E
    if (c >= 0x202a && c <= 0x202e) {return false;}
    // bidi isolates: U+2066-U+2069
    if (c >= 0x2066 && c <= 0x2069) {return false;}
    // line/paragraph separators: U+2028-U+2029
    if (c === 0x2028 || c === 0x2029) {return false;}
  }
  return true;
}

// The four-nines acknowledgment carries no payload beyond its type — every
// player-specific check (open gate, valid seat) is enforced server-side in the
// handler. This guards against a malformed/spoofed envelope reaching dispatch.
function validateAcknowledgeFourNines(msg) {
  return !!msg && typeof msg === 'object' && msg.type === 'acknowledge_four_nines';
}

// FR-003: crawl_commit carries a single card id; every turn/eligibility/phase
// check is enforced server-side. This guards the envelope shape at dispatch.
function validateCrawlCommit(msg) {
  return !!msg && typeof msg === 'object' && msg.type === 'crawl_commit' && Number.isInteger(msg.cardId);
}

function validateRequiredPlayers(v) {
  const n = Number(v);
  // The engine is generalized over playerCount (feature 008): 3 seats (24-card deck,
  // 3-card talon, 2 exchange passes) or 4 seats (32-card deck with 7s/8s, 4-card talon,
  // 3 exchange passes). Any other count is rejected (FR-002).
  if (n !== 3 && n !== 4) {return 'Player count must be 3 or 4';}
  return null;
}

module.exports = { validateNickname, validateRequiredPlayers, validateAcknowledgeFourNines, validateCrawlCommit };

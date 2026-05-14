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

function validateRequiredPlayers(v) {
  const n = Number(v);
  // Only 3-player rooms are supported today. The Round state machine is hardcoded
  // for 3 seats (modulo-3 turn rotation, `[0,1,2]` filters in submitPass) and would
  // hang in bidding with any other count. Spec 004 §"Scale/Scope" pins this to 3.
  if (n !== 3) {return 'Player count must be 3';}
  return null;
}

module.exports = { validateNickname, validateRequiredPlayers };

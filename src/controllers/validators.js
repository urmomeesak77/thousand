'use strict';

function validateNickname(nickname) {
  if (!nickname || typeof nickname !== 'string') return false;
  const trimmed = nickname.trim();
  if (trimmed.length < 3 || trimmed.length > 20) return false;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed.charCodeAt(i);
    // control chars (0-31, 127)
    if (c <= 31 || c === 127) return false;
    // zero-width chars: U+200B-U+200D
    if (c >= 0x200b && c <= 0x200d) return false;
    // BOM / zero-width no-break space: U+FEFF
    if (c === 0xfeff) return false;
    // bidirectional overrides: U+202A-U+202E
    if (c >= 0x202a && c <= 0x202e) return false;
    // line/paragraph separators: U+2028-U+2029
    if (c === 0x2028 || c === 0x2029) return false;
  }
  return true;
}

function validateMaxPlayers(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 2 || n > 4) return 'Max players must be 2, 3, or 4';
  return null;
}

module.exports = { validateNickname, validateMaxPlayers };

class HtmlUtil {
  static byId(id) {
    return document.getElementById(id);
  }

  static button(text, className) {
    const b = document.createElement('button');
    b.className = className;
    b.textContent = text;
    return b;
  }

  static escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // CSS attribute-selector escape with a regex fallback for environments
  // (older jsdom in tests) that don't expose CSS.escape.
  static escapeSelector(str) {
    const s = String(str);
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(s);
    }
    return s.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
  }

  // The optional t localizes the unit letters (feature 013); without it the
  // English fallback keeps callers that have no i18n (tests) working.
  static formatElapsed(seconds, t) {
    if (seconds < 60) {
      return t ? t('time.seconds', { count: seconds }) : `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return t
      ? t('time.minutesSeconds', { minutes, seconds: remainder })
      : `${minutes}m ${remainder}s`;
  }
}

export default HtmlUtil;

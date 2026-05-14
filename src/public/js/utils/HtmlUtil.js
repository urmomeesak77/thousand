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

  static formatElapsed(seconds) {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}m ${remainder}s`;
  }
}

export default HtmlUtil;

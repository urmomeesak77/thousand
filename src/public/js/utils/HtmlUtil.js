class HtmlUtil {
  static escape(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  static formatElapsed(secs) {
    if (secs < 60) {
      return `${secs}s`;
    }
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  }
}

export default HtmlUtil;

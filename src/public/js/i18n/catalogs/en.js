// English translation catalog — the source of truth: every message key the UI
// uses is defined here, and en values double as the universal fallback when a
// key is missing from another language's catalog (FR-009).
//
// Shape (contracts/i18n-api.md): flat object, dot-namespaced keys; values are
// strings with optional {param} tokens, or plural objects keyed by CLDR
// category ({ one, other } for English) selected by params.count.

const en = {
  'lang.selfName': 'English',
  'lang.toggleTitle': 'Switch language to {name}',
  'lang.toggleAriaLabel': 'Switch language to {name}',
};

export default en;

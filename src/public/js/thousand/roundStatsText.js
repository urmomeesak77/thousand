// Single source of truth for the per-seat round-stats label, rendered both
// under each opponent and above the viewer's own hand. Plural-object keys
// give counted values their correct Russian word forms (FR-010).
export const formatRoundStats = (t, { tricks, points }) =>
  `${t('stats.tricks', { count: tricks ?? 0 })}, ${t('stats.points', { count: points ?? 0 })}`;

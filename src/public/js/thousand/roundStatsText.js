// Single source of truth for the per-seat round-stats label, rendered both
// under each opponent and above the viewer's own hand.
export const formatRoundStats = (tricks, points) => `Tricks ${tricks ?? 0}, Points ${points ?? 0}`;

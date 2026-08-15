const OUTCOMES = Object.freeze({
  violent: Object.freeze({ id: 'violent', reroll: false }),
  hostile: Object.freeze({ id: 'hostile', reroll: false }),
  unfriendly: Object.freeze({ id: 'unfriendly', reroll: false }),
  neutral: Object.freeze({ id: 'neutral', reroll: true }),
  friendly: Object.freeze({ id: 'friendly', reroll: false }),
  agreeable: Object.freeze({ id: 'agreeable', reroll: false }),
  affable: Object.freeze({ id: 'affable', reroll: false }),
});

function parseReactionTotal(value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    throw new TypeError('Reaction total must be a finite number.');
  }
  const total = Number(value);
  if (!Number.isFinite(total)) {
    throw new TypeError('Reaction total must be a finite number.');
  }
  return total;
}

export function getReactionOutcome(value) {
  const total = parseReactionTotal(value);
  if (total <= 2) return OUTCOMES.violent;
  if (total === 3) return OUTCOMES.hostile;
  if (total <= 5) return OUTCOMES.unfriendly;
  if (total <= 8) return OUTCOMES.neutral;
  if (total <= 10) return OUTCOMES.friendly;
  if (total === 11) return OUTCOMES.agreeable;
  return OUTCOMES.affable;
}

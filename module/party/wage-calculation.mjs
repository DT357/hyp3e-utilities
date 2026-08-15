function normalizeAvailableGp(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.max(0, Math.trunc(amount)),
  );
}

function normalizeWage(value) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0
    ? { amount, valid: true }
    : { amount: 0, valid: false };
}

export function calculateWageSettlement({
  availableGp = 0,
  followers = [],
  selectedActorUuids,
} = {}) {
  const normalizedAvailableGp = normalizeAvailableGp(availableGp);
  const normalizedFollowers = Array.isArray(followers) ? followers : [];
  const selected = selectedActorUuids == null
    ? null
    : new Set(selectedActorUuids);
  let invalidSelectedCount = 0;
  let selectedCount = 0;
  let totalDueGp = 0;

  const followerRows = normalizedFollowers.map((follower) => {
    const actorUuid = typeof follower?.actorUuid === 'string'
      ? follower.actorUuid
      : '';
    const isSelected = selected == null || selected.has(actorUuid);
    const wage = normalizeWage(follower?.wageGp);
    if (isSelected) {
      selectedCount += 1;
      if (!wage.valid) invalidSelectedCount += 1;
      if (totalDueGp > Number.MAX_SAFE_INTEGER - wage.amount) {
        throw new RangeError('Selected wages exceed the safe integer range.');
      }
      totalDueGp += wage.amount;
    }
    return {
      actorUuid,
      invalidWage: !wage.valid,
      name: typeof follower?.name === 'string' ? follower.name : actorUuid,
      paymentGp: isSelected && wage.valid ? wage.amount : 0,
      selected: isSelected,
      wageGp: wage.amount,
    };
  });
  const enoughGp = totalDueGp <= normalizedAvailableGp;
  const canSettle =
    selectedCount > 0
    && totalDueGp > 0
    && invalidSelectedCount === 0
    && enoughGp;

  return {
    availableGp: normalizedAvailableGp,
    canSettle,
    enoughGp,
    followers: followerRows,
    invalidSelectedCount,
    remainingGp: canSettle
      ? normalizedAvailableGp - totalDueGp
      : normalizedAvailableGp,
    selectedCount,
    shortfallGp: Math.max(0, totalDueGp - normalizedAvailableGp),
    totalDueGp,
  };
}

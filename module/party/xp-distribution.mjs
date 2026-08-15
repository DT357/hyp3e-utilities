const SHARE_UNITS_PER_SHARE = 4;
const PERCENT_DENOMINATOR = 100n;

function normalizeSafeWhole(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.max(0, Math.trunc(numericValue)),
  );
}

function normalizeSignedSafeWhole(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(
    Number.MIN_SAFE_INTEGER,
    Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(numericValue)),
  );
}

function normalizeShareUnits(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 0;
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.max(0, Math.round(numericValue * SHARE_UNITS_PER_SHARE)),
  );
}

function toSafeNumber(value) {
  return Number(value > BigInt(Number.MAX_SAFE_INTEGER)
    ? BigInt(Number.MAX_SAFE_INTEGER)
    : value);
}

function addSafe(total, value) {
  return Math.min(Number.MAX_SAFE_INTEGER, total + value);
}

export function allocateExperience({
  recipients = [],
  selectedActorUuids,
  totalXp = 0,
} = {}) {
  const normalizedRecipients = Array.isArray(recipients) ? recipients : [];
  const selected = selectedActorUuids == null
    ? null
    : new Set(selectedActorUuids);
  const normalizedTotalXp = normalizeSafeWhole(totalXp);

  const recipientInputs = normalizedRecipients.map((recipient) => {
    const actorUuid = typeof recipient?.actorUuid === 'string'
      ? recipient.actorUuid
      : '';
    const shareUnits = normalizeShareUnits(recipient?.share);
    const isSelected = selected == null || selected.has(actorUuid);
    return {
      actorType: recipient?.actorType === 'npc' ? 'npc' : 'character',
      actorUuid,
      bonusPercent: normalizeSignedSafeWhole(recipient?.bonusPercent),
      isSelected,
      shareUnits,
    };
  });
  const totalShareUnits = recipientInputs.reduce(
    (total, recipient) => total + (
      recipient.isSelected ? BigInt(recipient.shareUnits) : 0n
    ),
    0n,
  );
  const totalXpBigInt = BigInt(normalizedTotalXp);
  let allocatedBaseXp = 0;
  let consumedNpcXp = 0;
  let persistedXp = 0;

  const distributions = recipientInputs.map((recipient) => {
    const included = recipient.isSelected
      && recipient.shareUnits > 0
      && totalShareUnits > 0n;
    const baseXp = included
      ? Number(
        (totalXpBigInt * BigInt(recipient.shareUnits)) / totalShareUnits,
      )
      : 0;
    const writeback = recipient.actorType === 'character';
    const bonusPercent = writeback ? recipient.bonusPercent : 0;
    const signedAdjustedPercent = PERCENT_DENOMINATOR + BigInt(bonusPercent);
    const adjustedPercent = signedAdjustedPercent > 0n
      ? signedAdjustedPercent
      : 0n;
    const finalAwardXp = writeback
      ? toSafeNumber((BigInt(baseXp) * adjustedPercent) / PERCENT_DENOMINATOR)
      : baseXp;
    const adjustmentXp = finalAwardXp - baseXp;
    const persistentAwardXp = writeback ? finalAwardXp : 0;

    allocatedBaseXp += baseXp;
    persistedXp = addSafe(persistedXp, persistentAwardXp);
    if (!writeback) consumedNpcXp += baseXp;

    return {
      actorType: recipient.actorType,
      actorUuid: recipient.actorUuid,
      adjustmentXp,
      baseXp,
      bonusPercent,
      finalAwardXp,
      included,
      persistentAwardXp,
      selected: recipient.isSelected,
      share: recipient.shareUnits / SHARE_UNITS_PER_SHARE,
      writeback,
    };
  });

  return {
    baseRemainderXp: normalizedTotalXp - allocatedBaseXp,
    consumedNpcXp,
    distributions,
    persistedXp,
    totalShares: Number(totalShareUnits) / SHARE_UNITS_PER_SHARE,
    totalXp: normalizedTotalXp,
  };
}

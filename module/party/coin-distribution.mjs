import { COIN_KEYS } from '../core/constants.mjs';

const SHARE_UNITS_PER_SHARE = 4;

function normalizeSafeWhole(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.max(0, Math.trunc(numericValue)),
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

function normalizeCoins(value = {}) {
  return Object.fromEntries(COIN_KEYS.map((coinKey) => [
    coinKey,
    normalizeSafeWhole(value?.[coinKey]),
  ]));
}

function zeroCoins() {
  return Object.fromEntries(COIN_KEYS.map((coinKey) => [coinKey, 0]));
}

export function allocateCoins({
  availableCoins = {},
  recipients = [],
  selectedActorUuids,
  splitCoins,
} = {}) {
  const normalizedAvailableCoins = normalizeCoins(availableCoins);
  const requestedSplitCoins = splitCoins === undefined
    ? normalizedAvailableCoins
    : normalizeCoins(splitCoins);
  const normalizedSplitCoins = Object.fromEntries(COIN_KEYS.map((coinKey) => [
    coinKey,
    Math.min(
      normalizedAvailableCoins[coinKey],
      requestedSplitCoins[coinKey],
    ),
  ]));
  const selected = selectedActorUuids == null
    ? null
    : new Set(selectedActorUuids);
  const recipientInputs = (Array.isArray(recipients) ? recipients : [])
    .map((recipient) => {
      const actorUuid = typeof recipient?.actorUuid === 'string'
        ? recipient.actorUuid
        : '';
      return {
        actorType: ['character', 'npc'].includes(recipient?.actorType)
          ? recipient.actorType
          : 'missing',
        actorUuid,
        selected: selected == null || selected.has(actorUuid),
        shareUnits: normalizeShareUnits(recipient?.share),
      };
    });
  const totalShareUnits = recipientInputs.reduce(
    (total, recipient) => total + (
      recipient.selected ? BigInt(recipient.shareUnits) : 0n
    ),
    0n,
  );
  const distributedTotals = zeroCoins();
  const consumedNpcTotals = zeroCoins();
  const persistedTotals = zeroCoins();

  const distributions = recipientInputs.map((recipient) => {
    const included = recipient.selected
      && recipient.shareUnits > 0
      && totalShareUnits > 0n;
    const awards = Object.fromEntries(COIN_KEYS.map((coinKey) => {
      const award = included
        ? Number(
          (BigInt(normalizedSplitCoins[coinKey]) * BigInt(recipient.shareUnits))
          / totalShareUnits,
        )
        : 0;
      distributedTotals[coinKey] += award;
      if (recipient.actorType === 'npc') consumedNpcTotals[coinKey] += award;
      if (recipient.actorType === 'character') persistedTotals[coinKey] += award;
      return [coinKey, award];
    }));
    const writeback = recipient.actorType === 'character';
    return {
      actorType: recipient.actorType,
      actorUuid: recipient.actorUuid,
      awards,
      included,
      persistentAwards: writeback ? { ...awards } : zeroCoins(),
      selected: recipient.selected,
      share: recipient.shareUnits / SHARE_UNITS_PER_SHARE,
      writeback,
    };
  });
  const splitRemainders = Object.fromEntries(COIN_KEYS.map((coinKey) => [
    coinKey,
    normalizedSplitCoins[coinKey] - distributedTotals[coinKey],
  ]));
  const remainingTreasuryCoins = Object.fromEntries(COIN_KEYS.map((coinKey) => [
    coinKey,
    normalizedAvailableCoins[coinKey] - distributedTotals[coinKey],
  ]));

  return {
    availableCoins: normalizedAvailableCoins,
    consumedNpcTotals,
    distributedTotals,
    distributions,
    persistedTotals,
    remainingTreasuryCoins,
    splitCoins: normalizedSplitCoins,
    splitRemainders,
    totalShares: Number(totalShareUnits) / SHARE_UNITS_PER_SHARE,
  };
}

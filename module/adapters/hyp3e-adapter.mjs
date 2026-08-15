import {
  COIN_KEYS,
  FLAG_KEYS,
  MODULE_ID,
  SAVE_KEYS,
} from '../core/constants.mjs';

const ACTOR_TYPES = Object.freeze({
  character: 'character',
  npc: 'npc',
  treasure: 'treasure',
});
const PHYSICAL_ITEM_TYPES = Object.freeze([
  'weapon',
  'armor',
  'shield',
  'item',
]);

export const HYP3E_FIELD_PATHS = Object.freeze({
  hpValue: 'system.hp.value',
  hpMax: 'system.hp.max',
  armorClass: 'system.ac.value',
  damageReduction: 'system.ac.dr',
  movement: 'system.movement.base.value',
  npcSubtype: 'system.npcType',
  characterExperience: 'system.details.xp.value',
  characterExperienceBonus: 'system.details.xp.bonus',
  npcExperience: 'system.xp',
});

function readPath(value, path) {
  return path.split('.').reduce(
    (current, key) => current?.[key],
    value,
  );
}

function normalizeWhole(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.trunc(numericValue));
}

function normalizeSignedWhole(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.trunc(numericValue) : 0;
}

function normalizeOptionalNumber(value) {
  if (
    value == null
    || (typeof value === 'string' && value.trim() === '')
  ) return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeOptionalSignedWhole(value) {
  const numericValue = normalizeOptionalNumber(value);
  return numericValue == null ? null : Math.trunc(numericValue);
}

function getHp(actor) {
  return {
    value: normalizeSignedWhole(readPath(actor, HYP3E_FIELD_PATHS.hpValue)),
    max: normalizeWhole(readPath(actor, HYP3E_FIELD_PATHS.hpMax)),
  };
}

function getArmor(actor) {
  return {
    ac: normalizeSignedWhole(
      readPath(actor, HYP3E_FIELD_PATHS.armorClass),
    ),
    dr: normalizeSignedWhole(
      readPath(actor, HYP3E_FIELD_PATHS.damageReduction),
    ),
  };
}

function getSaves(actor) {
  return Object.fromEntries(SAVE_KEYS.map((saveKey) => [
    saveKey,
    normalizeOptionalSignedWhole(
      readPath(actor, `system.saves.${saveKey}.curr`),
    ),
  ]));
}

function getMoney(actor) {
  return Object.fromEntries(COIN_KEYS.map((coinKey) => [
    coinKey,
    normalizeWhole(readPath(actor, `system.money.${coinKey}.value`)),
  ]));
}

function isSupportedPhysicalItem(item) {
  return PHYSICAL_ITEM_TYPES.includes(item?.type);
}

function getItemQuantity(item) {
  if (!isSupportedPhysicalItem(item)) return null;
  const quantity = item.system?.quantity;
  return {
    value: normalizeWhole(quantity?.value),
    max: quantity?.max == null ? null : normalizeWhole(quantity.max),
    bundle: quantity?.bundle == null ? null : normalizeWhole(quantity.bundle),
  };
}

function isManagedTreasury(actor) {
  if (actor?.type !== ACTOR_TYPES.treasure) return false;
  if (typeof actor.getFlag === 'function') {
    return actor.getFlag(MODULE_ID, FLAG_KEYS.partyTreasury) === true;
  }
  return actor.flags?.[MODULE_ID]?.[FLAG_KEYS.partyTreasury] === true;
}

export const hyp3eAdapter = Object.freeze({
  actorTypes: ACTOR_TYPES,
  physicalItemTypes: PHYSICAL_ITEM_TYPES,

  isSupportedActor(actor) {
    return Object.values(ACTOR_TYPES).includes(actor?.type);
  },

  isNpcActor(actor) {
    return actor?.type === ACTOR_TYPES.npc;
  },

  canRollSave(actor) {
    return [ACTOR_TYPES.character, ACTOR_TYPES.npc].includes(actor?.type);
  },

  isSupportedPhysicalItem,

  getActorSummary(actor) {
    return {
      id: actor?.id ?? null,
      uuid: actor?.uuid ?? null,
      name: actor?.name ?? '',
      type: actor?.type ?? null,
      isSynthetic:
        actor?.isToken === true || actor?.uuid?.startsWith('Scene.') === true,
      hp: getHp(actor),
      armor: getArmor(actor),
      movement: normalizeWhole(
        readPath(actor, HYP3E_FIELD_PATHS.movement),
      ),
      race: readPath(actor, 'system.details.race') ?? '',
      className: readPath(actor, 'system.details.class') ?? '',
      level: normalizeWhole(readPath(actor, 'system.details.level.value')),
    };
  },

  getHp,
  getArmor,
  getSaves,

  getSave(actor, saveKey) {
    return SAVE_KEYS.includes(saveKey) ? getSaves(actor)[saveKey] : null;
  },

  getMorale(actor) {
    if (actor?.type !== ACTOR_TYPES.npc) return null;
    return normalizeOptionalNumber(actor.system?.morale);
  },

  getNpcSubtype(actor) {
    if (actor?.type !== ACTOR_TYPES.npc) return '';
    const subtype = readPath(actor, HYP3E_FIELD_PATHS.npcSubtype);
    return typeof subtype === 'string' ? subtype.trim() : '';
  },

  getLoyalty(actor) {
    if (actor?.type !== ACTOR_TYPES.npc) return null;
    return normalizeOptionalNumber(actor.system?.loyalty);
  },

  getCharacterExperience(actor) {
    if (actor?.type !== ACTOR_TYPES.character) return null;
    return {
      value: normalizeWhole(
        readPath(actor, HYP3E_FIELD_PATHS.characterExperience),
      ),
      bonus: normalizeSignedWhole(
        readPath(actor, HYP3E_FIELD_PATHS.characterExperienceBonus),
      ),
    };
  },

  getEncounterExperience(actor) {
    if (actor?.type !== ACTOR_TYPES.npc) return null;
    return normalizeWhole(readPath(actor, HYP3E_FIELD_PATHS.npcExperience));
  },

  canWriteExperience(actor) {
    return actor?.type === ACTOR_TYPES.character;
  },

  buildCharacterExperienceUpdate(value) {
    return {
      [HYP3E_FIELD_PATHS.characterExperience]: String(normalizeWhole(value)),
    };
  },

  getMoney,

  canWriteMoney(actor) {
    return [ACTOR_TYPES.character, ACTOR_TYPES.treasure]
      .includes(actor?.type);
  },

  buildMoneyUpdate(money) {
    return Object.fromEntries(COIN_KEYS.map((coinKey) => [
      `system.money.${coinKey}.value`,
      String(normalizeWhole(money?.[coinKey])),
    ]));
  },

  getItemCategory(item) {
    return isSupportedPhysicalItem(item) ? item.type : null;
  },

  getItemQuantity,

  buildItemQuantityUpdate(quantity) {
    const update = {
      'system.quantity.value': normalizeWhole(quantity?.value),
    };
    if (quantity?.max != null) {
      update['system.quantity.max'] = normalizeWhole(quantity.max);
    }
    if (quantity?.bundle != null) {
      update['system.quantity.bundle'] = normalizeWhole(quantity.bundle);
    }
    return update;
  },

  isManagedTreasury,
});

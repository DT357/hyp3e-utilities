import { allocateExperience } from './xp-distribution.mjs';

const WORLD_ACTOR_UUID_PATTERN = /^Actor\.([^\.\s]+)$/;

function resolveWorldActor(game, actorUuid) {
  const match = WORLD_ACTOR_UUID_PATTERN.exec(actorUuid);
  if (!match) return null;
  const actor = game?.actors?.get?.(match[1]) ?? null;
  if (
    actor?.documentName !== 'Actor'
    || actor?.uuid !== actorUuid
    || actor?.isToken === true
  ) return null;
  return actor;
}

export function createPartyXpPreviewService({ adapter, game, store } = {}) {
  if (typeof store?.getState !== 'function') {
    throw new TypeError('Party XP preview requires a Party Store.');
  }

  function getPreview({ selectedActorUuids, totalXp = 0 } = {}, state = store.getState()) {
    const actorUuids = [
      ...state.memberActorUuids,
      ...state.followerActorUuids,
    ];
    const recipientRows = actorUuids.map((actorUuid) => {
      const actor = resolveWorldActor(game, actorUuid);
      const supported = [adapter.actorTypes.character, adapter.actorTypes.npc]
        .includes(actor?.type);
      const experience = actor?.type === adapter.actorTypes.character
        ? adapter.getCharacterExperience(actor)
        : null;
      return {
        actorType: supported ? actor.type : 'missing',
        actorUuid,
        bonusPercent: experience?.bonus ?? 0,
        img: actor?.img || 'icons/svg/mystery-man.svg',
        missing: !supported,
        name: supported ? actor.name : actorUuid,
        share: supported ? (state.shares[actorUuid] ?? 1) : 0,
      };
    });
    const allocation = allocateExperience({
      recipients: recipientRows,
      selectedActorUuids,
      totalXp,
    });

    return {
      ...allocation,
      distributions: allocation.distributions.map((distribution, index) => ({
        ...distribution,
        adjustmentLabel: distribution.adjustmentXp > 0
          ? `+${distribution.adjustmentXp}`
          : String(distribution.adjustmentXp),
        img: recipientRows[index].img,
        missing: recipientRows[index].missing,
        name: recipientRows[index].name,
        writebackLabel: distribution.writeback
          ? 'hyp3e-utilities.applications.partySheet.xpWritebackCharacter'
          : 'hyp3e-utilities.applications.partySheet.xpWritebackNpc',
      })),
    };
  }

  return Object.freeze({ getPreview });
}

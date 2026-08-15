export const characterActor = {
  id: 'character-id',
  uuid: 'Actor.character-id',
  name: 'Astra',
  type: 'character',
  system: {
    hp: { value: 7, max: 12 },
    ac: { value: 4, dr: 1 },
    movement: { base: { value: 40 } },
    saves: {
      death: { curr: 11 },
      device: { curr: 12 },
      transformation: { curr: 13 },
      avoidance: { curr: 14 },
      sorcery: { curr: 15 },
    },
    details: {
      race: 'Kelt',
      class: 'Fighter',
      level: { value: 3 },
      xp: { value: '1250', bonus: 10 },
    },
    money: {
      cp: { value: '5' },
      sp: { value: '6' },
      ep: { value: '7' },
      gp: { value: '8' },
      pp: { value: '9' },
    },
  },
};

export const npcActor = {
  id: 'npc-id',
  uuid: 'Actor.npc-id',
  name: 'Cave Hyena',
  type: 'npc',
  system: {
    npcType: 'monster',
    hp: { value: 9, max: 9 },
    ac: { value: 7, dr: 0 },
    movement: { base: { value: 50 } },
    saves: {
      death: { curr: 10 },
      device: { curr: 11 },
      transformation: { curr: 12 },
      avoidance: { curr: 13 },
      sorcery: { curr: 14 },
    },
    morale: 8,
    loyalty: 6,
    xp: '35',
  },
};

export const treasureActor = {
  id: 'treasure-id',
  uuid: 'Actor.treasure-id',
  name: 'Party Treasury',
  type: 'treasure',
  flags: { 'hyp3e-utilities': { partyTreasury: true } },
  system: {
    money: {
      cp: { value: '100' },
      sp: { value: '50' },
      ep: { value: '20' },
      gp: { value: '10' },
      pp: { value: '2' },
    },
  },
};

export const syntheticNpcActor = {
  ...npcActor,
  id: 'synthetic-npc-id',
  uuid: 'Scene.scene-id.Token.token-id.Actor.npc-id',
  isToken: true,
  name: 'Cave Hyena (Wounded)',
  system: {
    ...npcActor.system,
    hp: { value: 2, max: 9 },
  },
};

export const physicalItems = [
  ['weapon', 'Weapon'],
  ['armor', 'Armor'],
  ['shield', 'Shield'],
  ['item', 'Item'],
].map(([type, name], index) => ({
  id: `${type}-id`,
  uuid: `Actor.character-id.Item.${type}-id`,
  name,
  type,
  system: {
    quantity: { value: index + 1, max: 10, bundle: index },
  },
}));

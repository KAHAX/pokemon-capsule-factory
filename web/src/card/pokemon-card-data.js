const theme = (primary, secondary, dark, nebula) => ({ primary, secondary, dark, nebula });

export const POKEMON_CARDS = [
  {
    id: 'electric', number: '025', name: 'Pikachu', chinese: '皮卡丘', hp: 120, type: 'electric', typeName: '电',
    attack: 'Circle Circuit', damage: '30×', attackText: 'This attack does 30 damage for each of your Benched Pokémon.', weakness: 'fighting',
    model: '025-pikachu.glb', centerX: 0.75, frameSize: 5.6,
    theme: theme('#ffd84d', '#6fe4ff', '#081426', ['rgba(22,119,188,0.48)', 'rgba(44,181,219,0.28)', 'rgba(241,180,49,0.2)']),
  },
  {
    id: 'grass', number: '043', name: 'Oddish', chinese: '走路草', hp: 90, type: 'grass', typeName: '草',
    attack: 'Vine Whip', damage: '30', attackText: 'Lash out with vines charged by the power of nature.', weakness: 'fire',
    model: '043-oddish.glb', centerX: 0, frameSize: 5.2,
    theme: theme('#8be36e', '#6ce6c2', '#071f1a', ['rgba(38,157,91,0.5)', 'rgba(56,190,139,0.28)', 'rgba(170,210,70,0.2)']),
  },
  {
    id: 'fire', number: '004', name: 'Charmander', chinese: '小火龙', hp: 100, type: 'fire', typeName: '火',
    attack: 'Ember', damage: '30', attackText: 'Release a burst of glowing embers and scorching starlight.', weakness: 'water',
    model: '004-charmander.glb', centerX: 0.25, frameSize: 5.5,
    theme: theme('#ff8451', '#ffbf62', '#28100d', ['rgba(190,52,28,0.52)', 'rgba(244,119,39,0.3)', 'rgba(255,185,64,0.2)']),
  },
  {
    id: 'water', number: '007', name: 'Squirtle', chinese: '杰尼龟', hp: 110, type: 'water', typeName: '水',
    attack: 'Water Gun', damage: '30', attackText: 'Fire a crystalline stream through a field of blue stars.', weakness: 'electric',
    model: '007-squirtle.glb', centerX: 0.15, frameSize: 5.4,
    theme: theme('#62c9ff', '#6ff5ef', '#07182c', ['rgba(24,116,190,0.52)', 'rgba(41,178,213,0.3)', 'rgba(65,116,220,0.2)']),
  },
  {
    id: 'fighting', number: '257', name: 'Blaziken', chinese: '火焰鸡', hp: 140, type: 'fighting', typeName: '格斗',
    attack: 'Blaze Kick', damage: '60', attackText: 'A decisive fighting strike driven by flame and focus.', weakness: 'water',
    model: '257-blaziken-v5.glb', centerX: 0, frameSize: 5.5,
    theme: theme('#ff9b57', '#ffd08a', '#24130e', ['rgba(173,66,34,0.5)', 'rgba(213,120,46,0.28)', 'rgba(240,171,67,0.2)']),
  },
  {
    id: 'colorless', number: '133', name: 'Eevee', chinese: '伊布', hp: 110, type: 'colorless', typeName: '无属性',
    attack: 'Swift', damage: '30', attackText: 'A bright, effortless attack that adapts to every starfield.', weakness: 'fighting',
    model: '133-eevee.glb', centerX: 0.3, frameSize: 5.4,
    theme: theme('#f2dfb2', '#c6b5ff', '#211b1b', ['rgba(139,105,88,0.5)', 'rgba(170,143,118,0.3)', 'rgba(174,143,201,0.18)']),
  },
  {
    id: 'steel', number: '448', name: 'Lucario', chinese: '路卡利欧', hp: 130, type: 'steel', typeName: '钢',
    attack: 'Metal Claw', damage: '50', attackText: 'Slice through the constellation with a hardened aura.', weakness: 'fire',
    model: '448-lucario.glb', centerX: 0, frameSize: 5.6,
    theme: theme('#c2d2df', '#80c9e8', '#111a25', ['rgba(75,104,128,0.5)', 'rgba(94,141,167,0.28)', 'rgba(138,162,181,0.2)']),
  },
  {
    id: 'psychic', number: '151', name: 'Mew', chinese: '梦幻', hp: 130, type: 'psychic', typeName: '超能',
    attack: 'Psyshot', damage: '20', attackText: 'A playful pulse of psychic energy bends the distant stars.', weakness: 'dark',
    model: '151-mew.glb', centerX: 0.45, frameSize: 5.3,
    theme: theme('#e6a5ff', '#87d9ff', '#1b102d', ['rgba(123,65,173,0.5)', 'rgba(176,91,189,0.3)', 'rgba(81,146,211,0.18)']),
  },
  {
    id: 'dark', number: '197', name: 'Umbreon', chinese: '月亮伊布', hp: 130, type: 'dark', typeName: '恶',
    attack: 'Dark Pulse', damage: '40', attackText: 'Shadowy rings ripple silently through the midnight sky.', weakness: 'fighting',
    model: '197-umbreon.glb', centerX: 0.25, frameSize: 5.4,
    theme: theme('#e3c959', '#6575bd', '#080b18', ['rgba(35,43,85,0.55)', 'rgba(61,64,115,0.3)', 'rgba(173,143,48,0.17)']),
  },
  {
    id: 'dragon', number: '149', name: 'Dragonite', chinese: '快龙', hp: 160, type: 'dragon', typeName: '龙',
    attack: 'Dragon Claw', damage: '60', attackText: 'Ancient draconic power spirals across a golden galaxy.', weakness: 'dragon',
    model: '149-dragonite.glb', centerX: 0, frameSize: 5.5,
    theme: theme('#e5bd45', '#8bd8c6', '#171827', ['rgba(56,91,120,0.5)', 'rgba(127,111,49,0.3)', 'rgba(191,148,42,0.2)']),
  },
  {
    id: 'fairy', number: '035', name: 'Clefairy', chinese: '皮皮', hp: 110, type: 'fairy', typeName: '妖精',
    attack: 'Moonblast', damage: '30', attackText: 'Moonlit magic scatters pink sparks across the heavens.', weakness: 'steel',
    model: '035-clefairy.glb', centerX: 0, frameSize: 5.3,
    theme: theme('#ff9dce', '#ffc4e2', '#281225', ['rgba(174,69,132,0.5)', 'rgba(214,107,165,0.3)', 'rgba(235,161,193,0.18)']),
  },
  {
    id: 'shiny', number: '151', name: 'Mew', chinese: '闪光梦幻', hp: 180, type: 'psychic', typeName: '闪光', shiny: true,
    attack: 'Aurora Wish', damage: '120', attackText: 'A radiant wish races through an endless aurora of stars.', weakness: 'dark',
    model: '151-mew-shiny.glb', centerX: 0.45, frameSize: 4.9, rarity: 'SECRET RARE · AURORA EDITION',
    theme: theme('#fff3a5', '#91f4ff', '#6653a0', ['rgba(77,220,255,0.65)', 'rgba(232,118,255,0.5)', 'rgba(255,220,110,0.4)']),
  },
];

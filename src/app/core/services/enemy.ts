import { Injectable } from '@angular/core';
import { Enemy, EnemyTier, Item, ItemType } from './indexed-db';

@Injectable({ providedIn: 'root' })
export class EnemyService {

  private enemies: Enemy[] = [
    {
      id: 'frog',
      name: 'Mutant Frog',
      spriteKey: 'mutant_frog',
      tier: 1,
      maxHp: 60,
      atk: 8,
      ability: 'sticky-tongue',
      lootTable: ['potion', 'shield'],
    },
    {
      id: 'angry_chicken',
      name: 'Angry Chicken',
      spriteKey: 'angry_chicken',
      tier: 1,
      maxHp: 80,
      atk: 12,
      ability: 'cram',
      lootTable: ['skip', 'potion'],
    },
    {
      id: 'knight',
      name: 'Knight',
      spriteKey: 'knight',
      tier: 1,
      maxHp: 100,
      atk: 15,
      ability: 'revive',
      lootTable: ['shield', 'crit'],
    },
    {
      id: 'mushroom',
      name: 'Mad Mushroom',
      spriteKey: 'mad_mushroom',
      tier: 2,
      maxHp: 70,
      atk: 20,
      ability: 'suppress-crit',
      lootTable: ['crit', 'skip'],
    },
    {
      id: 'minotaur',
      name: 'Minotaur',
      spriteKey: 'minotaur',
      tier: 2,
      maxHp: 150,
      atk: 18,
      ability: 'troll-heal',
      lootTable: ['potion', 'potion', 'shield'],
    },
    {
      id: 'lich',
      name: 'Lich',
      spriteKey: 'lich',
      tier: 3,
      maxHp: 120,
      atk: 22,
      ability: 'soul-drain',
      lootTable: ['skip', 'crit', 'shield'],
    },
    {
      id: 'mimic',
      name: 'Mimic',
      spriteKey: 'mimic',
      tier: 3,
      maxHp: 90,
      atk: 16,
      ability: 'no-mercy',
      lootTable: ['crit', 'crit', 'potion'],
    },
    {
      id: 'fang',
      name: 'Fang',
      spriteKey: 'fang',
      tier: 3,
      maxHp: 110,
      atk: 14,
      ability: 'bleed',
      lootTable: ['crit', 'potion', 'shield'],
    },
    {
      id: 'dragon',
      name: 'Dragon',
      spriteKey: 'dragon',
      tier: 'boss',
      maxHp: 250,
      atk: 30,
      ability: 'enrage',
      lootTable: [],
    },
    {
      id: 'orc',
      name: 'Orc Warlord',
      spriteKey: 'orc',
      tier: 'boss',
      maxHp: 280,
      atk: 25,
      ability: 'warcry',
      lootTable: [],
    },
    {
      id: 'chicken_army',
      name: 'Chicken Army',
      spriteKey: 'chicken_army',
      tier: 'boss',
      maxHp: 200,
      atk: 18,
      ability: 'swarm',
      lootTable: [],
    },
    {
      id: 'mutant_turtle',
      name: 'Mutant Turtle',
      spriteKey: 'mutant_turtle',
      tier: 'boss',
      maxHp: 320,
      atk: 22,
      ability: 'shell',
      lootTable: [],
    },
  ];

  private itemDefs: Record<ItemType, Omit<Item, 'id'>> = {
    potion: {
      type: 'potion',
      name: 'Health Potion',
      description: 'Restore 30 HP.',
    },
    skip: {
      type: 'skip',
      name: 'Bomb',
      description: 'Skip the current card — no damage, no FSRS penalty.',
    },
    shield: {
      type: 'shield',
      name: 'Iron Shield',
      description: 'Block the next Again attack completely.',
    },
    crit: {
      type: 'crit',
      name: 'Iron Sword',
      description: 'Your next Good answer deals Easy damage instead.',
    },
  };

  // --- Room Progression ---

  getEnemyForRoom(room: number, totalRooms: number, difficulty: string): Enemy {
    if (room >= totalRooms) return this.getBossForDifficulty(difficulty);

    const tierMap: Record<number, EnemyTier[]> = {
      1: [1],
      2: [1, 2],
      3: [2, 3],
    };

    const allowedTiers = tierMap[room] ?? [2, 3];
    const pool = this.enemies.filter(
      e => e.tier !== 'boss' && allowedTiers.includes(e.tier as EnemyTier)
    );

    return pool[Math.floor(Math.random() * pool.length)];
  }

  getBossForDifficulty(difficulty: string): Enemy {
    const easyBosses = ['dragon', 'chicken_army'];
    const hardBosses = ['orc', 'mutant_turtle'];

    const isHard = difficulty === 'adept' || difficulty === 'master';
    const pool = isHard
      ? this.enemies.filter(e => hardBosses.includes(e.id))
      : this.enemies.filter(e => easyBosses.includes(e.id));

    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Endless mode: pick any enemy from the full roster (including bosses
   * every ~4 rooms based on the wave number).
   */
  getEndlessEnemy(wave: number): Enemy {
    const isBossWave = wave % 4 === 0;
    const pool = isBossWave
      ? this.enemies.filter(e => e.tier === 'boss')
      : this.enemies.filter(e => e.tier !== 'boss');
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // --- Loot ---

  rollLoot(enemy: Enemy): Item[] | null {
    return this.rollLootWithChance(enemy, 0.7);
  }

  rollLootWithChance(enemy: Enemy, chance: number): Item[] | null {
    if (Math.random() > chance) return null;
    if (enemy.lootTable.length === 0) return null;
    const picks = this.pickFromTable(enemy.lootTable, 3);
    return picks.map(type => this.makeItem(type));
  }

  makeItem(type: ItemType): Item {
    return {
      id: crypto.randomUUID(),
      ...this.itemDefs[type],
    };
  }

  private pickFromTable(table: ItemType[], count: number): ItemType[] {
    const results: ItemType[] = [];
    const pool = [...table];

    for (let i = 0; i < count; i++) {
      if (pool.length === 0) break;
      const idx = Math.floor(Math.random() * pool.length);
      results.push(pool[idx]);
      pool.splice(idx, 1);
      if (pool.length === 0 && i < count - 1) pool.push(...table);
    }

    return results;
  }

  getAbilityDescription(enemy: Enemy): string {
    const map: Record<string, string> = {
      none: '',
      'sticky-tongue': 'On Again, the card is swallowed and re-queued — you must answer it again immediately.',
      cram: 'Gains +3 ATK each time you rate Again.',
      revive: 'Revives once at 20 HP when defeated.',
      'suppress-crit': 'Easy answers only deal Good damage.',
      'troll-heal': 'Heals 15 HP whenever you rate Hard.',
      'soul-drain': 'Each Again permanently reduces your max HP by 5.',
      'no-mercy': 'Hard is treated the same as Again.',
      bleed: 'Passively deals +5 bonus damage on every card rating, regardless of your answer.',
      enrage: 'Doubles ATK when below 50% HP.',
      warcry: 'Every 4th card, unleashes a Warcry — deals double ATK damage regardless of your answer.',
      swarm: 'Each Again summons a Chick: permanently grants +8 ATK (max 3 stacks).',
      shell: 'Blocks the first hit of every other card. You must strike twice in a row to pierce it.',
    };
    return map[enemy.ability] ?? '';
  }
}
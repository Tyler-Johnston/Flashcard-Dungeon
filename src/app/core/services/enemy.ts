import { Injectable } from '@angular/core';
import { Enemy, EnemyTier, Item, ItemType } from './indexed-db';

@Injectable({ providedIn: 'root' })
export class EnemyService {

  // --- Enemy Definitions ---

  private enemies: Enemy[] = [
    {
      id: 'frog',
      name: 'Mutant Frog',
      spriteKey: 'mutant_frog',
      tier: 1,
      maxHp: 60,
      atk: 8,
      ability: 'none',
      lootTable: ['potion', 'shield'],
    },
    {
      id: 'goober',
      name: 'Goober',
      spriteKey: 'goober',
      tier: 1,
      maxHp: 80,
      atk: 12,
      ability: 'cram',
      lootTable: ['scroll', 'potion'],
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
      name: 'Mushroom',
      spriteKey: 'mushroom',
      tier: 2,
      maxHp: 70,
      atk: 20,
      ability: 'suppress-crit',
      lootTable: ['crit', 'scroll'],
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
      lootTable: ['scroll', 'crit', 'shield'],
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
      id: 'dragon',
      name: 'Dragon',
      spriteKey: 'dragon',
      tier: 'boss',
      maxHp: 250,
      atk: 30,
      ability: 'enrage',
      lootTable: [],
    },
  ];

  // --- Item Definitions ---

  private itemDefs: Record<ItemType, Omit<Item, 'id'>> = {
    potion: {
      type: 'potion',
      name: 'Health Potion',
      description: 'Restore 30 HP.',
    },
    scroll: {
      type: 'scroll',
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

  /**
   * Returns a random enemy appropriate for the given room number.
   * Room 1 → tier 1
   * Room 2 → tier 1–2
   * Room 3 → tier 2–3
   * Room 4 → boss
   */
  getEnemyForRoom(room: number): Enemy {
    if (room >= 4) return this.getBoss();

    const tierMap: Record<number, EnemyTier[]> = {
      1: [1],
      2: [1, 2],
      3: [2, 3],
    };

    const allowedTiers = tierMap[room] ?? [1];
    const pool = this.enemies.filter(
      e => e.tier !== 'boss' && allowedTiers.includes(e.tier as EnemyTier)
    );

    return pool[Math.floor(Math.random() * pool.length)];
  }

  getBoss(): Enemy {
    return this.enemies.find(e => e.id === 'dragon')!;
  }

  // --- Loot ---

  /**
   * 70% chance to offer loot after defeating an enemy.
   * Returns 3 random items drawn from the enemy's loot table,
   * or null if the roll fails.
   */
  rollLoot(enemy: Enemy): Item[] | null {
    if (Math.random() > 0.7) return null;
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

  // --- Helpers ---

  private pickFromTable(table: ItemType[], count: number): ItemType[] {
    const results: ItemType[] = [];
    const pool = [...table];

    for (let i = 0; i < count; i++) {
      if (pool.length === 0) break;
      const idx = Math.floor(Math.random() * pool.length);
      results.push(pool[idx]);
      pool.splice(idx, 1);

      // Refill if pool runs dry and we need more picks
      if (pool.length === 0 && i < count - 1) {
        pool.push(...table);
      }
    }

    return results;
  }

  // --- Ability Descriptions (for UI) ---

  getAbilityDescription(enemy: Enemy): string {
    const map: Record<string, string> = {
      none: '',
      cram: 'Gains +3 ATK each time you rate Again.',
      revive: 'Revives once at 20 HP when defeated.',
      'suppress-crit': 'Easy answers only deal Good damage.',
      'troll-heal': 'Heals 15 HP whenever you rate Hard.',
      'soul-drain': 'Each Again permanently reduces your max HP by 5.',
      'no-mercy': 'Hard is treated the same as Again.',
      enrage: 'Doubles ATK when below 50% HP.',
    };
    return map[enemy.ability] ?? '';
  }
}
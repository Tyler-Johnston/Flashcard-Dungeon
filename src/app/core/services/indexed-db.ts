import { Injectable } from '@angular/core';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

// --- Enums ---

export type EnemyTier = 1 | 2 | 3 | 'boss';
export type ItemType = 'potion' | 'skip' | 'shield' | 'crit';
export type EnemyAbility =
  | 'none'
  | 'cram'
  | 'revive'
  | 'suppress-crit'
  | 'troll-heal'
  | 'soul-drain'
  | 'no-mercy'
  | 'enrage'
  | 'sticky-tongue'
  | 'bleed'
  | 'warcry'
  | 'swarm'
  | 'shell';

export type ShopUpgradeId =
  | 'extra-hp'
  | 'starting-shield'
  | 'random-item'
  | 'extra-inventory'
  | 'better-loot';

export type Difficulty = 'novice' | 'apprentice' | 'adept' | 'master';

export interface DifficultyConfig {
  id: Difficulty;
  label: string;
  totalRooms: number;
  atkMult: number;
  hpMult: number;
  goldMult: number;
  playerAtkMult: number;
}

export const DIFFICULTIES: DifficultyConfig[] = [
  {
    id: 'novice',
    label: 'Novice',
    totalRooms: 3,
    atkMult: 0.85,
    playerAtkMult: 0.6,
    hpMult: 1.0,
    goldMult: 0.75,
  },
  {
    id: 'apprentice',
    label: 'Apprentice',
    totalRooms: 4,
    atkMult: 1.0,
    playerAtkMult: 0.8,
    hpMult: 1.0,
    goldMult: 1.0,
  },
  {
    id: 'adept',
    label: 'Adept',
    totalRooms: 5,
    atkMult: 1.25,
    playerAtkMult: 1.0,
    hpMult: 1.25,
    goldMult: 1.25,
  },
  {
    id: 'master',
    label: 'Master',
    totalRooms: 6,
    atkMult: 1.5,
    playerAtkMult: 1.0,
    hpMult: 1.5,
    goldMult: 1.5,
  },
];

// --- Stats ---

export interface PlayerStats {
  // Runs
  runsStarted:  number;
  runsWon:      number;
  runsLost:     number;

  // Combat
  enemiesDefeated:  Record<string, number>;  // keyed by enemy id
  enemiesKilledBy:  Record<string, number>;  // keyed by enemy id
  totalDamageDealt: number;
  totalDamageTaken: number;
  itemsUsed:        Record<string, number>;  // keyed by item type

  // Cards
  totalReviews: number;
  ratingCounts: { again: number; hard: number; good: number; easy: number };
  hardestCards: Array<{ cardId: string; againCount: number }>;

  // Progress
  totalGoldEarned: number;
  studyStreakDays:  number;
  longestStreak:   number;
  lastStudiedDate: string;  // "YYYY-MM-DD"
  bestRun: {
    roomsCleared: number;
    difficulty:   string;
    deckName:     string;
    date:         number;
  } | null;
}

export function defaultStats(): PlayerStats {
  return {
    runsStarted:      0,
    runsWon:          0,
    runsLost:         0,
    enemiesDefeated:  {},
    enemiesKilledBy:  {},
    totalDamageDealt: 0,
    totalDamageTaken: 0,
    itemsUsed:        {},
    totalReviews:     0,
    ratingCounts:     { again: 0, hard: 0, good: 0, easy: 0 },
    hardestCards:     [],
    totalGoldEarned:  0,
    studyStreakDays:   0,
    longestStreak:    0,
    lastStudiedDate:  '',
    bestRun:          null,
  };
}

// --- Core Types ---

export interface PlayerProfile {
  id: 'player';
  gold: number;
  upgrades: ShopUpgradeId[];
  stats: PlayerStats;
}

export interface Item {
  id: string;
  type: ItemType;
  name: string;
  description: string;
}

export interface Enemy {
  id: string;
  name: string;
  tier: EnemyTier;
  maxHp: number;
  atk: number;
  ability: EnemyAbility;
  lootTable: ItemType[];
  spriteKey: string;
}

export interface Deck {
  id: string;
  name: string;
  tags: string[];
  createdAt: number;
  builtInId?: string;
}

export interface Card {
  id: string;
  deckId: string;
  front: string;
  back: string;
  tags: string[];
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;
  lastReview: number | null;
}

export interface RunState {
  id: 'current';
  deckId: string;
  hp: number;
  maxHp: number;
  currentRoom: number;
  totalRooms: number;
  currentEnemy: Enemy;
  enemyHp: number;
  consecutiveAgain: number;
  cardQueue: string[];
  inventory: Item[];
  inventoryCap: number;
  activeEffects: string[];
  powerups: string[];
  startedAt: number;
  roomsCleared: number;
  uniqueCardsReviewed: string[];
  difficulty: Difficulty;
  atkMult: number;
  goldMult: number;
  playerAtkMult: number;
}

// --- IDB Schema ---

interface FlashcardDungeonDB extends DBSchema {
  decks: {
    key: string;
    value: Deck;
    indexes: { 'by-name': string };
  };
  cards: {
    key: string;
    value: Card;
    indexes: {
      'by-deck': string;
      'by-due': number;
    };
  };
  run: {
    key: string;
    value: RunState;
  };
  profile: {
    key: string;
    value: PlayerProfile;
  };
}

@Injectable({ providedIn: 'root' })
export class IndexedDbService {
  private db!: IDBPDatabase<FlashcardDungeonDB>;

  async init(): Promise<void> {
    this.db = await openDB<FlashcardDungeonDB>('flashcard-dungeon', 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains('decks')) {
            const deckStore = db.createObjectStore('decks', { keyPath: 'id' });
            deckStore.createIndex('by-name', 'name');
          }
          if (!db.objectStoreNames.contains('cards')) {
            const cardStore = db.createObjectStore('cards', { keyPath: 'id' });
            cardStore.createIndex('by-deck', 'deckId');
            cardStore.createIndex('by-due', 'due');
          }
          if (!db.objectStoreNames.contains('run')) {
            db.createObjectStore('run', { keyPath: 'id' });
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('profile')) {
            db.createObjectStore('profile', { keyPath: 'id' });
          }
        }
        // No schema change for stats — it's a field on the existing
        // profile record, so no new object store is needed. Old profile
        // records without stats are handled in getProfile() below.
      },
    });
  }

  // --- Profile ---

  async getProfile(): Promise<PlayerProfile> {
    const profile = await this.db.get('profile', 'player');
    if (!profile) {
      return { id: 'player', gold: 0, upgrades: [], stats: defaultStats() };
    }
    return {
      ...profile,
      upgrades: profile.upgrades ?? [],
      stats: profile.stats ?? defaultStats(),
    };
  }

  async saveProfile(profile: PlayerProfile): Promise<void> {
    await this.db.put('profile', profile);
  }

  async addGold(amount: number): Promise<PlayerProfile> {
    const profile = await this.getProfile();
    const updated: PlayerProfile = { ...profile, gold: profile.gold + amount };
    await this.db.put('profile', updated);
    return updated;
  }

  async purchaseUpgrade(upgradeId: ShopUpgradeId, cost: number): Promise<PlayerProfile | null> {
    const profile = await this.getProfile();
    if (profile.gold < cost) return null;
    if (profile.upgrades.includes(upgradeId)) return profile;
    const updated: PlayerProfile = {
      ...profile,
      gold: profile.gold - cost,
      upgrades: [...profile.upgrades, upgradeId],
    };
    await this.db.put('profile', updated);
    return updated;
  }

  hasUpgrade(profile: PlayerProfile, id: ShopUpgradeId): boolean {
    return profile.upgrades.includes(id);
  }

  // --- Stats ---

  async getStats(): Promise<PlayerStats> {
    const profile = await this.getProfile();
    return profile.stats ?? defaultStats();
  }

  async updateStats(updater: (s: PlayerStats) => void): Promise<void> {
    const profile = await this.getProfile();
    const stats: PlayerStats = { ...defaultStats(), ...profile.stats };
    updater(stats);
    await this.db.put('profile', { ...profile, stats });
  }

  // --- Deck operations ---

  async getAllDecks(): Promise<Deck[]> {
    return this.db.getAll('decks');
  }

  async saveDeck(deck: Deck): Promise<void> {
    await this.db.put('decks', deck);
  }

  async deleteDeck(id: string): Promise<void> {
    await this.db.delete('decks', id);
  }

  // --- Card operations ---

  async getCardsByDeck(deckId: string): Promise<Card[]> {
    return this.db.getAllFromIndex('cards', 'by-deck', deckId);
  }

  async getDueCards(deckId: string, now = Date.now()): Promise<Card[]> {
    const cards = await this.getCardsByDeck(deckId);
    return cards.filter(c => c.due <= now);
  }

  async saveCard(card: Card): Promise<void> {
    await this.db.put('cards', card);
  }

  async saveCards(cards: Card[]): Promise<void> {
    const tx = this.db.transaction('cards', 'readwrite');
    await Promise.all([...cards.map(c => tx.store.put(c)), tx.done]);
  }

  async deleteCard(id: string): Promise<void> {
    await this.db.delete('cards', id);
  }

  // --- Run state operations ---

  async getRunState(): Promise<RunState | undefined> {
    return this.db.get('run', 'current');
  }

  async saveRunState(state: RunState): Promise<void> {
    await this.db.put('run', state);
  }

  async clearRunState(): Promise<void> {
    await this.db.delete('run', 'current');
  }
}
import { Injectable } from '@angular/core';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

// --- Enums ---

export type EnemyTier = 1 | 2 | 3 | 'boss';

export type ItemType = 'potion' | 'scroll' | 'shield' | 'crit';

export type EnemyAbility =
  | 'none'
  | 'shuffle'       // Goblin Scholar — shuffles card queue
  | 'revive'        // Skeleton — revives once at 20 HP
  | 'suppress-crit' // Dark Mage — Easy deals Good damage only
  | 'troll-heal'    // Troll — heals when player rates Hard
  | 'curse'         // Lich — 2x Again in a row skips next card
  | 'no-mercy'      // Mimic — Hard treated same as Again
  | 'enrage';       // Dragon — doubles ATK at 50% HP

// --- Core Types ---

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
  lootTable: ItemType[];  // item types this enemy can drop
}

export interface Deck {
  id: string;
  name: string;
  tags: string[];
  createdAt: number;
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
  currentRoom: number;    // 1, 2, 3, then boss
  totalRooms: number;     // always 3 before boss
  currentEnemy: Enemy;
  enemyHp: number;
  consecutiveAgain: number; // tracks Lich curse
  cardQueue: string[];
  inventory: Item[];
  activeEffects: string[];
  powerups: string[];
  startedAt: number;
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
}

@Injectable({ providedIn: 'root' })
export class IndexedDbService {
  private db!: IDBPDatabase<FlashcardDungeonDB>;

  async init(): Promise<void> {
    this.db = await openDB<FlashcardDungeonDB>('flashcard-dungeon', 2, {
      upgrade(db) {
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
      },
    });
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
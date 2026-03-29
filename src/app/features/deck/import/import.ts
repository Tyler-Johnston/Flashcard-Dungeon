import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DeckImportService } from '../../../core/services/deck-import';
import { IndexedDbService, Deck, Card } from '../../../core/services/indexed-db';
import { Router } from '@angular/router';
import { EnemyService } from '../../../core/services/enemy';

const MASTERED_DAYS = 21;

export interface DeckStats {
  deck: Deck;
  cards: Card[];
  completion: number;       // 0–100
  counts: Record<number, number>; // by state
  totalCards: number;
}

export interface DeckGroup {
  label: string;
  range: string;
  decks: DeckStats[];
  collapsed: boolean;
}

function scoreCard(card: Card): number {
  if (card.state === 0) return 0;                          // New
  if (card.state === 1 || card.state === 3) return 0.25;  // Learning / Relearning
  if (card.state === 2 && card.scheduledDays >= MASTERED_DAYS) return 1; // Mastered
  return 0.75;                                             // Review, not yet mastered
}

function deckCompletion(cards: Card[]): number {
  if (cards.length === 0) return 0;
  const total = cards.reduce((sum, c) => sum + scoreCard(c), 0);
  return Math.round((total / cards.length) * 100);
}

function getGroupLabel(pct: number): string {
  if (pct >= 75) return 'Mastered';
  if (pct >= 50) return 'Adept';
  if (pct >= 25) return 'Apprentice';
  return 'Novice';
}

@Component({
  selector: 'app-import',
  imports: [CommonModule],
  templateUrl: './import.html',
  styleUrl: './import.scss',
})
export class ImportComponent {
  private importer = inject(DeckImportService);
  private idb = inject(IndexedDbService);
  private router = inject(Router);
  private enemyService = inject(EnemyService);

  deckStats = signal<DeckStats[]>([]);
  status = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  message = signal('');
  collapsedGroups = signal<Set<string>>(new Set());

  readonly heroSpriteUrl = (() => {
    const keys = ['frog', 'goober', 'knight', 'mushroom', 'minotaur', 'lich', 'mimic', 'dragon'];
    const key = keys[Math.floor(Math.random() * keys.length)];
    const variant = Math.random() < 0.5 ? 'a' : 'b';
    return `sprites/${key}_${variant}.png`;
  })();

  // Group order: Novice → Apprentice → Adept → Mastered
  readonly GROUP_ORDER = ['Novice', 'Apprentice', 'Adept', 'Mastered'];
  readonly GROUP_RANGES: Record<string, string> = {
    Novice: '0–24%',
    Apprentice: '25–49%',
    Adept: '50–74%',
    Mastered: '75–100%',
  };

  deckGroups = computed((): DeckGroup[] => {
    const stats = this.deckStats();
    const collapsed = this.collapsedGroups();

    return this.GROUP_ORDER.map(label => ({
      label,
      range: this.GROUP_RANGES[label],
      collapsed: collapsed.has(label),
      decks: stats.filter(s => getGroupLabel(s.completion) === label),
    })).filter(g => g.decks.length > 0);
  });

  async ngOnInit() {
    await this.loadDecks();
  }

  private async loadDecks() {
    const decks = await this.idb.getAllDecks();
    const stats = await Promise.all(decks.map(async deck => {
      const cards = await this.idb.getCardsByDeck(deck.id);
      const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
      cards.forEach(c => counts[c.state]++);
      return {
        deck,
        cards,
        completion: deckCompletion(cards),
        counts,
        totalCards: cards.length,
      };
    }));
    this.deckStats.set(stats);
  }

  toggleGroup(label: string) {
    const s = new Set(this.collapsedGroups());
    s.has(label) ? s.delete(label) : s.add(label);
    this.collapsedGroups.set(s);
  }

  // Returns segments for the mini progress bar on each deck card
  progressSegments(stats: DeckStats) {
    const total = stats.totalCards;
    if (total === 0) return [];
    return [
      { state: 0, pct: (stats.counts[0] / total) * 100 },
      { state: 1, pct: (stats.counts[1] / total) * 100 },
      { state: 3, pct: (stats.counts[3] / total) * 100 },
      { state: 2, pct: (stats.counts[2] / total) * 100 },
    ].filter(s => s.pct > 0);
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.status.set('loading');
    try {
      const deck = await this.importer.importFromFile(file);
      this.message.set(`Imported "${deck.name}" successfully!`);
      this.status.set('success');
      await this.loadDecks();
    } catch (e) {
      this.message.set('Import failed. Make sure it is a valid tab-separated .txt file.');
      this.status.set('error');
    }
  }

  async startRun(stats: DeckStats) {
    const cards = await this.idb.getDueCards(stats.deck.id);
    if (cards.length === 0) {
      this.message.set('No cards due for this deck right now!');
      this.status.set('error');
      return;
    }

    const firstEnemy = this.enemyService.getEnemyForRoom(1);
    await this.idb.saveRunState({
      id: 'current',
      deckId: stats.deck.id,
      hp: 100,
      maxHp: 100,
      currentRoom: 1,
      totalRooms: 3,
      currentEnemy: firstEnemy,
      enemyHp: firstEnemy.maxHp,
      consecutiveAgain: 0,
      cardQueue: cards.map(c => c.id),
      inventory: [],
      activeEffects: [],
      powerups: [],
      startedAt: Date.now(),
    });

    this.router.navigate(['/dungeon']);
  }

  openJournal(stats: DeckStats) {
    this.router.navigate(['/journal'], { queryParams: { deckId: stats.deck.id } });
  }

  async deleteDeck(stats: DeckStats) {
    for (const card of stats.cards) {
      await this.idb.deleteCard(card.id);
    }
    await this.idb.deleteDeck(stats.deck.id);
    await this.loadDecks();
  }
}
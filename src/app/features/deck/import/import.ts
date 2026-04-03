import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DeckImportService } from '../../../core/services/deck-import';
import { IndexedDbService, Deck, Card, Item, DIFFICULTIES, DifficultyConfig, Difficulty } from '../../../core/services/indexed-db';
import { Router } from '@angular/router';
import { EnemyService } from '../../../core/services/enemy';

const MASTERED_DAYS = 21;
const BASE_INVENTORY_CAP = 5;

export interface DeckStats {
  deck: Deck;
  cards: Card[];
  completion: number;
  counts: Record<number, number>;
  totalCards: number;
}

export interface DeckGroup {
  label: string;
  range: string;
  decks: DeckStats[];
  collapsed: boolean;
}

function scoreCard(card: Card): number {
  if (card.state === 0) return 0;
  if (card.state === 1 || card.state === 3) return 0.25;
  if (card.state === 2 && card.scheduledDays >= MASTERED_DAYS) return 1;
  return 0.75;
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

type ImportMode = 'file' | 'paste';

@Component({
  selector: 'app-import',
  imports: [CommonModule, FormsModule],
  templateUrl: './import.html',
  styleUrl: './import.scss',
})
export class ImportComponent {
  private importer = inject(DeckImportService);
  private idb = inject(IndexedDbService);
  private router = inject(Router);
  private enemyService = inject(EnemyService);

  deckStats = signal<DeckStats[]>([]);
  gold = signal(0);
  status = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  message = signal('');
  collapsedGroups = signal<Set<string>>(new Set());

  // Per-deck difficulty selection — keyed by deck id
  selectedDifficulties = signal<Record<string, Difficulty>>({});

  // Import mode toggle
  importMode = signal<ImportMode>('file');

  // Paste import state
  pasteText = signal('');
  pasteDeckName = signal('');

  // AI prompt helper
  aiTopic = signal('');
  promptCopied = signal(false);
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  readonly DIFFICULTIES = DIFFICULTIES;

  readonly heroSpriteUrl = (() => {
    const keys = [
      'mutant_frog', 'angry_chicken', 'knight', 'mad_mushroom',
      'minotaur', 'lich', 'mimic', 'fang', 'dragon',
    ];
    const key = keys[Math.floor(Math.random() * keys.length)];
    const variant = Math.random() < 0.5 ? 'a' : 'b';
    return `sprites/${key}_${variant}.png`;
  })();

  readonly GROUP_ORDER = ['Novice', 'Apprentice', 'Adept', 'Mastered'];
  readonly GROUP_RANGES: Record<string, string> = {
    Novice: '0–24%',
    Apprentice: '25–49%',
    Adept: '50–74%',
    Mastered: '75–100%',
  };

  /** Live preview: how many card pairs are detected in the pasted text */
  pastePreviewCount = computed(() => this.importer.previewCount(this.pasteText()));

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
    const profile = await this.idb.getProfile();
    this.gold.set(profile.gold);
  }

  private async loadDecks() {
    const decks = await this.idb.getAllDecks();
    const stats = await Promise.all(decks.map(async deck => {
      const cards = await this.idb.getCardsByDeck(deck.id);
      const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
      cards.forEach(c => counts[c.state]++);
      return { deck, cards, completion: deckCompletion(cards), counts, totalCards: cards.length };
    }));
    this.deckStats.set(stats);

    const defaults: Record<string, Difficulty> = {};
    stats.forEach(s => defaults[s.deck.id] = 'apprentice');
    this.selectedDifficulties.set(defaults);
  }

  // ─── Mode toggle ─────────────────────────────────────────────────────────────

  setImportMode(mode: ImportMode) {
    this.importMode.set(mode);
    this.status.set('idle');
  }

  // ─── AI prompt helper ─────────────────────────────────────────────────────────

  onAiTopicChange(value: string) {
    this.aiTopic.set(value);
  }

  copyAiPrompt() {
    const topic = this.aiTopic().trim();
    const topicLine = topic
      ? `The topic is: ${topic}.`
      : 'The topic is: Spanish vocabulary.';

 
    const prompt =
      `Generate a list of flashcard pairs I can study. ${topicLine}\n\n` +
      `Output ONLY the raw list — nothing else. No introduction, no explanation, no markdown, no code blocks, no backticks, no headers, no bullet points, no numbering. Just the pairs, one per line.\n\n` +
      `Format: front - back\n\n` +
      `Aim for 30–50 cards.\n\n` +
      `Example of the exact output format expected:\n` +
      `hola - hello\n` +
      `adiós - goodbye\n` +
      `gracias - thank you\n` +
      `por favor - please\n\n` +
      `Start the list immediately. Do not write anything before or after it.`;

    navigator.clipboard.writeText(prompt).then(() => {
      this.promptCopied.set(true);
      if (this.copiedTimer) clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.promptCopied.set(false), 2500);
    });
  }

  // ─── Paste import ─────────────────────────────────────────────────────────────

  onPasteTextChange(value: string) {
    this.pasteText.set(value);
  }

  onPasteDeckNameChange(value: string) {
    this.pasteDeckName.set(value);
  }

  async importFromPaste() {
    const text = this.pasteText().trim();
    const name = this.pasteDeckName().trim() || 'My Deck';

    if (!text) {
      this.message.set('Please paste some flashcard text first.');
      this.status.set('error');
      return;
    }

    this.status.set('loading');
    try {
      const deck = await this.importer.importFromText(text, name);
      this.message.set(`Imported "${deck.name}" — ${this.pastePreviewCount()} cards!`);
      this.status.set('success');
      this.pasteText.set('');
      this.pasteDeckName.set('');
      await this.loadDecks();
    } catch (e: any) {
      this.message.set(e?.message ?? 'Could not parse flashcard pairs from that text.');
      this.status.set('error');
    }
  }

  // ─── File import ──────────────────────────────────────────────────────────────

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
    } catch (e: any) {
      this.message.set(e?.message ?? 'Import failed. Check that the file has valid flashcard pairs.');
      this.status.set('error');
    }
  }

  // ─── Deck helpers ─────────────────────────────────────────────────────────────

  getDifficulty(deckId: string): Difficulty {
    return this.selectedDifficulties()[deckId] ?? 'apprentice';
  }

  getDifficultyConfig(deckId: string): DifficultyConfig {
    const id = this.getDifficulty(deckId);
    return DIFFICULTIES.find(d => d.id === id)!;
  }

  setDifficulty(deckId: string, difficulty: Difficulty) {
    this.selectedDifficulties.update(map => ({ ...map, [deckId]: difficulty }));
  }

  toggleGroup(label: string) {
    const s = new Set(this.collapsedGroups());
    s.has(label) ? s.delete(label) : s.add(label);
    this.collapsedGroups.set(s);
  }

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

  newDeck()  { this.router.navigate(['/editor']); }
  goShop()   { this.router.navigate(['/shop']); }
  goStats()  { this.router.navigate(['/stats']); }

  async startRun(stats: DeckStats) {
    const cards = await this.idb.getDueCards(stats.deck.id);
    if (cards.length === 0) {
      this.message.set('No cards due for this deck right now!');
      this.status.set('error');
      return;
    }

    const profile = await this.idb.getProfile();
    const has = (id: Parameters<typeof this.idb.hasUpgrade>[1]) =>
      this.idb.hasUpgrade(profile, id);

    const diffConfig = this.getDifficultyConfig(stats.deck.id);

    const maxHp = has('extra-hp') ? 125 : 100;
    const inventoryCap = has('extra-inventory') ? BASE_INVENTORY_CAP + 1 : BASE_INVENTORY_CAP;

    const startingInventory: Item[] = [];
    if (has('starting-shield')) {
      startingInventory.push(this.enemyService.makeItem('shield'));
    }
    if (has('random-item')) {
      const pool: ItemType[] = has('starting-shield')
        ? ['potion', 'skip', 'crit']
        : ['potion', 'skip', 'shield', 'crit'];
      const randomType = pool[Math.floor(Math.random() * pool.length)];
      startingInventory.push(this.enemyService.makeItem(randomType));
    }
    const inventory = startingInventory.slice(0, inventoryCap);

    const activeEffects: string[] = has('better-loot') ? ['better-loot'] : [];

    const firstEnemy = this.enemyService.getEnemyForRoom(1, diffConfig.totalRooms, diffConfig.id);
    const scaledMaxHp = Math.round(firstEnemy.maxHp * diffConfig.hpMult);
    const scaledEnemy = { ...firstEnemy, maxHp: scaledMaxHp };

    await this.idb.saveRunState({
      id: 'current',
      deckId: stats.deck.id,
      hp: maxHp,
      maxHp,
      currentRoom: 1,
      totalRooms: diffConfig.totalRooms,
      currentEnemy: scaledEnemy,
      enemyHp: scaledMaxHp,
      consecutiveAgain: 0,
      cardQueue: cards.map(c => c.id),
      inventory,
      inventoryCap,
      activeEffects,
      powerups: [],
      startedAt: Date.now(),
      roomsCleared: 0,
      uniqueCardsReviewed: [],
      difficulty: diffConfig.id,
      atkMult: diffConfig.atkMult,
      goldMult: diffConfig.goldMult,
      playerAtkMult: diffConfig.playerAtkMult,
      endless: false,
      endlessWave: 0,
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

type ItemType = 'potion' | 'skip' | 'shield' | 'crit';
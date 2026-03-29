import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DeckImportService } from '../../../core/services/deck-import';
import { IndexedDbService, Deck } from '../../../core/services/indexed-db';
import { Router } from '@angular/router';
import { EnemyService } from '../../../core/services/enemy';

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

  decks = signal<Deck[]>([]);
  status = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  message = signal('');

  readonly heroSpriteUrl = (() => {
    const keys = ['dragon'];
    const key = keys[Math.floor(Math.random() * keys.length)];
    const variant = Math.random() < 0.5 ? 'a' : 'b';
    return `sprites/${key}_${variant}.png`;
  })();

  async ngOnInit() {
    this.decks.set(await this.idb.getAllDecks());
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
      this.decks.set(await this.idb.getAllDecks());
    } catch (e) {
      this.message.set('Import failed. Make sure it is a valid tab-separated .txt file.');
      this.status.set('error');
    }
  }

  async startRun(deck: Deck) {
    const cards = await this.idb.getDueCards(deck.id);
    if (cards.length === 0) {
      this.message.set('No cards due for this deck right now!');
      this.status.set('error');
      return;
    }

    const firstEnemy = this.enemyService.getEnemyForRoom(1);
    await this.idb.saveRunState({
      id: 'current',
      deckId: deck.id,
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

  openJournal(deck: Deck) {
    this.router.navigate(['/journal'], { queryParams: { deckId: deck.id } });
  }

  async deleteDeck(deck: Deck) {
    const cards = await this.idb.getCardsByDeck(deck.id);
    for (const card of cards) {
      await this.idb.deleteCard(card.id);
    }
    await this.idb.deleteDeck(deck.id);
    this.decks.set(await this.idb.getAllDecks());
  }
}
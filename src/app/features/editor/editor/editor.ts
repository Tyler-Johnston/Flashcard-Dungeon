import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { IndexedDbService, Deck, Card } from '../../../core/services/indexed-db';

interface EditingCard {
  id: string;
  front: string;
  back: string;
}

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
})
export class EditorComponent implements OnInit {
  private idb = inject(IndexedDbService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // Deck state
  deck = signal<Deck | null>(null);
  deckName = signal('');
  isNewDeck = signal(false);

  // Card list
  cards = signal<Card[]>([]);

  // Inline editing
  editingCardId = signal<string | null>(null);
  editFront = signal('');
  editBack = signal('');

  // New card form
  newFront = signal('');
  newBack = signal('');
  addingCard = signal(false);

  // Confirm delete
  confirmDeleteId = signal<string | null>(null);

  // Status
  statusMsg = signal<string | null>(null);

  focusCardId = signal<string | null>(null);

  cardCount = computed(() => this.cards().length);

  async ngOnInit() {
    const deckId = this.route.snapshot.queryParamMap.get('deckId');
    const cardId = this.route.snapshot.queryParamMap.get('cardId');

    if (deckId) {
      const decks = await this.idb.getAllDecks();
      const deck = decks.find(d => d.id === deckId) ?? null;
      this.deck.set(deck);
      this.deckName.set(deck?.name ?? '');
      this.isNewDeck.set(false);
      const cards = await this.idb.getCardsByDeck(deckId);
      this.cards.set(cards);

      // If a specific card was requested, open it for editing
      if (cardId) {
        this.focusCardId.set(cardId);
        this.startEdit(cards.find(c => c.id === cardId) ?? null);
      }
    } else {
      // New deck mode
      this.isNewDeck.set(true);
      this.deck.set(null);
      this.deckName.set('');
    }
  }

  // ─── Deck ──────────────────────────────────────────────────────────────────

  async saveDeckName() {
    const name = this.deckName().trim();
    if (!name) return;

    if (this.isNewDeck()) {
      const deck: Deck = {
        id: crypto.randomUUID(),
        name,
        tags: [],
        createdAt: Date.now(),
      };
      await this.idb.saveDeck(deck);
      this.deck.set(deck);
      this.isNewDeck.set(false);
      this.flash('Deck created!');
    } else {
      const deck = this.deck();
      if (!deck) return;
      const updated = { ...deck, name };
      await this.idb.saveDeck(updated);
      this.deck.set(updated);
      this.flash('Deck name saved!');
    }
  }

  // ─── Card Editing ──────────────────────────────────────────────────────────

  startEdit(card: Card | null) {
    if (!card) return;
    this.editingCardId.set(card.id);
    this.editFront.set(card.front);
    this.editBack.set(card.back);
    this.confirmDeleteId.set(null);
  }

  cancelEdit() {
    this.editingCardId.set(null);
    this.editFront.set('');
    this.editBack.set('');
  }

  async saveEdit() {
    const id = this.editingCardId();
    const front = this.editFront().trim();
    const back = this.editBack().trim();
    if (!id || !front || !back) return;

    const card = this.cards().find(c => c.id === id);
    if (!card) return;

    // Keep all FSRS data, only update front/back
    const updated: Card = { ...card, front, back };
    await this.idb.saveCard(updated);
    this.cards.update(cs => cs.map(c => c.id === id ? updated : c));
    this.cancelEdit();
    this.flash('Card saved!');
  }

  // ─── Add Card ──────────────────────────────────────────────────────────────

  async addCard() {
    const deck = this.deck();
    if (!deck) return;

    const front = this.newFront().trim();
    const back = this.newBack().trim();
    if (!front || !back) return;

    const now = Date.now();
    const card: Card = {
      id: crypto.randomUUID(),
      deckId: deck.id,
      front,
      back,
      tags: [],
      due: now,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      lastReview: null,
    };

    await this.idb.saveCard(card);
    this.cards.update(cs => [...cs, card]);
    this.newFront.set('');
    this.newBack.set('');
    this.addingCard.set(false);
    this.flash('Card added!');
  }

  // ─── Delete Card ───────────────────────────────────────────────────────────

  requestDelete(id: string) {
    this.confirmDeleteId.set(id);
    this.editingCardId.set(null);
  }

  cancelDelete() {
    this.confirmDeleteId.set(null);
  }

  async confirmDelete() {
    const id = this.confirmDeleteId();
    if (!id) return;
    await this.idb.deleteCard(id);
    this.cards.update(cs => cs.filter(c => c.id !== id));
    this.confirmDeleteId.set(null);
    this.flash('Card deleted.');
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private flash(msg: string) {
    this.statusMsg.set(msg);
    setTimeout(() => this.statusMsg.set(null), 2000);
  }

  goBack() {
    const deck = this.deck();
    if (deck) {
      this.router.navigate(['/journal'], { queryParams: { deckId: deck.id } });
    } else {
      this.router.navigate(['/deck']);
    }
  }
}

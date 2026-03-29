import { Injectable, inject } from '@angular/core';
import { IndexedDbService, Card, Deck } from './indexed-db';

@Injectable({ providedIn: 'root' })
export class DeckImportService {
  private idb = inject(IndexedDbService);

  async importFromText(text: string, deckName: string): Promise<Deck> {
    const lines = text.split('\n');
    const cards: Card[] = [];
    let separator = '\t';

    // Parse headers
    for (const line of lines) {
      if (line.startsWith('#separator:')) {
        const sep = line.split(':')[1].trim();
        separator = sep === 'tab' ? '\t' : sep;
      }
      if (line.startsWith('#')) continue;

      // Parse card line
      const parts = line.split(separator);
      if (parts.length < 2) continue;

      const front = parts[0].trim();
      const back = parts[1].trim();
      if (!front || !back) continue;

      cards.push(this.makeCard(front, back, deckName));
    }

    const deck: Deck = {
      id: crypto.randomUUID(),
      name: deckName,
      tags: [deckName.toLowerCase().replace(/\s+/g, '-')],
      createdAt: Date.now(),
    };

    await this.idb.saveDeck(deck);
    await this.idb.saveCards(cards.map(c => ({ ...c, deckId: deck.id })));

    return deck;
  }

  async importFromFile(file: File): Promise<Deck> {
    const text = await file.text();
    const deckName = file.name.replace(/\.[^/.]+$/, ''); // strip extension
    return this.importFromText(text, deckName);
  }

  private makeCard(front: string, back: string, tag: string): Card {
    const now = Date.now();
    return {
      id: crypto.randomUUID(),
      deckId: '',          // filled in by importFromText
      front,
      back,
      tags: [tag.toLowerCase().replace(/\s+/g, '-')],
      // FSRS new card defaults
      due: now,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: 0,            // 0 = New
      lastReview: null,
    };
  }
}
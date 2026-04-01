import { Injectable, inject } from '@angular/core';
import { IndexedDbService, Card, Deck } from './indexed-db';

interface BuiltInDeck {
  builtInId: string;
  path: string;       // relative to origin, e.g. /decks/european-portuguese.txt
  name: string;       // fallback name if #deck: header is missing
}

const BUILT_IN_DECKS: BuiltInDeck[] = [
  {
    builtInId: 'builtin-european-portuguese-v1',
    path: '/decks/european-portuguese.txt',
    name: 'European Portuguese',
  },
  // add more here
];

@Injectable({ providedIn: 'root' })
export class DeckImportService {
  private idb = inject(IndexedDbService);

  /** Call once from AppComponent.ngOnInit — idempotent, safe every launch. */
  async seedBuiltInDecks(): Promise<void> {
    const existingDecks = await this.idb.getAllDecks();
    const seededIds = new Set(existingDecks.map(d => d.builtInId).filter(Boolean));

    for (const entry of BUILT_IN_DECKS) {
      if (seededIds.has(entry.builtInId)) continue;
      try {
        const res = await fetch(entry.path);
        if (!res.ok) continue;
        const text = await res.text();
        await this.importFromText(text, entry.name, entry.builtInId);
      } catch {
        console.warn(`Failed to seed built-in deck: ${entry.builtInId}`);
      }
    }
  }

  async importFromFile(file: File): Promise<Deck> {
    const text = await file.text();
    const deckName = file.name.replace(/\.[^/.]+$/, '');
    return this.importFromText(text, deckName);
  }

  async importFromText(text: string, deckName: string, builtInId?: string): Promise<Deck> {
    const lines = text.split('\n');
    let separator = '\t';

    for (const line of lines) {
      if (line.startsWith('#separator:')) {
        const sep = line.split(':')[1].trim();
        separator = sep === 'tab' ? '\t' : sep;
      }
      if (line.startsWith('#deck:')) {
        deckName = line.split(':').slice(1).join(':').trim();
      }
    }

    const deck: Deck = {
      id: crypto.randomUUID(),
      name: deckName,
      tags: [deckName.toLowerCase().replace(/\s+/g, '-')],
      createdAt: Date.now(),
      ...(builtInId ? { builtInId } : {}),
    };

    const cards: Card[] = [];
    for (const line of lines) {
      if (!line.trim() || line.startsWith('#')) continue;
      const parts = line.split(separator);
      if (parts.length < 2) continue;
      const front = parts[0].trim();
      const back = parts.slice(1).join(separator).trim();
      if (!front || !back) continue;
      cards.push(this.makeCard(front, back, deckName));
    }

    await this.idb.saveDeck(deck);
    await this.idb.saveCards(cards.map(c => ({ ...c, deckId: deck.id })));
    return deck;
  }

  private makeCard(front: string, back: string, tag: string): Card {
    const now = Date.now();
    return {
      id: crypto.randomUUID(),
      deckId: '',
      front,
      back,
      tags: [tag.toLowerCase().replace(/\s+/g, '-')],
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
  }
}
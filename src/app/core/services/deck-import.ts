import { Injectable, inject } from '@angular/core';
import { IndexedDbService, Deck, Card } from './indexed-db';

@Injectable({ providedIn: 'root' })
export class DeckImportService {
  private idb = inject(IndexedDbService);

  // ─── Format auto-detection & parsing ────────────────────────────────────────

  /**
   * Auto-detect flashcard format and parse into front/back pairs.
   * Supports (in priority order):
   *   1. Tab-separated       "front\tback"
   *   2. Q:/A: labels        "Q: front\nA: back"
   *   3. Arrow-separated     "front → back"  or  "front -> back"
   *   4. Pipe-separated      "front | back"
   *   5. Comma-separated     "front, back"  (short values only)
   *   6. Alternating lines   "front\nback\nfront\nback"
   */
  parseFlashcardText(raw: string): { front: string; back: string }[] {
    const lines = raw
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('#')); // skip comments/blank

    if (lines.length === 0) return [];

    // 1. Tab-separated (Anki export default)
    if (lines.some(l => l.includes('\t'))) {
      return lines
        .map(l => l.split('\t'))
        .filter(p => p.length >= 2)
        .map(p => ({ front: p[0].trim(), back: p.slice(1).join('\t').trim() }));
    }

    // 2. Q:/A: labeled pairs
    const qPat = /^[Qq][:\.]?\s+(.+)/;
    const aPat = /^[Aa][:\.]?\s+(.+)/;
    if (lines.some(l => qPat.test(l))) {
      const pairs: { front: string; back: string }[] = [];
      let front = '';
      for (const line of lines) {
        const qm = line.match(qPat);
        const am = line.match(aPat);
        if (qm) {
          front = qm[1].trim();
        } else if (am && front) {
          pairs.push({ front, back: am[1].trim() });
          front = '';
        }
      }
      return pairs;
    }

    // 3. Arrow or spaced-dash separated  (→  ->  " - ")
    // " - " requires spaces on both sides to avoid splitting hyphenated words.
    const arrowOrDash = /\s*(?:→|->)\s*| - /;
    if (lines.some(l => arrowOrDash.test(l))) {
      return lines
        .map(l => l.split(arrowOrDash))
        .filter(p => p.length >= 2)
        .map(p => ({ front: p[0].trim(), back: p.slice(1).join(' - ').trim() }));
    }

    // 4. Pipe-separated
    if (lines.some(l => l.includes('|'))) {
      return lines
        .map(l => l.split('|'))
        .filter(p => p.length >= 2)
        .map(p => ({ front: p[0].trim(), back: p.slice(1).join('|').trim() }));
    }

    // 5. Comma-separated — only when values are short (vocabulary style)
    const commaSplit = lines.map(l => l.split(','));
    const looksLikeCSV =
      commaSplit.every(p => p.length >= 2) &&
      commaSplit.every(p => p[0].length < 100 && p[1].length < 100);
    if (looksLikeCSV) {
      return commaSplit.map(p => ({
        front: p[0].trim(),
        back: p.slice(1).join(',').trim(),
      }));
    }

    // 6. Fallback: alternating lines
    const pairs: { front: string; back: string }[] = [];
    for (let i = 0; i + 1 < lines.length; i += 2) {
      pairs.push({ front: lines[i], back: lines[i + 1] });
    }
    return pairs;
  }

  // ─── Core import helpers ─────────────────────────────────────────────────────

  private async importPairs(
    pairs: { front: string; back: string }[],
    name: string,
    builtInId?: string
  ): Promise<Deck> {
    const deckId = crypto.randomUUID();
    const now = Date.now();
    const deck: Deck = {
      id: deckId,
      name,
      createdAt: now,
      tags: [],
      ...(builtInId ? { builtInId } : {}),
    };
    await this.idb.saveDeck(deck);

    for (const pair of pairs) {
      const card: Card = {
        id: crypto.randomUUID(),
        deckId,
        front: pair.front,
        back: pair.back,
        state: 0,
        due: now,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        reps: 0,
        lapses: 0,
        lastReview: now,
        tags: [],
      };
      await this.idb.saveCard(card);
    }

    return deck;
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /** Import from a .txt File object — auto-detects format. */
  async importFromFile(file: File): Promise<Deck> {
    const text = await file.text();
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    const pairs = this.parseFlashcardText(text);
    if (pairs.length === 0) throw new Error('No valid flashcard pairs found in file.');
    return this.importPairs(pairs, name);
  }

  /** Import from pasted text with an explicit deck name. */
  async importFromText(raw: string, name: string): Promise<Deck> {
    const pairs = this.parseFlashcardText(raw);
    if (pairs.length === 0) throw new Error('No valid flashcard pairs found.');
    return this.importPairs(pairs, name);
  }

  /** Preview how many cards would be parsed from text (for live feedback). */
  previewCount(raw: string): number {
    if (!raw.trim()) return 0;
    return this.parseFlashcardText(raw).length;
  }

  // ─── Built-in deck seeding ───────────────────────────────────────────────────

  async seedBuiltInDecks(): Promise<void> {
    const builtIns: Array<{ builtInId: string; name: string; path: string }> = [
      {
        builtInId: 'builtin-european-portuguese-v1',
        name: 'European Portuguese',
        path: '/decks/european-portuguese.txt',
      },
    ];

    const existingDecks = await this.idb.getAllDecks();

    for (const spec of builtIns) {
      const alreadyExists = existingDecks.some(
        (d: Deck) => (d as any).builtInId === spec.builtInId
      );
      if (alreadyExists) continue;

      try {
        const res = await fetch(spec.path);
        if (!res.ok) continue;
        const text = await res.text();
        const pairs = this.parseFlashcardText(text);
        if (pairs.length > 0) {
          await this.importPairs(pairs, spec.name, spec.builtInId);
        }
      } catch {
        // Silently skip — offline or file missing
      }
    }
  }
}
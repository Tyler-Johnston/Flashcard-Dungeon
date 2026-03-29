import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { IndexedDbService, Card, Deck } from '../../../core/services/indexed-db';

export const STATE_LABELS: Record<number, string> = {
  0: 'New',
  1: 'Learning',
  2: 'Review',
  3: 'Relearning',
};

// Display order for state groups
const STATE_ORDER = [1, 3, 2, 0]; // Learning → Relearning → Review → New

export interface StateGroup {
  state: number;
  label: string;
  cards: Card[];
  collapsed: boolean;
}

@Component({
  selector: 'app-journal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './journal.html',
  styleUrl: './journal.scss',
})
export class JournalComponent implements OnInit {
  private idb = inject(IndexedDbService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly STATE_LABELS = STATE_LABELS;

  decks = signal<Deck[]>([]);
  cards = signal<Card[]>([]);
  selectedDeckId = signal<string | null>(null);
  selectedTag = signal<string>('all');
  search = signal('');
  collapsedStates = signal<Set<number>>(new Set());

  availableTags = computed(() => {
    const tags = new Set<string>();
    this.cards().forEach(c => c.tags.forEach(t => tags.add(t)));
    return ['all', ...Array.from(tags).sort()];
  });

  filteredCards = computed(() => {
    const q = this.search().trim().toLowerCase();
    const tag = this.selectedTag();
    return this.cards().filter(c => {
      const matchesTag = tag === 'all' || c.tags.includes(tag);
      const matchesSearch = !q ||
        c.front.toLowerCase().includes(q) ||
        c.back.toLowerCase().includes(q);
      return matchesTag && matchesSearch;
    });
  });

  groupedCards = computed((): StateGroup[] => {
    const cards = this.filteredCards();
    const collapsed = this.collapsedStates();
    return STATE_ORDER.map(state => ({
      state,
      label: STATE_LABELS[state],
      cards: cards.filter(c => c.state === state),
      collapsed: collapsed.has(state),
    })).filter(g => g.cards.length > 0);
  });

  progressSegments = computed(() => {
    const all = this.cards();
    const total = all.length;
    if (total === 0) return [];
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    all.forEach(c => counts[c.state]++);
    return STATE_ORDER
      .map(state => ({ state, count: counts[state], pct: (counts[state] / total) * 100 }))
      .filter(s => s.pct > 0);
  });

  async ngOnInit() {
    const decks = await this.idb.getAllDecks();
    this.decks.set(decks);
    if (decks.length === 0) return;
    const paramId = this.route.snapshot.queryParamMap.get('deckId');
    const target = paramId && decks.find(d => d.id === paramId) ? paramId : decks[0].id;
    await this.selectDeck(target);
  }

  async selectDeck(id: string) {
    this.selectedDeckId.set(id);
    this.selectedTag.set('all');
    const cards = await this.idb.getCardsByDeck(id);
    this.cards.set(cards);
  }

  editDeck() {
  const id = this.selectedDeckId();
  if (id) this.router.navigate(['/editor'], { queryParams: { deckId: id } });
  }

  editCard(card: Card) {
    const id = this.selectedDeckId();
    if (id) this.router.navigate(['/editor'], { queryParams: { deckId: id, cardId: card.id } });
  }

  setTag(tag: string) { this.selectedTag.set(tag); }
  setSearch(value: string) { this.search.set(value); }

  toggleGroup(state: number) {
    const s = new Set(this.collapsedStates());
    s.has(state) ? s.delete(state) : s.add(state);
    this.collapsedStates.set(s);
  }

  formatInterval(card: Card): string {
    if (card.state === 0) return 'New';
    const diff = card.due - Date.now();
    if (diff <= 0) return 'Due now';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 24) return `in ${hrs}h`;
    const days = Math.floor(diff / 86400000);
    if (days < 30) return `in ${days}d`;
    const weeks = Math.floor(days / 7);
    if (weeks < 8) return `in ${weeks}w`;
    const months = Math.floor(days / 30);
    return `in ${months}mo`;
  }

  goBack() { this.router.navigate(['/deck']); }
}
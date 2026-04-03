import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IndexedDbService, PlayerStats, defaultStats } from '../../core/services/indexed-db';

const ENEMY_NAMES: Record<string, string> = {
  frog:          'Mutant Frog',
  angry_chicken: 'Angry Chicken',
  knight:        'Knight',
  mushroom:      'Mad Mushroom',
  minotaur:      'Minotaur',
  lich:          'Lich',
  mimic:         'Mimic',
  fang:          'Fang',
  dragon:        'Dragon',
  orc:           'Orc Warlord',
  chicken_army:  'Chicken Army',
  turtle:        'Mutant Turtle',
};

const ENEMY_SPRITE_KEYS: Record<string, string> = {
  frog:          'mutant_frog',
  angry_chicken: 'angry_chicken',
  knight:        'knight',
  mushroom:      'mad_mushroom',
  minotaur:      'minotaur',
  lich:          'lich',
  mimic:         'mimic',
  fang:          'fang',
  dragon:        'dragon',
  orc:           'orc',
  chicken_army:  'chicken_army',
  turtle:        'mutant_turtle',
};

const ITEM_NAMES: Record<string, string> = {
  potion: 'Health Potion',
  shield: 'Iron Shield',
  skip:   'Bomb',
  crit:   'Iron Sword',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  novice:     'Novice',
  apprentice: 'Apprentice',
  adept:      'Adept',
  master:     'Master',
};

function sortedEntries(rec: Record<string, number>): [string, number][] {
  return (Object.entries(rec) as [string, number][]).sort((a, b) => b[1] - a[1]);
}

@Component({
  selector: 'app-stats',
  imports: [CommonModule],
  templateUrl: './stats.html',
  styleUrl: './stats.scss',
})
export class StatsComponent implements OnInit {
  private idb    = inject(IndexedDbService);
  private router = inject(Router);

  stats = signal<PlayerStats>(defaultStats());
  gold  = signal(0);

  winRate = computed(() => {
    const s = this.stats();
    const finished = s.runsWon + s.runsLost;
    if (finished === 0) return null;
    return Math.round((s.runsWon / finished) * 100);
  });

  runsAbandoned = computed(() => {
    const s = this.stats();
    return Math.max(0, s.runsStarted - s.runsWon - s.runsLost);
  });

  nemesis = computed(() => {
    const entries = sortedEntries(this.stats().enemiesKilledBy);
    if (entries.length === 0) return null;
    const [id, deaths] = entries[0];
    return { id, name: ENEMY_NAMES[id] ?? id, deaths };
  });

  topKills = computed(() =>
    sortedEntries(this.stats().enemiesDefeated)
      .slice(0, 5)
      .map(([id, kills]) => ({ id, name: ENEMY_NAMES[id] ?? id, kills }))
  );

  topKillers = computed(() =>
    sortedEntries(this.stats().enemiesKilledBy)
      .slice(0, 5)
      .map(([id, deaths]) => ({ id, name: ENEMY_NAMES[id] ?? id, deaths }))
  );

  ratingDistribution = computed(() => {
    const { again, hard, good, easy } = this.stats().ratingCounts;
    const total = again + hard + good + easy;
    if (total === 0) return null;
    return {
      again: Math.round((again / total) * 100),
      hard:  Math.round((hard  / total) * 100),
      good:  Math.round((good  / total) * 100),
      easy:  Math.round((easy  / total) * 100),
      total,
    };
  });

  recallRate = computed(() => {
    const d = this.ratingDistribution();
    return d ? d.good + d.easy : null;
  });

  topItem = computed(() => {
    const entries = sortedEntries(this.stats().itemsUsed ?? {});
    if (entries.length === 0) return null;
    const [type, count] = entries[0];
    return { type, label: ITEM_NAMES[type] ?? type, count };
  });

  bestRunLabel = computed(() => {
    const b = this.stats().bestRun;
    if (!b) return null;
    const isEndless = b.difficulty.startsWith('endless-');
    const baseDiff  = b.difficulty.replace('endless-', '');
    const diffLabel = DIFFICULTY_LABELS[baseDiff] ?? baseDiff;
    if (isEndless) {
      return `${b.deckName} · ${diffLabel} · ∞ Wave ${b.roomsCleared}`;
    }
    return `${b.deckName} · ${diffLabel} · ${b.roomsCleared} rooms`;
  });

  async ngOnInit() {
    const profile = await this.idb.getProfile();
    this.stats.set({ ...defaultStats(), ...(profile.stats ?? {}) });
    this.gold.set(profile.gold ?? 0);
  }

  spriteUrl(enemyId: string): string {
    const key = ENEMY_SPRITE_KEYS[enemyId] ?? enemyId;
    return `sprites/${key}_a.png`;
  }

  goBack() { this.router.navigate(['/deck']); }
}
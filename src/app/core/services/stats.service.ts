// app/core/services/stats.ts
// Drop this file in alongside enemy.ts, fsrs.ts, etc.
// Call these methods from card-battle.ts at the appropriate moments.

import { Injectable, inject } from '@angular/core';
import { IndexedDbService } from './indexed-db';
import { PlayerStats, defaultStats } from './indexed-db';

@Injectable({ providedIn: 'root' })
export class StatsService {
  private idb = inject(IndexedDbService);

  // ── Called from startRun() in import.ts ────────────────────────────────────
  async recordRunStarted(): Promise<void> {
    await this.idb.updateStats(s => { s.runsStarted++; });
  }

  // ── Called when player HP hits 0 in card-battle.ts ────────────────────────
  async recordRunLost(killedByEnemyId: string): Promise<void> {
    await this.idb.updateStats(s => {
      s.runsLost++;
      s.enemiesKilledBy[killedByEnemyId] =
        (s.enemiesKilledBy[killedByEnemyId] ?? 0) + 1;
    });
  }

  // ── Called when the last room is cleared in card-battle.ts ────────────────
  async recordRunWon(opts: {
    roomsCleared: number;
    difficulty: string;
    deckName: string;
    goldEarned: number;
  }): Promise<void> {
    await this.idb.updateStats(s => {
      s.runsWon++;
      s.totalGoldEarned += opts.goldEarned;
      if (
        !s.bestRun ||
        opts.roomsCleared > s.bestRun.roomsCleared ||
        (opts.roomsCleared === s.bestRun.roomsCleared &&
          ['novice','apprentice','adept','master'].indexOf(opts.difficulty) >
          ['novice','apprentice','adept','master'].indexOf(s.bestRun.difficulty))
      ) {
        s.bestRun = {
          roomsCleared: opts.roomsCleared,
          difficulty: opts.difficulty,
          deckName: opts.deckName,
          date: Date.now(),
        };
      }
    });
  }

  // ── Called when an enemy dies in card-battle.ts ───────────────────────────
  async recordEnemyDefeated(enemyId: string): Promise<void> {
    await this.idb.updateStats(s => {
      s.enemiesDefeated[enemyId] = (s.enemiesDefeated[enemyId] ?? 0) + 1;
    });
  }

  // ── Called on every card rating in card-battle.ts ────────────────────────
  async recordCardRated(opts: {
    rating: 'again' | 'hard' | 'good' | 'easy';
    cardId: string;
    damageDealt: number;
    damageTaken: number;
  }): Promise<void> {
    await this.idb.updateStats(s => {
      s.totalReviews++;
      s.ratingCounts[opts.rating]++;
      s.totalDamageDealt += opts.damageDealt;
      s.totalDamageTaken += opts.damageTaken;

      // Track hardest cards (most Again presses)
      if (opts.rating === 'again') {
        const existing = s.hardestCards.find(c => c.cardId === opts.cardId);
        if (existing) {
          existing.againCount++;
        } else {
          s.hardestCards.push({ cardId: opts.cardId, againCount: 1 });
        }
        // Keep only top 10, sorted descending
        s.hardestCards.sort((a, b) => b.againCount - a.againCount);
        s.hardestCards = s.hardestCards.slice(0, 10);
      }

      // Streak logic
      const today = new Date().toISOString().slice(0, 10);
      if (s.lastStudiedDate !== today) {
        const yesterday = new Date(Date.now() - 86400000)
          .toISOString().slice(0, 10);
        if (s.lastStudiedDate === yesterday) {
          s.studyStreakDays++;
        } else {
          s.studyStreakDays = 1;
        }
        s.longestStreak = Math.max(s.longestStreak, s.studyStreakDays);
        s.lastStudiedDate = today;
      }
    });
  }

  // ── Called when an item is used in card-battle.ts ────────────────────────
  async recordItemUsed(itemType: string): Promise<void> {
    await this.idb.updateStats(s => {
      s.itemsUsed[itemType] = (s.itemsUsed[itemType] ?? 0) + 1;
    });
  }
}

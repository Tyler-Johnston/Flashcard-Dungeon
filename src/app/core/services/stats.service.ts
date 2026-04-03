import { Injectable, inject } from '@angular/core';
import { IndexedDbService, defaultStats } from './indexed-db';

@Injectable({ providedIn: 'root' })
export class StatsService {
  private idb = inject(IndexedDbService);

  async recordRunStarted(): Promise<void> {
    await this.idb.updateStats(s => { s.runsStarted++; });
  }

  async recordRunLost(killedByEnemyId: string): Promise<void> {
    await this.idb.updateStats(s => {
      s.runsLost++;
      s.enemiesKilledBy[killedByEnemyId] = (s.enemiesKilledBy[killedByEnemyId] ?? 0) + 1;
    });
  }

  async recordRunWon(opts: {
    roomsCleared: number;
    difficulty: string;
    deckName: string;
    goldEarned: number;
  }): Promise<void> {
    const diffOrder = ['novice', 'apprentice', 'adept', 'master'];
    await this.idb.updateStats(s => {
      s.runsWon++;
      s.totalGoldEarned += opts.goldEarned;
      if (
        !s.bestRun ||
        opts.roomsCleared > s.bestRun.roomsCleared ||
        (opts.roomsCleared === s.bestRun.roomsCleared &&
          diffOrder.indexOf(opts.difficulty) > diffOrder.indexOf(s.bestRun.difficulty))
      ) {
        s.bestRun = {
          roomsCleared: opts.roomsCleared,
          difficulty:   opts.difficulty,
          deckName:     opts.deckName,
          date:         Date.now(),
        };
      }
    });
  }

  async recordEndlessExit(opts: {
    endlessWave: number;
    difficulty: string;
    deckName: string;
  }): Promise<void> {
    await this.idb.updateStats(s => {
      const endlessDiff = `endless-${opts.difficulty}`;
      const currentIsEndless = s.bestRun?.difficulty?.startsWith('endless-') ?? false;
      const isBetter =
        !s.bestRun ||
        !currentIsEndless ||
        opts.endlessWave > s.bestRun.roomsCleared;

      if (isBetter) {
        s.bestRun = {
          roomsCleared: opts.endlessWave,
          difficulty:   endlessDiff,
          deckName:     opts.deckName,
          date:         Date.now(),
        };
      }
    });
  }

  async recordEnemyDefeated(enemyId: string): Promise<void> {
    await this.idb.updateStats(s => {
      s.enemiesDefeated[enemyId] = (s.enemiesDefeated[enemyId] ?? 0) + 1;
    });
  }

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

      if (opts.rating === 'again') {
        const existing = s.hardestCards.find(c => c.cardId === opts.cardId);
        if (existing) {
          existing.againCount++;
        } else {
          s.hardestCards.push({ cardId: opts.cardId, againCount: 1 });
        }
        s.hardestCards.sort((a, b) => b.againCount - a.againCount);
        s.hardestCards = s.hardestCards.slice(0, 10);
      }

      const today = new Date().toISOString().slice(0, 10);
      if (s.lastStudiedDate !== today) {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        s.studyStreakDays = s.lastStudiedDate === yesterday ? s.studyStreakDays + 1 : 1;
        s.longestStreak = Math.max(s.longestStreak, s.studyStreakDays);
        s.lastStudiedDate = today;
      }
    });
  }

  async recordItemUsed(itemType: string): Promise<void> {
    await this.idb.updateStats(s => {
      s.itemsUsed[itemType] = (s.itemsUsed[itemType] ?? 0) + 1;
    });
  }
}
import { Injectable } from '@angular/core';
import {
  fsrs,
  generatorParameters,
  Rating,
  Card as FsrsCard,
} from 'ts-fsrs';
import { Card } from './indexed-db';

export { Rating };

@Injectable({ providedIn: 'root' })
export class FsrsService {
  private f = fsrs(generatorParameters({ enable_fuzz: true }));

  grade(card: Card, rating: Rating): Card {
    const fsrsCard = this.toFsrsCard(card);
    const now = new Date();
    const record = this.f.repeat(fsrsCard, now);

    // Rating.Manual exists in this version but isn't a valid play action
    // so we cast to any to index safely
    const result = (record as any)[rating].card;

    return {
      ...card,
      due: result.due.getTime(),
      stability: result.stability,
      difficulty: result.difficulty,
      elapsedDays: result.elapsed_days,
      scheduledDays: result.scheduled_days,
      reps: result.reps,
      lapses: result.lapses,
      state: result.state as 0 | 1 | 2 | 3,
      lastReview: now.getTime(),
    };
  }

  getDamage(rating: Rating): number {
    const damageMap: Partial<Record<Rating, number>> = {
      [Rating.Again]: -5,
      [Rating.Hard]: 10,
      [Rating.Good]: 25,
      [Rating.Easy]: 50,
    };
    return damageMap[rating] ?? 0;
  }

  private toFsrsCard(card: Card): FsrsCard {
    return {
      due: new Date(card.due),
      stability: card.stability,
      difficulty: card.difficulty,
      elapsed_days: card.elapsedDays,
      scheduled_days: card.scheduledDays,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state,
      last_review: card.lastReview ? new Date(card.lastReview) : undefined,
      learning_steps: 0,  // required by this version of ts-fsrs
    };
  }
}
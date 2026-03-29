import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IndexedDbService, Card } from '../../../core/services/indexed-db';
import { FsrsService, Rating } from '../../../core/services/fsrs';
import { HpBarComponent } from '../../../shared/components/hp-bar/hp-bar';

@Component({
  selector: 'app-card-battle',
  imports: [CommonModule, HpBarComponent],
  templateUrl: './card-battle.html',
  styleUrl: './card-battle.scss',
})
export class CardBattleComponent implements OnInit {
  private idb = inject(IndexedDbService);
  private fsrs = inject(FsrsService);
  private router = inject(Router);

  queue = signal<Card[]>([]);
  currentIndex = signal(0);
  flipped = signal(false);
  playerHp = signal(100);
  enemyHp = signal(100);
  damage = signal<number | null>(null);
  runOver = signal(false);

  readonly Rating = Rating;

  currentCard = computed(() => this.queue()[this.currentIndex()]);
  hasCards = computed(() => this.currentIndex() < this.queue().length);

  async ngOnInit() {
    const run = await this.idb.getRunState();
    if (!run) {
      this.router.navigate(['/deck']);
      return;
    }

    const allCards = await this.idb.getDueCards(run.deckId);
    this.queue.set(allCards);
    this.playerHp.set(run.hp);
    this.enemyHp.set(100);
  }

  flip() {
    if (!this.flipped()) this.flipped.set(true);
  }

  async rate(rating: Rating) {
    const card = this.currentCard();
    if (!card || !this.flipped()) return;

    // Update FSRS scheduling
    const updated = this.fsrs.grade(card, rating);
    await this.idb.saveCard(updated);

    // Apply damage
    const dmg = this.fsrs.getDamage(rating);
    this.damage.set(dmg);
    setTimeout(() => this.damage.set(null), 800);

    if (dmg >= 0) {
      this.enemyHp.update(hp => Math.max(0, hp - dmg));
    } else {
      // dmg is negative on Again — subtract from player HP
      this.playerHp.update(hp => Math.max(0, hp + dmg));
    }

    // Advance to next card first
    this.flipped.set(false);
    this.currentIndex.update(i => i + 1);

    // Then check end conditions
    if (this.playerHp() <= 0 || this.enemyHp() <= 0 || !this.hasCards()) {
      this.runOver.set(true);
    }
  }

  goBack() {
    this.idb.clearRunState();
    this.router.navigate(['/deck']);
  }

  playAgain() {
    this.router.navigate(['/deck']);
  }
}
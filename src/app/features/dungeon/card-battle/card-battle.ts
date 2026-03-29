import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IndexedDbService, Card, RunState, Item } from '../../../core/services/indexed-db';
import { FsrsService, Rating } from '../../../core/services/fsrs';
import { EnemyService } from '../../../core/services/enemy';
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
  protected enemyService = inject(EnemyService);
  private router = inject(Router);

  readonly Rating = Rating;
  readonly INVENTORY_CAP = 5;

  // Run state
  run = signal<RunState | null>(null);
  queue = signal<Card[]>([]);
  currentIndex = signal(0);

  // Battle UI state
  flipped = signal(false);
  damage = signal<number | null>(null);
  damageTarget = signal<'enemy' | 'player' | null>(null);
  runOver = signal(false);
  victory = signal(false);

  // Loot state
  lootOffer = signal<Item[] | null>(null);
  pendingNextRoom = signal(false);

  // Item use feedback
  statusMessage = signal<string | null>(null);

  currentCard = computed(() => this.queue()[this.currentIndex()]);
  hasCards = computed(() => this.currentIndex() < this.queue().length);
  enemyHp = computed(() => this.run()?.enemyHp ?? 0);
  playerHp = computed(() => this.run()?.hp ?? 0);
  inventory = computed(() => this.run()?.inventory ?? []);
  currentEnemy = computed(() => this.run()?.currentEnemy ?? null);
  currentRoom = computed(() => this.run()?.currentRoom ?? 1);

  async ngOnInit() {
    const run = await this.idb.getRunState();
    if (!run) {
      this.router.navigate(['/deck']);
      return;
    }

    // Apply shuffle ability on entry
    let cards = await this.idb.getDueCards(run.deckId);
    if (run.currentEnemy.ability === 'shuffle') {
      cards = this.shuffleArray(cards);
      this.showStatus(`${run.currentEnemy.name} shuffles your cards!`);
    }

    this.queue.set(cards);
    this.run.set(run);
  }

  flip() {
    if (!this.flipped()) this.flipped.set(true);
  }

  async rate(rating: Rating) {
    const card = this.currentCard();
    const run = this.run();
    if (!card || !this.flipped() || !run) return;

    let effectiveRating = rating;
    const enemy = run.currentEnemy;

    // Apply enemy abilities that modify ratings
    if (enemy.ability === 'suppress-crit' && rating === Rating.Easy) {
      effectiveRating = Rating.Good;
      this.showStatus('Dark Mage suppresses your crit!');
    }
    if (enemy.ability === 'no-mercy' && rating === Rating.Hard) {
      effectiveRating = Rating.Again;
      this.showStatus('Mimic shows no mercy — Hard treated as Again!');
    }

    // Update FSRS
    const updated = this.fsrs.grade(card, effectiveRating);
    await this.idb.saveCard(updated);

    // Calculate damage
    let playerDmg = 0;
    let enemyDmg = 0;
    let newConsecutiveAgain = run.consecutiveAgain;

    if (effectiveRating === Rating.Again) {
      playerDmg = enemy.atk;
      newConsecutiveAgain++;
    } else if (effectiveRating === Rating.Hard) {
      playerDmg = Math.floor(enemy.atk / 2);
      newConsecutiveAgain = 0;

      // Troll heals on Hard
      if (enemy.ability === 'troll-heal') {
        const newEnemyHp = Math.min(enemy.maxHp, run.enemyHp + 15);
        await this.updateRun({ enemyHp: newEnemyHp, consecutiveAgain: 0 });
        this.showStatus('Troll heals 15 HP!');
      }
    } else if (effectiveRating === Rating.Good) {
      enemyDmg = 25;
      newConsecutiveAgain = 0;
    } else if (effectiveRating === Rating.Easy) {
      enemyDmg = 60;
      newConsecutiveAgain = 0;
    }

    // Apply crit active effect
    if (effectiveRating === Rating.Good && run.activeEffects.includes('crit')) {
      enemyDmg = 60;
      const newEffects = run.activeEffects.filter(e => e !== 'crit');
      await this.updateRun({ activeEffects: newEffects });
      this.showStatus('Crit Scroll activates!');
    }

    // Lich curse — skip next card after 2x Again
    let skipNext = false;
    if (enemy.ability === 'curse' && newConsecutiveAgain >= 2) {
      skipNext = true;
      newConsecutiveAgain = 0;
      this.showStatus('Lich curses you — next card skipped!');
    }

    // Check shield
    let newInventory = [...run.inventory];
    if (playerDmg > 0) {
      const shieldIdx = newInventory.findIndex(i => i.type === 'shield');
      if (shieldIdx !== -1) {
        newInventory.splice(shieldIdx, 1);
        playerDmg = 0;
        this.showStatus('Shield blocks the attack!');
      }
    }

    // Apply damage
    const newPlayerHp = Math.max(0, run.hp - playerDmg);
    let newEnemyHp = Math.max(0, run.enemyHp - enemyDmg);

    // Flash damage indicator
    if (playerDmg > 0) {
      this.damage.set(-playerDmg);
      this.damageTarget.set('player');
    } else if (enemyDmg > 0) {
      this.damage.set(enemyDmg);
      this.damageTarget.set('enemy');
    }
    setTimeout(() => { this.damage.set(null); this.damageTarget.set(null); }, 800);

    // Skeleton revive
    let skeletonRevived = run.activeEffects.includes('revive-used');
    if (enemy.ability === 'revive' && newEnemyHp <= 0 && !skeletonRevived) {
      newEnemyHp = 20;
      skeletonRevived = true;
      await this.updateRun({ activeEffects: [...run.activeEffects, 'revive-used'] });
      this.showStatus('Skeleton revives at 20 HP!');
    }

    // Dragon enrage
    let currentAtk = enemy.atk;
    if (enemy.ability === 'enrage' && newEnemyHp <= enemy.maxHp / 2 && !run.activeEffects.includes('enraged')) {
      await this.updateRun({ activeEffects: [...run.activeEffects, 'enraged'] });
      this.showStatus('Dragon enrages — ATK doubled!');
    }
    if (run.activeEffects.includes('enraged')) {
      currentAtk = enemy.atk * 2;
    }

    // Save updated run
    await this.updateRun({
      hp: newPlayerHp,
      enemyHp: newEnemyHp,
      inventory: newInventory,
      consecutiveAgain: newConsecutiveAgain,
    });

    // Advance card
    let nextIndex = this.currentIndex() + 1;
    if (skipNext) nextIndex++;
    this.currentIndex.set(nextIndex);
    this.flipped.set(false);

    // Check player death
    if (newPlayerHp <= 0) {
      this.runOver.set(true);
      return;
    }

    // Check enemy defeated
    if (newEnemyHp <= 0) {
      await this.handleEnemyDefeated();
      return;
    }

    // Check out of cards
    if (!this.hasCards()) {
      this.runOver.set(true);
    }
  }

  // --- Item Usage ---

  async useItem(item: Item) {
    const run = this.run();
    if (!run) return;

    let updates: Partial<RunState> = {};
    const newInventory = run.inventory.filter(i => i.id !== item.id);

    switch (item.type) {
      case 'potion':
        updates.hp = Math.min(run.maxHp, run.hp + 30);
        this.showStatus('Potion restores 30 HP!');
        break;
      case 'scroll':
        this.currentIndex.update(i => i + 1);
        this.flipped.set(false);
        this.showStatus('Scroll skips the current card!');
        break;
      case 'shield':
        this.showStatus('Shield readied — next Again blocked!');
        break;
      case 'crit':
        updates.activeEffects = [...run.activeEffects, 'crit'];
        this.showStatus('Crit Scroll ready — next Good = Easy damage!');
        break;
    }

    updates.inventory = newInventory;
    await this.updateRun(updates);
  }

  // --- Loot ---

  async handleEnemyDefeated() {
    const run = this.run();
    if (!run) return;

    const offer = this.enemyService.rollLoot(run.currentEnemy);
    if (offer) {
      this.lootOffer.set(offer);
      this.pendingNextRoom.set(true);
    } else {
      await this.advanceRoom();
    }
  }

  async takeLoot(item: Item) {
    const run = this.run();
    if (!run) return;

    if (run.inventory.length >= this.INVENTORY_CAP) {
      // At cap — don't auto-take, let discard flow handle it
      return;
    }

    await this.updateRun({ inventory: [...run.inventory, item] });
    this.lootOffer.set(null);
    await this.advanceRoom();
  }

  async discardAndTake(discard: Item, take: Item) {
    const run = this.run();
    if (!run) return;

    const newInventory = run.inventory
      .filter(i => i.id !== discard.id)
      .concat(take);

    await this.updateRun({ inventory: newInventory });
    this.lootOffer.set(null);
    await this.advanceRoom();
  }

  async skipLoot() {
    this.lootOffer.set(null);
    await this.advanceRoom();
  }

  async advanceRoom() {
    const run = this.run();
    if (!run) return;

    const nextRoom = run.currentRoom + 1;

    if (nextRoom > run.totalRooms + 1) {
      // Run complete — all rooms and boss done
      this.victory.set(true);
      this.runOver.set(true);
      await this.idb.clearRunState();
      return;
    }

    const nextEnemy = this.enemyService.getEnemyForRoom(nextRoom);
    const cards = await this.idb.getDueCards(run.deckId);

    await this.updateRun({
      currentRoom: nextRoom,
      currentEnemy: nextEnemy,
      enemyHp: nextEnemy.maxHp,
      consecutiveAgain: 0,
      activeEffects: [],
      cardQueue: cards.map(c => c.id),
    });

    // Reset battle UI
    this.queue.set(cards);
    this.currentIndex.set(0);
    this.flipped.set(false);
    this.pendingNextRoom.set(false);

    if (nextEnemy.ability === 'shuffle') {
      this.queue.set(this.shuffleArray(cards));
      this.showStatus(`${nextEnemy.name} shuffles your cards!`);
    }
  }

  // --- Helpers ---

  private async updateRun(partial: Partial<RunState>) {
    const run = this.run();
    if (!run) return;
    const updated = { ...run, ...partial };
    this.run.set(updated);
    await this.idb.saveRunState(updated);
  }

  private shuffleArray<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private showStatus(msg: string) {
    this.statusMessage.set(msg);
    setTimeout(() => this.statusMessage.set(null), 2000);
  }

  goBack() {
    this.idb.clearRunState();
    this.router.navigate(['/deck']);
  }

  playAgain() {
    this.router.navigate(['/deck']);
  }
}
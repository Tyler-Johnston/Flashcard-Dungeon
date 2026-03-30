import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IndexedDbService, Card, RunState, Item } from '../../../core/services/indexed-db';
import { FsrsService, Rating } from '../../../core/services/fsrs';
import { EnemyService } from '../../../core/services/enemy';
import { HpBarComponent } from '../../../shared/components/hp-bar/hp-bar';

const GOLD_PER_ROOM = 10;
const GOLD_PER_UNIQUE_CARD = 1;
const GOLD_VICTORY_BONUS = 25;

@Component({
  selector: 'app-card-battle',
  imports: [CommonModule, HpBarComponent],
  templateUrl: './card-battle.html',
  styleUrl: './card-battle.scss',
})
export class CardBattle implements OnInit {
  private idb = inject(IndexedDbService);
  private fsrs = inject(FsrsService);
  protected enemyService = inject(EnemyService);
  private router = inject(Router);

  readonly Rating = Rating;
  readonly INVENTORY_CAP = 5;

  run = signal<RunState | null>(null);
  queue = signal<Card[]>([]);
  currentIndex = signal(0);

  flipped = signal(false);
  damage = signal<number | null>(null);
  damageTarget = signal<'enemy' | 'player' | null>(null);
  runOver = signal(false);
  victory = signal(false);

  lootOffer = signal<Item[] | null>(null);
  pendingNextRoom = signal(false);
  statusMessage = signal<string | null>(null);

  goldEarned = signal(0);

  cramBonus = signal(0);
  readonly spriteVariant = signal<'a' | 'b'>('a');

  currentCard = computed(() => this.queue()[this.currentIndex()]);
  hasCards = computed(() => this.currentIndex() < this.queue().length);
  enemyHp = computed(() => this.run()?.enemyHp ?? 0);
  playerHp = computed(() => this.run()?.hp ?? 0);
  inventory = computed(() => this.run()?.inventory ?? []);
  currentEnemy = computed(() => this.run()?.currentEnemy ?? null);
  currentRoom = computed(() => this.run()?.currentRoom ?? 1);

  // ✅ NEW: unified attack calculation
  effectiveAtk = computed(() => {
    const enemy = this.currentEnemy();
    const run = this.run();
    if (!enemy || !run) return 0;

    let atk = enemy.atk + this.cramBonus();

    if (run.activeEffects.includes('enraged')) {
      atk *= 2;
    }

    return atk;
  });

  readonly spriteUrl = computed(() => {
    const enemy = this.currentEnemy();
    if (!enemy) return null;
    return `sprites/${enemy.spriteKey}_${this.spriteVariant()}.png`;
  });

  async ngOnInit() {
    const run = await this.idb.getRunState();
    if (!run) {
      this.router.navigate(['/deck']);
      return;
    }
    const cards = await this.idb.getDueCards(run.deckId);
    this.queue.set(cards);
    this.run.set(run);
    this.rollSpriteVariant();
  }

  flip() {
    if (!this.flipped()) this.flipped.set(true);
  }

  async rate(rating: Rating) {
    const card = this.currentCard();
    const run = this.run();
    if (!card || !this.flipped() || !run) return;

    if (!run.uniqueCardsReviewed.includes(card.id)) {
      await this.updateRun({
        uniqueCardsReviewed: [...run.uniqueCardsReviewed, card.id],
      });
    }

    let effectiveRating = rating;
    const enemy = run.currentEnemy;

    if (enemy.ability === 'suppress-crit' && rating === Rating.Easy) {
      effectiveRating = Rating.Good;
      this.showStatus(`${enemy.name} suppresses your crit!`);
    }
    if (enemy.ability === 'no-mercy' && rating === Rating.Hard) {
      effectiveRating = Rating.Again;
      this.showStatus(`${enemy.name} shows no mercy — Hard treated as Again!`);
    }

    const updated = this.fsrs.grade(card, effectiveRating);
    await this.idb.saveCard(updated);

    let playerDmg = 0;
    let enemyDmg = 0;
    let ignoreDmg = false;

    if (effectiveRating === Rating.Again) {
      // Enemy-specific effects
      if (enemy.ability === 'cram') {
        this.cramBonus.update(b => b + 3);
        this.showStatus(`${enemy.name} studies your mistake — ATK +3! (now ${this.effectiveAtk()})`);
        ignoreDmg = true;
      }

      if (enemy.ability === 'soul-drain') {
        const newMaxHp = Math.max(0, run.maxHp - 5);
        const newHp = Math.min(run.hp, newMaxHp);
        await this.updateRun({ maxHp: newMaxHp, hp: newHp });
        this.showStatus(`${enemy.name} drains your soul — max HP ${run.maxHp} → ${newMaxHp}!`);
      }

      // Apply standard damage to player
      if (!ignoreDmg)
        playerDmg = Math.floor(this.effectiveAtk());

    } else if (effectiveRating === Rating.Hard) {
      playerDmg = Math.floor(this.effectiveAtk() / 2);

      if (enemy.ability === 'troll-heal') {
        const newEnemyHp = Math.min(enemy.maxHp, run.enemyHp + 15);
        await this.updateRun({ enemyHp: newEnemyHp });
        this.showStatus(`${enemy.name} heals 15 HP!`);
      }

    } else if (effectiveRating === Rating.Good) {
      enemyDmg = 25;

    } else if (effectiveRating === Rating.Easy) {
      enemyDmg = 60;
    }

    if (effectiveRating === Rating.Good && run.activeEffects.includes('crit')) {
      enemyDmg = 60;
      const newEffects = run.activeEffects.filter(e => e !== 'crit');
      await this.updateRun({ activeEffects: newEffects });
      this.showStatus('Iron Sword activates!');
    }

    let newInventory = [...run.inventory];
    if (playerDmg > 0) {
      const shieldIdx = newInventory.findIndex(i => i.type === 'shield');
      if (shieldIdx !== -1) {
        newInventory.splice(shieldIdx, 1);
        playerDmg = 0;
        this.showStatus('Shield blocks the attack!');
      }
    }

    const currentRun = this.run()!;
    const newPlayerHp = Math.max(0, currentRun.hp - playerDmg);
    let newEnemyHp = Math.max(0, currentRun.enemyHp - enemyDmg);

    if (playerDmg > 0) {
      this.damage.set(-playerDmg);
      this.damageTarget.set('player');
    } else if (enemyDmg > 0) {
      this.damage.set(enemyDmg);
      this.damageTarget.set('enemy');
    }
    setTimeout(() => {
      this.damage.set(null);
      this.damageTarget.set(null);
    }, 800);

    const knightRevived = currentRun.activeEffects.includes('revive-used');
    if (enemy.ability === 'revive' && newEnemyHp <= 0 && !knightRevived) {
      newEnemyHp = 20;
      await this.updateRun({
        activeEffects: [...currentRun.activeEffects, 'revive-used'],
      });
      this.showStatus(`${enemy.name} revives at 20 HP!`);
    }

    if (
      enemy.ability === 'enrage' &&
      newEnemyHp <= enemy.maxHp / 2 &&
      !currentRun.activeEffects.includes('enraged')
    ) {
      await this.updateRun({
        activeEffects: [...currentRun.activeEffects, 'enraged'],
      });
      this.showStatus(`${enemy.name} enrages — ATK doubled!`);
    }

    await this.updateRun({
      hp: newPlayerHp,
      enemyHp: newEnemyHp,
      inventory: newInventory,
    });

    this.flipped.set(false);
    this.currentIndex.update(i => i + 1);

    if (newPlayerHp <= 0) {
      await this.endRun(false);
      return;
    }

    if (newEnemyHp <= 0) {
      await this.handleEnemyDefeated();
      return;
    }

    if (!this.hasCards()) {
      await this.endRun(false);
    }
  }

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
      case 'skip':
        this.flipped.set(false);
        this.currentIndex.update(i => i + 1);
        this.showStatus('Bomb skips the current card!');
        break;
      case 'shield':
        this.showStatus('Shield readied — next Again blocked!');
        break;
      case 'crit':
        updates.activeEffects = [...run.activeEffects, 'crit'];
        this.showStatus('Iron Sword ready — next Good = Easy damage!');
        break;
    }

    updates.inventory = newInventory;
    await this.updateRun(updates);
  }

  async handleEnemyDefeated() {
    const run = this.run();
    if (!run) return;

    // Increment rooms cleared
    await this.updateRun({ roomsCleared: run.roomsCleared + 1 });

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
    if (run.inventory.length >= this.INVENTORY_CAP) return;
    await this.updateRun({ inventory: [...run.inventory, item] });
    this.lootOffer.set(null);
    await this.advanceRoom();
  }

  async discardAndTake(discard: Item, take: Item) {
    const run = this.run();
    if (!run) return;
    const newInventory = run.inventory.filter(i => i.id !== discard.id).concat(take);
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
      await this.endRun(true);
      return;
    }

    const nextEnemy = this.enemyService.getEnemyForRoom(nextRoom);
    const cards = await this.idb.getDueCards(run.deckId);

    this.cramBonus.set(0);
    this.rollSpriteVariant();

    await this.updateRun({
      currentRoom: nextRoom,
      currentEnemy: nextEnemy,
      enemyHp: nextEnemy.maxHp,
      consecutiveAgain: 0,
      activeEffects: [],
      cardQueue: cards.map(c => c.id),
    });

    this.queue.set(cards);
    this.currentIndex.set(0);
    this.flipped.set(false);
    this.pendingNextRoom.set(false);
  }

  private async endRun(isVictory: boolean) {
    const run = this.run();
    if (!run) return;

    // Calculate gold
    const roomGold = run.roomsCleared * GOLD_PER_ROOM;
    const cardGold = run.uniqueCardsReviewed.length * GOLD_PER_UNIQUE_CARD;
    const victoryBonus = isVictory ? GOLD_VICTORY_BONUS : 0;
    const total = roomGold + cardGold + victoryBonus;

    if (total > 0) {
      await this.idb.addGold(total);
      this.goldEarned.set(total);
    }

    this.victory.set(isVictory);
    this.runOver.set(true);
    await this.idb.clearRunState();
  }

  private async updateRun(partial: Partial<RunState>) {
    const run = this.run();
    if (!run) return;
    const updated = { ...run, ...partial };
    this.run.set(updated);
    await this.idb.saveRunState(updated);
  }

  private showStatus(msg: string) {
    this.statusMessage.set(msg);
    setTimeout(() => this.statusMessage.set(null), 2000);
  }

  private rollSpriteVariant(): void {
    this.spriteVariant.set(Math.random() < 0.5 ? 'a' : 'b');
  }

  goBack() {
    this.idb.clearRunState();
    this.router.navigate(['/deck']);
  }

  playAgain() {
    this.router.navigate(['/deck']);
  }
}
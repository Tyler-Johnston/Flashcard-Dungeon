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

  // Tracks Goblin Scholar's Cram stacks — resets each room in advanceRoom()
  cramBonus = signal(0);

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

    const cards = await this.idb.getDueCards(run.deckId);
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

    if (enemy.ability === 'suppress-crit' && rating === Rating.Easy) {
      effectiveRating = Rating.Good;
      this.showStatus('Dark Mage suppresses your crit!');
    }
    if (enemy.ability === 'no-mercy' && rating === Rating.Hard) {
      effectiveRating = Rating.Again;
      this.showStatus('Mimic shows no mercy — Hard treated as Again!');
    }

    const updated = this.fsrs.grade(card, effectiveRating);
    await this.idb.saveCard(updated);

    let playerDmg = 0;
    let enemyDmg = 0;

    if (effectiveRating === Rating.Again) {
      // Cram: Goblin Scholar gains +3 ATK per Again, stacking for this fight
      if (enemy.ability === 'cram') {
        this.cramBonus.update(b => b + 3);
        this.showStatus(`Goblin Scholar studies your mistake — ATK +3! (now ${enemy.atk + this.cramBonus()})`);
      }

      // Soul Drain: replaces normal ATK damage — each Again costs 5 max HP permanently
      if (enemy.ability === 'soul-drain') {
        const newMaxHp = Math.max(0, run.maxHp - 5);
        const newHp = Math.min(run.hp, newMaxHp);
        await this.updateRun({ maxHp: newMaxHp, hp: newHp });
        this.showStatus(`Lich drains your soul — max HP ${run.maxHp} → ${newMaxHp}!`);
        playerDmg = 0; // drain IS the punishment, no extra ATK hit
      } else {
        playerDmg = enemy.atk + this.cramBonus();
      }
    } else if (effectiveRating === Rating.Hard) {
      playerDmg = Math.floor(enemy.atk / 2);
      if (enemy.ability === 'troll-heal') {
        const newEnemyHp = Math.min(enemy.maxHp, run.enemyHp + 15);
        await this.updateRun({ enemyHp: newEnemyHp });
        this.showStatus('Troll heals 15 HP!');
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
      this.showStatus('Crit Scroll activates!');
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

    // Re-read run after possible soul-drain update above
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
    setTimeout(() => { this.damage.set(null); this.damageTarget.set(null); }, 800);

    const skeletonRevived = currentRun.activeEffects.includes('revive-used');
    if (enemy.ability === 'revive' && newEnemyHp <= 0 && !skeletonRevived) {
      newEnemyHp = 20;
      await this.updateRun({ activeEffects: [...currentRun.activeEffects, 'revive-used'] });
      this.showStatus('Skeleton revives at 20 HP!');
    }

    if (enemy.ability === 'enrage' && newEnemyHp <= enemy.maxHp / 2 && !currentRun.activeEffects.includes('enraged')) {
      await this.updateRun({ activeEffects: [...currentRun.activeEffects, 'enraged'] });
      this.showStatus('Dragon enrages — ATK doubled!');
    }

    await this.updateRun({
      hp: newPlayerHp,
      enemyHp: newEnemyHp,
      inventory: newInventory,
    });

    this.flipped.set(false);
    this.currentIndex.update(i => i + 1);

    if (newPlayerHp <= 0) {
      this.runOver.set(true);
      return;
    }

    if (newEnemyHp <= 0) {
      await this.handleEnemyDefeated();
      return;
    }

    if (!this.hasCards()) {
      this.runOver.set(true);
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
      case 'scroll':
        this.flipped.set(false);
        this.currentIndex.update(i => i + 1);
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
      this.victory.set(true);
      this.runOver.set(true);
      await this.idb.clearRunState();
      return;
    }

    const nextEnemy = this.enemyService.getEnemyForRoom(nextRoom);
    const cards = await this.idb.getDueCards(run.deckId);

    // Reset per-room transient state
    this.cramBonus.set(0);

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

  goBack() {
    this.idb.clearRunState();
    this.router.navigate(['/deck']);
  }

  playAgain() {
    this.router.navigate(['/deck']);
  }
}
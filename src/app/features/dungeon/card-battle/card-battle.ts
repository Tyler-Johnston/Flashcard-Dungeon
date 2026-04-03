import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IndexedDbService, Card, RunState, Item } from '../../../core/services/indexed-db';
import { FsrsService, Rating } from '../../../core/services/fsrs';
import { EnemyService } from '../../../core/services/enemy';
import { StatsService } from '../../../core/services/stats.service';
import { HpBarComponent } from '../../../shared/components/hp-bar/hp-bar';

const GOLD_PER_ROOM = 10;
const GOLD_PER_UNIQUE_CARD = 1;
const GOLD_VICTORY_BONUS = 25;

const DMG_GOOD = 15;
const DMG_EASY = 30;

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
  private statsService = inject(StatsService);
  private router = inject(Router);

  readonly Rating = Rating;

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
  enemyInfoOpen = signal(false);

  bleedDamage = signal(5);
  warcryCounter = signal(0);
  swarmStacks = signal(0);
  shellAlternator = signal(0);
  shellActive = signal(false);

  currentCard  = computed(() => this.queue()[this.currentIndex()]);
  hasCards     = computed(() => this.currentIndex() < this.queue().length);
  enemyHp      = computed(() => this.run()?.enemyHp ?? 0);
  playerHp     = computed(() => this.run()?.hp ?? 0);
  inventory    = computed(() => this.run()?.inventory ?? []);
  currentEnemy = computed(() => this.run()?.currentEnemy ?? null);
  currentRoom  = computed(() => this.run()?.currentRoom ?? 1);
  inventoryCap = computed(() => this.run()?.inventoryCap ?? 5);

  readonly spriteUrl = computed(() => {
    const enemy = this.currentEnemy();
    if (!enemy) return null;
    return `sprites/${enemy.spriteKey}_${this.spriteVariant()}.png`;
  });

  readonly shellIsUp = computed(() => this.shellActive());

  effectiveAtk = computed(() => {
    const run = this.run();
    const enemy = this.currentEnemy();
    if (!run || !enemy) return 0;
    let atk = enemy.atk + this.cramBonus() + (this.swarmStacks() * 8);
    if (run.activeEffects.includes('enraged')) atk *= 2;
    return Math.round(atk * (run.atkMult ?? 1));
  });

  async ngOnInit() {
    const run = await this.idb.getRunState();
    if (!run) { this.router.navigate(['/deck']); return; }
    const cards = await this.idb.getDueCards(run.deckId);
    this.queue.set(cards);
    this.run.set(run);
    this.rollSpriteVariant();

    // ── Record run started ───────────────────────────────────────────────
    await this.statsService.recordRunStarted();
  }

  flip() {
    if (this.flipped()) return;
    this.flipped.set(true);

    const enemy = this.run()?.currentEnemy;
    if (enemy?.ability === 'shell') {
      const next = this.shellAlternator() + 1;
      this.shellAlternator.set(next);
      this.shellActive.set(next % 2 === 1);
    }
  }

  toggleEnemyInfo() {
    this.enemyInfoOpen.update(v => !v);
  }

  async rate(rating: Rating) {
    const card = this.currentCard();
    const run = this.run();
    if (!card || !this.flipped() || !run) return;

    if (!run.uniqueCardsReviewed.includes(card.id)) {
      await this.updateRun({ uniqueCardsReviewed: [...run.uniqueCardsReviewed, card.id] });
    }

    let effectiveRating = rating;
    const enemy = run.currentEnemy;
    const atkMult = run.atkMult ?? 1;
    const playerAtkMult = run.playerAtkMult ?? 1;
    const isEnraged = run.activeEffects.includes('enraged');

    // ── Pre-rating ability overrides ──────────────────────────────────────

    if (enemy.ability === 'suppress-crit' && rating === Rating.Easy) {
      effectiveRating = Rating.Good;
      this.showStatus(`${enemy.name} suppresses your crit!`);
    }

    if (enemy.ability === 'no-mercy' && rating === Rating.Hard) {
      effectiveRating = Rating.Again;
      this.showStatus(`${enemy.name} shows no mercy — Hard treated as Again!`);
    }

    // ── FSRS scheduling ───────────────────────────────────────────────────

    const updated = this.fsrs.grade(card, effectiveRating);
    await this.idb.saveCard(updated);

    // ── Damage calculation ────────────────────────────────────────────────

    const playerMissed = effectiveRating === Rating.Again;
    let playerDmg = 0;
    let enemyDmg = 0;

    if (effectiveRating === Rating.Good) {
      playerDmg = Math.round(DMG_GOOD * playerAtkMult);
    } else if (effectiveRating === Rating.Easy) {
      playerDmg = Math.round(DMG_EASY * playerAtkMult);
    }

    const baseAtk = enemy.atk + this.cramBonus() + (this.swarmStacks() * 8);
    const effectiveBaseAtk = isEnraged ? baseAtk * 2 : baseAtk;

    if (effectiveRating === Rating.Again) {
      enemyDmg = Math.round(effectiveBaseAtk * atkMult);
    } else if (effectiveRating === Rating.Hard) {
      enemyDmg = Math.round(Math.floor(effectiveBaseAtk / 2) * atkMult);
    }

    // ── Crit scroll ───────────────────────────────────────────────────────

    if (effectiveRating === Rating.Good && run.activeEffects.includes('crit')) {
      playerDmg = Math.round(DMG_EASY * playerAtkMult);
      const newEffects = run.activeEffects.filter(e => e !== 'crit');
      await this.updateRun({ activeEffects: newEffects });
      this.showStatus('Iron Sword activates!');
    }

    // ── Per-enemy ability side effects ────────────────────────────────────

    if (effectiveRating === Rating.Again) {
      if (enemy.ability === 'cram') {
        this.cramBonus.update(b => b + 3);
        this.showStatus(`${enemy.name} studies your mistake — ATK +3! (now ${enemy.atk + this.cramBonus()})`);
      }

      if (enemy.ability === 'soul-drain') {
        const currentRun = this.run()!;
        const newMaxHp = Math.max(0, currentRun.maxHp - 5);
        const newHp = Math.min(currentRun.hp, newMaxHp);
        await this.updateRun({ maxHp: newMaxHp, hp: newHp });
        this.showStatus(`${enemy.name} drains your soul — max HP ${currentRun.maxHp} → ${newMaxHp}!`);
        enemyDmg = 0;
      }
    }

    if (effectiveRating === Rating.Hard && enemy.ability === 'troll-heal') {
      const currentRun = this.run()!;
      const newEnemyHp = Math.min(enemy.maxHp, currentRun.enemyHp + 15);
      await this.updateRun({ enemyHp: newEnemyHp });
      this.showStatus(`🐂 ${enemy.name} heals 15 HP!`);
    }

    let requeueCard = false;
    if (enemy.ability === 'sticky-tongue' && playerMissed) {
      requeueCard = true;
      this.showStatus(`Sticky Tongue! The Frog swallows your card — face it again!`);
    }

    if (enemy.ability === 'bleed') {
      const bleed = this.bleedDamage();
      enemyDmg += bleed;
      this.showStatus(`Bleed! Fang inflicts ${bleed} bleed damage.`);
    }

    if (enemy.ability === 'warcry') {
      const next = this.warcryCounter() + 1;
      this.warcryCounter.set(next);
      if (next % 4 === 0) {
        enemyDmg = Math.round(effectiveBaseAtk * 2 * atkMult);
        this.showStatus(`Warcry! The Orc deals double damage!`);
      }
    }

    if (enemy.ability === 'swarm' && playerMissed) {
      if (this.swarmStacks() < 3) {
        this.swarmStacks.update(s => s + 1);
        const bonus = this.swarmStacks() * 8;
        this.showStatus(`A Chick joins the fray! ATK +${bonus} (${this.swarmStacks()}/3 chicks).`);
      } else {
        this.showStatus('The swarm is maxed — full chick chaos!');
      }
    }

    if (enemy.ability === 'shell' && this.shellActive()) {
      playerDmg = 0;
      this.shellActive.set(false);
      this.showStatus('Shell absorbed the hit — no damage!');
    }

    // ── Shield item ───────────────────────────────────────────────────────

    let newInventory = [...run.inventory];
    if (enemyDmg > 0) {
      const shieldIdx = newInventory.findIndex(i => i.type === 'shield');
      if (shieldIdx !== -1) {
        newInventory.splice(shieldIdx, 1);
        enemyDmg = 0;
        this.showStatus('Shield blocks the attack!');
      }
    }

    // ── Apply HP changes ──────────────────────────────────────────────────

    const currentRun = this.run()!;
    const newPlayerHp = Math.max(0, currentRun.hp - enemyDmg);
    let newEnemyHp = Math.max(0, currentRun.enemyHp - playerDmg);

    // ── Damage flash ──────────────────────────────────────────────────────

    if (enemyDmg > 0) {
      this.damage.set(-enemyDmg);
      this.damageTarget.set('player');
    } else if (playerDmg > 0) {
      this.damage.set(playerDmg);
      this.damageTarget.set('enemy');
    }
    setTimeout(() => { this.damage.set(null); this.damageTarget.set(null); }, 800);

    // ── Knight revive ─────────────────────────────────────────────────────

    const knightRevived = currentRun.activeEffects.includes('revive-used');
    if (enemy.ability === 'revive' && newEnemyHp <= 0 && !knightRevived) {
      newEnemyHp = 20;
      await this.updateRun({ activeEffects: [...currentRun.activeEffects, 'revive-used'] });
      this.showStatus(`${enemy.name} revives at 20 HP!`);
    }

    // ── Dragon enrage ─────────────────────────────────────────────────────

    if (enemy.ability === 'enrage' && newEnemyHp <= enemy.maxHp / 2 && !currentRun.activeEffects.includes('enraged')) {
      await this.updateRun({ activeEffects: [...currentRun.activeEffects, 'enraged'] });
      this.showStatus(`${enemy.name} enrages — ATK doubled!`);
    }

    // ── Persist state ─────────────────────────────────────────────────────

    await this.updateRun({ hp: newPlayerHp, enemyHp: newEnemyHp, inventory: newInventory });

    // ── Record card rated ─────────────────────────────────────────────────
    const ratingKey = (
      effectiveRating === Rating.Again ? 'again' :
      effectiveRating === Rating.Hard  ? 'hard'  :
      effectiveRating === Rating.Good  ? 'good'  : 'easy'
    ) as 'again' | 'hard' | 'good' | 'easy';

    await this.statsService.recordCardRated({
      rating:       ratingKey,
      cardId:       card.id,
      damageDealt:  playerDmg,
      damageTaken:  enemyDmg,
    });

    this.flipped.set(false);

    if (requeueCard) {
      const q = [...this.queue()];
      q.splice(this.currentIndex() + 1, 0, card);
      this.queue.set(q);
    }

    this.currentIndex.update(i => i + 1);

    if (newPlayerHp <= 0) { await this.endRun(false); return; }
    if (newEnemyHp <= 0)  { await this.handleEnemyDefeated(); return; }
    if (!this.hasCards())  { await this.endRun(false); }
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
        this.showStatus('Shield readied — next hit blocked!');
        break;
      case 'crit':
        updates.activeEffects = [...run.activeEffects, 'crit'];
        this.showStatus('Iron Sword ready — next Good = Easy damage!');
        break;
    }

    updates.inventory = newInventory;
    await this.updateRun(updates);

    // ── Record item used ──────────────────────────────────────────────────
    await this.statsService.recordItemUsed(item.type);
  }

  async handleEnemyDefeated() {
    const run = this.run();
    if (!run) return;

    await this.updateRun({ roomsCleared: run.roomsCleared + 1 });

    // ── Record enemy defeated ─────────────────────────────────────────────
    await this.statsService.recordEnemyDefeated(run.currentEnemy.id);

    const lootChance = run.activeEffects.includes('better-loot') ? 0.85 : 0.7;
    const offer = this.enemyService.rollLootWithChance(run.currentEnemy, lootChance);
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
    if (run.inventory.length >= this.inventoryCap()) return;
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
    if (nextRoom > run.totalRooms) { await this.endRun(true); return; }

    const nextEnemy = this.enemyService.getEnemyForRoom(nextRoom, run.totalRooms, run.difficulty);
    const cards = await this.idb.getDueCards(run.deckId);

    const hpMult = run.atkMult ?? 1;
    const scaledMaxHp = Math.round(nextEnemy.maxHp * hpMult);
    const scaledEnemy = { ...nextEnemy, maxHp: scaledMaxHp };

    this.cramBonus.set(0);
    this.warcryCounter.set(0);
    this.swarmStacks.set(0);
    this.shellAlternator.set(0);
    this.shellActive.set(false);
    this.bleedDamage.set(5);

    this.rollSpriteVariant();
    this.enemyInfoOpen.set(false);

    await this.updateRun({
      currentRoom: nextRoom,
      currentEnemy: scaledEnemy,
      enemyHp: scaledMaxHp,
      consecutiveAgain: 0,
      activeEffects: run.activeEffects.filter(e => e === 'better-loot'),
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

    const goldMult = run.goldMult ?? 1;
    const roomGold = run.roomsCleared * GOLD_PER_ROOM;
    const cardGold = run.uniqueCardsReviewed.length * GOLD_PER_UNIQUE_CARD;
    const victoryBonus = isVictory ? GOLD_VICTORY_BONUS : 0;
    const total = Math.round((roomGold + cardGold + victoryBonus) * goldMult);

    if (total > 0) {
      await this.idb.addGold(total);
      this.goldEarned.set(total);
    }

    // ── Record run outcome ────────────────────────────────────────────────
    if (isVictory) {
      const deck = (await this.idb.getAllDecks()).find(d => d.id === run.deckId);
      await this.statsService.recordRunWon({
        roomsCleared: run.roomsCleared,
        difficulty:   run.difficulty,
        deckName:     deck?.name ?? 'Unknown',
        goldEarned:   total,
      });
    } else {
      await this.statsService.recordRunLost(run.currentEnemy.id);
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

  playAgain() { this.router.navigate(['/deck']); }
}
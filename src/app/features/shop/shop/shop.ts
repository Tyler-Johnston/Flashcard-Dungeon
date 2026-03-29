import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IndexedDbService, PlayerProfile, ShopUpgradeId } from '../../../core/services/indexed-db';

export interface ShopItem {
  id: ShopUpgradeId;
  name: string;
  description: string;
  cost: number;
  spriteCol: number; // column in rpgItems.png
  spriteRow: number;
}

const SHOP_ITEMS: ShopItem[] = [
  {
    id: 'extra-hp',
    name: 'Vitality Potion',
    description: 'Start every run with +25 max HP.',
    cost: 50,
    spriteCol: 0,
    spriteRow: 0, // red potion
  },
  {
    id: 'starting-shield',
    name: 'Iron Shield',
    description: 'Begin every run with an Iron Shield in your inventory.',
    cost: 75,
    spriteCol: 6,
    spriteRow: 2, // iron shield
  },
  {
    id: 'random-item',
    name: 'Mystery Satchel',
    description: 'Begin every run with a random item.',
    cost: 40,
    spriteCol: 0,
    spriteRow: 7, // red gem ring
  },
  {
    id: 'extra-inventory',
    name: 'Adventurer\'s Pack',
    description: 'Carry one extra item — inventory cap raised to 6.',
    cost: 100,
    spriteCol: 7,
    spriteRow: 1, // iron boots (repurposed as pack)
  },
  {
    id: 'better-loot',
    name: 'Lucky Charm',
    description: 'Loot drop chance increased from 70% to 85%.',
    cost: 80,
    spriteCol: 0,
    spriteRow: 3, // ruby
  },
];

@Component({
  selector: 'app-shop',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './shop.html',
  styleUrl: './shop.scss',
})
export class ShopComponent implements OnInit {
  private idb = inject(IndexedDbService);
  private router = inject(Router);

  profile = signal<PlayerProfile | null>(null);
  statusMsg = signal<string | null>(null);

  readonly shopItems = SHOP_ITEMS;

  async ngOnInit() {
    this.profile.set(await this.idb.getProfile());
  }

  isOwned(id: ShopUpgradeId): boolean {
    return this.profile()?.upgrades.includes(id) ?? false;
  }

  canAfford(cost: number): boolean {
    return (this.profile()?.gold ?? 0) >= cost;
  }

  async buy(item: ShopItem) {
    if (this.isOwned(item.id) || !this.canAfford(item.cost)) return;
    const updated = await this.idb.purchaseUpgrade(item.id, item.cost);
    if (updated) {
      this.profile.set(updated);
      this.flash(`${item.name} unlocked!`);
    }
  }

  spriteStyle(item: ShopItem): Record<string, string> {
    const cell = 16;
    const display = 48;
    const scale = display / cell;
    const x = item.spriteCol * cell * scale;
    const y = item.spriteRow * cell * scale;
    const size = 128 * scale;
    return {
      'background-image': 'url(/sprites/rpgItems.png)',
      'background-size': `${size}px ${size}px`,
      'background-position': `-${x}px -${y}px`,
      'background-repeat': 'no-repeat',
      'image-rendering': 'pixelated',
    };
  }

  private flash(msg: string) {
    this.statusMsg.set(msg);
    setTimeout(() => this.statusMsg.set(null), 2500);
  }

  goBack() {
    this.router.navigate(['/deck']);
  }
}

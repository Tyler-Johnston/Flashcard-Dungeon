import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-hp-bar',
  imports: [CommonModule],
  templateUrl: './hp-bar.html',
  styleUrl: './hp-bar.scss',
})
export class HpBarComponent {
  label = input<string>('HP');
  current = input<number>(100);
  max = input<number>(100);
  color = input<string>('green');

  pct = computed(() => Math.max(0, (this.current() / this.max()) * 100));
}
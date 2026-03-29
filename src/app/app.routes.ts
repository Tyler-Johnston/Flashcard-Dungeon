import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dungeon',
    pathMatch: 'full',
  },
  {
    path: 'dungeon',
    loadChildren: () =>
      import('./features/dungeon/dungeon-module').then(m => m.DungeonModule),
  },
  {
    path: 'boss',
    loadChildren: () =>
      import('./features/boss/boss-module').then(m => m.BossModule),
  },
  {
    path: 'journal',
    loadChildren: () =>
      import('./features/journal/journal-module').then(m => m.JournalModule),
  },
  {
    path: 'deck',
    loadChildren: () =>
      import('./features/deck/deck-module').then(m => m.DeckModule),
  },
  {
    path: '**',
    redirectTo: 'dungeon',
  },
  { path: '', redirectTo: 'deck', pathMatch: 'full' },
];
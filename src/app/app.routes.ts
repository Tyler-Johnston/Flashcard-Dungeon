import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'deck',
    pathMatch: 'full',
  },
  {
    path: 'deck',
    loadChildren: () =>
      import('./features/deck/deck-module').then(m => m.DeckModule),
  },
  {
    path: 'dungeon',
    loadChildren: () =>
      import('./features/dungeon/dungeon-module').then(m => m.DungeonModule),
  },
  {
    path: 'journal',
    loadChildren: () =>
      import('./features/journal/journal-module').then(m => m.JournalModule),
  },
  {
    path: 'editor',
    loadChildren: () =>
      import('./features/editor/editor-module').then(m => m.EditorModule),
  },
  {
    path: 'boss',
    loadChildren: () =>
      import('./features/boss/boss-module').then(m => m.BossModule),
  },
  {
    path: 'shop',
    loadChildren: () =>
      import('./features/shop/shop-module').then(m => m.ShopModule),
  },
  {
    path: '**',
    redirectTo: 'deck',
  },
];
import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IndexedDbService } from './core/services/indexed-db';
import { DeckImportService } from './core/services/deck-import';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  private idb = inject(IndexedDbService);
  private deckImport = inject(DeckImportService);

  async ngOnInit() {
    await this.idb.init();
    await this.deckImport.seedBuiltInDecks();
  }
}
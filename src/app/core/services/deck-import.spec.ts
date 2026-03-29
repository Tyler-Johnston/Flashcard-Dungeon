import { TestBed } from '@angular/core/testing';

import { DeckImport } from './deck-import';

describe('DeckImport', () => {
  let service: DeckImport;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DeckImport);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

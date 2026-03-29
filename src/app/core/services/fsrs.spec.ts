import { TestBed } from '@angular/core/testing';

import { Fsrs } from './fsrs';

describe('Fsrs', () => {
  let service: Fsrs;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Fsrs);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

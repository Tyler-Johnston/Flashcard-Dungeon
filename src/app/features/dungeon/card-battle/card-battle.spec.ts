import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CardBattle } from './card-battle';

describe('CardBattle', () => {
  let component: CardBattle;
  let fixture: ComponentFixture<CardBattle>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardBattle],
    }).compileComponents();

    fixture = TestBed.createComponent(CardBattle);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

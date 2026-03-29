import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HpBar } from './hp-bar';

describe('HpBar', () => {
  let component: HpBar;
  let fixture: ComponentFixture<HpBar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HpBar],
    }).compileComponents();

    fixture = TestBed.createComponent(HpBar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

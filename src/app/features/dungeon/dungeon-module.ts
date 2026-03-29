import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CardBattleComponent } from './card-battle/card-battle';

const routes: Routes = [
  { path: '', component: CardBattleComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
})
export class DungeonModule {}
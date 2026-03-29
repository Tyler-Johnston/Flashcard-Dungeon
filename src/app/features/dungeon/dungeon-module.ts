import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CardBattle} from './card-battle/card-battle';

const routes: Routes = [
  { path: '', component: CardBattle },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
})
export class DungeonModule {}
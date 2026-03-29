import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ImportComponent } from './import/import';

const routes: Routes = [
  { path: '', component: ImportComponent },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
})
export class DeckModule {}
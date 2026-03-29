import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ShopComponent } from './shop/shop';

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forChild([
      { path: '', component: ShopComponent }
    ]),
  ],
})
export class ShopModule {}

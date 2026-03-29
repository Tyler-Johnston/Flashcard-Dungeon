import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { EditorComponent } from './editor/editor';

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forChild([
      { path: '', component: EditorComponent }
    ]),
  ],
})
export class EditorModule {}

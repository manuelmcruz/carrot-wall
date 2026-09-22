import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ThemeToggleComponent } from './theme-toggle';

@Component({
  imports: [RouterOutlet, ThemeToggleComponent],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}

import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CaptureBar } from './features/capture/capture-bar';

/** Shell de la aplicación: navegación, captura rápida (siempre visible) y la pantalla activa. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CaptureBar],
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}

import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ViewPortService {

  private mediaQuery = window.matchMedia('(max-width: 768px)');

  readonly isMobileView = signal(this.mediaQuery.matches);

  constructor() {
    this.mediaQuery.addEventListener('change', (event) => {
      this.isMobileView.set(event.matches);
    });
  }
}

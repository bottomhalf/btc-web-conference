import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-splash',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './splash.component.html',
  styleUrl: './splash.component.css'
})
export class SplashComponent implements OnInit {
  fadeOut = false;

  constructor(private router: Router) {}

  ngOnInit(): void {
    const minDelay = new Promise(resolve => setTimeout(resolve, 2800));

    // Preload the landing module in background
    const preload = import('../landing/landing.component').then(m => m.LandingComponent);

    // Wait for both: minimum animation time + module loaded
    Promise.all([minDelay, preload]).then(() => {
      this.fadeOut = true;
      setTimeout(() => {
        this.router.navigate(['/home']);
      }, 600); // match fade-out duration
    });
  }
}

import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.css'
})
export class LandingComponent implements OnInit, AfterViewInit, OnDestroy {
  static savedScrollPosition = 0;
  isNavScrolled = false;
  isMobileMenuOpen = false;
  private scrollHandler: (() => void) | null = null;
  private observer: IntersectionObserver | null = null;

  // Typing animation
  typingTexts = [
    'What are the key findings in the Q4 report?',
    'Summarize the action items from last meeting',
    'Find all references to budget allocation',
    'What did John say about the project timeline?'
  ];
  currentTypingIndex = 0;
  displayedText = '';
  private typingInterval: any = null;
  showAiResponse = false;

  // Stats counter
  stats = [
    { value: 0, target: 10, suffix: 'M+', label: 'Meetings Hosted' },
    { value: 0, target: 99.9, suffix: '%', label: 'Uptime' },
    { value: 0, target: 50, suffix: '+', label: 'Countries' },
    { value: 0, target: 256, suffix: '-bit', label: 'Encryption' }
  ];

  constructor(private router: Router) {}

  ngOnInit(): void {
    this.startTypingAnimation();
  }

  ngAfterViewInit(): void {
    // Scroll listener for navbar
    const scrollContainer = document.getElementById('landing-top');
    this.scrollHandler = () => {
      if (scrollContainer) {
        this.isNavScrolled = scrollContainer.scrollTop > 60;
      }
    };
    
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', this.scrollHandler, { passive: true });
      
      // Restore scroll position
      if (LandingComponent.savedScrollPosition > 0) {
        setTimeout(() => {
          scrollContainer.scrollTop = LandingComponent.savedScrollPosition;
        }, 0);
      }
    }

    // Intersection Observer for scroll-reveal animations
    this.setupScrollReveal();

    // Animate stats when visible
    this.setupStatsCounter();
  }

  ngOnDestroy(): void {
    const scrollContainer = document.getElementById('landing-top');
    if (scrollContainer) {
      LandingComponent.savedScrollPosition = scrollContainer.scrollTop;
      if (this.scrollHandler) {
        scrollContainer.removeEventListener('scroll', this.scrollHandler);
      }
    }
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.typingInterval) {
      clearInterval(this.typingInterval);
    }
  }

  navigateToLogin(): void {
    this.router.navigate(['/login']);
  }

  navigateToRegister(): void {
    // For now, navigate to login. Registration can be added later.
    this.router.navigate(['/login']);
  }

  navigateToLeadership(role: string): void {
    this.router.navigate(['/leadership', role]);
  }

  toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  scrollToSection(sectionId: string): void {
    this.isMobileMenuOpen = false;
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  private setupScrollReveal(): void {
    const revealElements = document.querySelectorAll('.reveal');
    if (!revealElements.length) return;

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          this.observer?.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    revealElements.forEach(el => this.observer!.observe(el));
  }

  private setupStatsCounter(): void {
    const statsSection = document.getElementById('stats-section');
    if (!statsSection) return;

    const statsObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.animateCounters();
          statsObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    statsObserver.observe(statsSection);
  }

  private animateCounters(): void {
    this.stats.forEach(stat => {
      const duration = 2000;
      const steps = 60;
      const increment = stat.target / steps;
      let current = 0;
      const interval = setInterval(() => {
        current += increment;
        if (current >= stat.target) {
          stat.value = stat.target;
          clearInterval(interval);
        } else {
          stat.value = Math.round(current * 10) / 10;
        }
      }, duration / steps);
    });
  }

  private startTypingAnimation(): void {
    let charIndex = 0;
    const currentText = this.typingTexts[this.currentTypingIndex];
    this.displayedText = '';
    this.showAiResponse = false;

    this.typingInterval = setInterval(() => {
      if (charIndex < currentText.length) {
        this.displayedText += currentText[charIndex];
        charIndex++;
      } else {
        clearInterval(this.typingInterval);
        // Show AI response after typing completes
        setTimeout(() => {
          this.showAiResponse = true;
        }, 500);

        // Move to next text after delay
        setTimeout(() => {
          this.currentTypingIndex = (this.currentTypingIndex + 1) % this.typingTexts.length;
          this.startTypingAnimation();
        }, 4000);
      }
    }, 45);
  }
}

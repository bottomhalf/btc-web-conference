import { Injectable, signal, effect } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

@Injectable({
    providedIn: 'root'
})
export class ThemeService {
    private readonly STORAGE_KEY = 'theme-preference';

    // Signal to track current theme
    isDarkMode = signal<boolean>(this.getStoredPreference());

    constructor() {
        // Apply theme on service initialization
        effect(() => {
            this.applyTheme(this.isDarkMode() ? 'dark' : 'light');
        });
    }

    /**
     * Toggle between light and dark mode
     */
    toggleTheme(): void {
        this.isDarkMode.set(!this.isDarkMode());
        this.savePreference();
    }

    /**
     * Set a specific theme
     */
    setTheme(mode: ThemeMode): void {
        this.isDarkMode.set(mode === 'dark');
        this.savePreference();
    }

    /**
     * Get current theme mode
     */
    getTheme(): ThemeMode {
        return this.isDarkMode() ? 'dark' : 'light';
    }

    /**
     * Apply theme to document body
     */
    private applyTheme(mode: ThemeMode): void {
        document.body.setAttribute('data-theme', mode);
    }

    /**
     * Get stored preference from localStorage
     */
    private getStoredPreference(): boolean {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored !== null) {
            return stored === 'dark';
        }
        // Default to light mode
        return false;
    }

    /**
     * Save preference to localStorage
     */
    private savePreference(): void {
        localStorage.setItem(this.STORAGE_KEY, this.isDarkMode() ? 'dark' : 'light');
    }
}

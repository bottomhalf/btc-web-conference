import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-account-deletion',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './account-deletion.component.html',
  styleUrl: './account-deletion.component.css'
})
export class AccountDeletionComponent {
  isConfirmed: boolean = false;
  isSubmitting: boolean = false;
  successMessage: string = '';

  toggleConfirmation(event: Event) {
    const target = event.target as HTMLInputElement;
    this.isConfirmed = target.checked;
  }

  requestDeletion() {
    if (!this.isConfirmed) return;
    
    this.isSubmitting = true;
    
    // Simulate API call for deletion request
    setTimeout(() => {
      this.isSubmitting = false;
      this.successMessage = "Your account deletion request has been submitted. You will receive a confirmation email shortly.";
      this.isConfirmed = false;
    }, 1500);
  }
}

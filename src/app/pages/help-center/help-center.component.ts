import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-help-center',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './help-center.component.html',
  styleUrl: './help-center.component.css'
})
export class HelpCenterComponent {
  faqs = [
    {
      question: 'How do I start a new meeting?',
      answer: 'Go to your dashboard and click the "New Meeting" button. You will be provided with a unique meeting link that you can share with participants.',
      isOpen: false
    },
    {
      question: 'Why is my camera or microphone not working?',
      answer: 'Ensure that you have granted browser permissions for camera and microphone access. Also, check if another application is currently using them. You can manage your devices in the meeting preview screen before joining.',
      isOpen: false
    },
    {
      question: 'How can I share my screen?',
      answer: 'During a meeting, click the "Share Screen" icon in the bottom control bar. You can choose to share your entire screen, a specific window, or a browser tab.',
      isOpen: false
    },
    {
      question: 'Are the meetings recorded?',
      answer: 'Meetings are not recorded by default. If the host decides to record a session, all participants will be notified via an on-screen indicator.',
      isOpen: false
    }
  ];

  toggleFaq(index: number) {
    this.faqs[index].isOpen = !this.faqs[index].isOpen;
  }
}

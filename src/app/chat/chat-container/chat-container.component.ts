import { Component, inject, Input } from '@angular/core';
import { ConfeetSocketService } from '../../providers/socket/confeet-socket.service';

@Component({
  selector: 'app-chat-container',
  standalone: true,
  imports: [],
  templateUrl: './chat-container.component.html',
  styleUrl: './chat-container.component.css'
})
export class ChatContainerComponent {
  ws = inject(ConfeetSocketService);

  @Input() header: boolean = false;
}

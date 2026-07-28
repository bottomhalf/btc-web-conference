import { Component, EventEmitter, inject, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatService } from '../chat.service';
import { ConfeetSocketService } from '../../providers/socket/confeet-socket.service';
import { Conversation, SearchResult } from '../../components/global-search/search.models';
import { ChatContainerComponent } from '../chat-container/chat-container.component';
import { LocalService } from '../../providers/services/local.service';
import { NotificationService } from '../../notifications/services/notification.service';

@Component({
  selector: 'app-mobile-chat',
  standalone: true,
  imports: [CommonModule, ChatContainerComponent],
  templateUrl: './mobile-chat.component.html',
  styleUrl: './mobile-chat.component.css'
})
export class MobileChatComponent {
  @Output() openNewChat = new EventEmitter<'new-chat' | 'create-group'>();

  chatService = inject(ChatService);
  ws = inject(ConfeetSocketService);
  localService = inject(LocalService);
  notificationService = inject(NotificationService);
  
  activeView: 'list' | 'chat' = 'list';
  failedAvatars = new Set<string>();

  get currentUserId(): string {
    return this.localService.getUser()?.userId || '';
  }

  get directConversations(): Conversation[] {
    return this.chatService.meetingRooms().filter(c => c && c.type?.toLowerCase() !== 'group');
  }

  get groupConversations(): Conversation[] {
    return this.chatService.meetingRooms().filter(c => c && c.type?.toLowerCase() === 'group');
  }

  onAvatarError(url: string | null | undefined): void {
    if (url) {
      this.failedAvatars.add(url);
    }
  }

  getConversationName(conversation: Conversation): string {
    return this.chatService.getConversationName(conversation, this.currentUserId);
  }

  getCurrentInitiaLetter(conversation: Conversation): string {
    return this.chatService.getCurrentInitiaLetter(conversation, this.currentUserId);
  }

  getColorFromName(fname: string, lname: string): string {
    return this.chatService.getColorFromName(fname, lname);
  }

  getConversationAvatar(conversation: Conversation): string {
    if (!conversation) return '';
    if (conversation.type?.toLowerCase() === 'group') {
      return conversation.avatar || '';
    }
    const participants = (conversation.participants || []).filter(p => p && p.userId !== this.currentUserId);
    if (participants.length > 0 && participants[0].avatar) {
      return participants[0].avatar;
    }
    return conversation.avatar || '';
  }

  getDirectUserStatus(conversation: Conversation): string {
    if (!conversation || conversation.type?.toLowerCase() === 'group') return '';
    const participants = (conversation.participants || []).filter(p => p && p.userId !== this.currentUserId);
    if (participants.length > 0) {
      return (participants[0].status || 'offline').toLowerCase();
    }
    return 'offline';
  }

  getNormalizedStatus(status: string): string {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'available':
      case 'online':
        return 'online';
      case 'busy':
      case 'dnd':
        return 'busy';
      case 'away':
      case 'brb':
        return 'away';
      default:
        return 'offline';
    }
  }

  selectChannelForConversation(conversation: Conversation) {
    if (!conversation) return;
    const currentId = this.ws.currentConversationId();
    const targetId = conversation.id || conversation.conversationId || '';
    if (currentId && targetId && currentId === targetId && this.chatService.messages().length > 0) {
        this.activeView = 'chat';
        return;
    }

    this.chatService.isMessagesLoading.set(true);
    this.ws.currentConversation.set(conversation);
    this.ws.currentConversationId.set(targetId || null);
    this.chatService.messages.set([]);

    if (targetId) {
        this.notificationService.setActiveConversation(targetId);
    }
    this.activeView = 'chat';
  }

  isConversationSelected(item: Conversation): boolean {
    return Boolean(item && (item.id === this.ws.currentConversationId() || item.conversationId === this.ws.currentConversationId()));
  }
}


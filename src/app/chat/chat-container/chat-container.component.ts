import { Component, inject, Input, signal, ViewChild, ElementRef, AfterViewChecked, effect, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpEventType, HttpRequest, HttpHeaders } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ConfeetSocketService } from '../../providers/socket/confeet-socket.service';
import { ChatService } from '../chat.service';
import { LocalService } from '../../providers/services/local.service';
import { InitiateAudioCallService } from '../../providers/socket/client-events/call/initiate-audio-call.service';
import { NotifyGroupCreatedService } from '../../providers/socket/client-events/group/notify-group-created.service';
import { Conversation, Participant, SearchResult } from '../../components/global-search/search.models';
import { ResponseModel, User } from '../../models/model';
import { CallType } from '../../models/conference_call/call_model';
import { ChatDbService } from '../../core/services/chat-db.service';

@Component({
  selector: 'app-chat-container',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-container.component.html',
  styleUrl: './chat-container.component.css'
})
export class ChatContainerComponent implements AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @Input() header: boolean = false;
  @Input() classes: string = '';

  ws = inject(ConfeetSocketService);
  chatService = inject(ChatService);
  chatDb = inject(ChatDbService);
  private local = inject(LocalService);
  private router = inject(Router);
  private initiateAudioCallService = inject(InitiateAudioCallService);
  private notifyGroupCreatedService = inject(NotifyGroupCreatedService);
  private httpClient = inject(HttpClient);

  // User data
  user: User = {
    isMicOn: false,
    isCameraOn: false,
  };
  currentUserId: string = "";

  // Message state
  @ViewChild('messageInputRef') messageInputRef!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('membersDropdownRef') membersDropdownRef!: ElementRef;
  message = signal<string | null>('');
  stagedFiles = signal<any[]>([]);
  pendingUploads = signal<any[]>([]);
  replyingToMessage = signal<any | null>(null);
  pageIndex: number = 1;
  private shouldScrollToBottom = false;
  private shouldPreserveScrollPosition = false;
  private previousScrollHeight = 0;
  private lastMessageId?: string;

  // Members dropdown state
  showMembersDropdown: boolean = false;
  membersPopoverTop: number = 0;
  membersPopoverLeft: number = 0;
  showCreateGroupInput: boolean = false;
  newGroupName: string = '';
  newGroupMembers: SearchResult[] = [];
  memberSearchQuery: string = '';
  memberSearchResults: SearchResult[] = [];
  memberSearchSelectedIndex: number = -1;

  // Emoji Picker state & categories
  showEmojiPicker = signal<boolean>(false);
  selectedEmojiCategory = signal<string>('smileys');

  readonly emojiCategories = [
    { id: 'smileys', label: 'Smileys', icon: '😀', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😨', '😰', '😥'] },
    { id: 'gestures', label: 'Gestures', icon: '👍', emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦵', '🦶', '👂', '👃', '🧠', '👀', '👁️', '👅', '👄'] },
    { id: 'hearts', label: 'Hearts', icon: '❤️', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '⭐', '🌟', '✨', '⚡', '🔥'] },
    { id: 'objects', label: 'Celebrations & Objects', icon: '🎉', emojis: ['🎉', '🎊', '🎈', '🎂', '🍰', '🍾', '🥂', '🍻', '🍺', '🍹', '🍸', '🍷', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🎯', '🎲', '🎳', '🎮', '🎰', '🎁', '🎀', '🧧', '🖼️', '🎨', '🧵', '🧶', '👓', '🕶️', '🥽', '🥼', '👔', '👕', '👖', '🧣', '🧤', '🧥', '🧦', '👗', '👘', '🥻', '🩱', '🩲', '🩳', '👙', '👚', '👛', '👜', '👝', '🎒', '👞', '👟', '🥾', '🥿', '👠', '👡', '🩰', 'BOOTS', '👑', '👒', '🎩', '🎓', '🧢', 'HELMET', 'PRAYER_BEADS', 'LIPSTICK', 'RING', 'GEM_STONE'] }
  ];

  constructor() {
    this.user = this.local.getUser();
    this.currentUserId = this.user.userId;

    // React to conversation changes and load messages
    effect(() => {
      const conversation = this.ws.currentConversation();
      if (conversation && (conversation.id || conversation.conversationId)) {
        // Reset page index and load first page of messages
        this.pageIndex = 1;
        this.lastMessageId = undefined; // Reset tracking
        this.loadMoreMessages(true); // true = scroll to bottom
        this.chatService.setIsChatStatus(true, 'Chat container');
      }
    }, { allowSignalWrites: true });

    // React to new incoming messages to auto-scroll
    effect(() => {
      const msgs = this.chatService.messages();
      if (msgs && msgs.length > 0) {
        const latestMsg = msgs[msgs.length - 1];
        const currentLastId = latestMsg.id || latestMsg.messageId;

        if (this.lastMessageId !== currentLastId) {
          this.lastMessageId = currentLastId;
          this.shouldScrollToBottom = true;
          // Fallback to ensure scroll happens after DOM updates
          setTimeout(() => this.scrollToBottom(), 50);
        }
      } else {
        this.lastMessageId = undefined;
      }
    });
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }

    // Preserve scroll position when older messages are prepended
    if (this.shouldPreserveScrollPosition && this.messagesContainer) {
      const container = this.messagesContainer.nativeElement;
      const newScrollHeight = container.scrollHeight;
      const scrollDiff = newScrollHeight - this.previousScrollHeight;
      container.scrollTop = scrollDiff;
      this.shouldPreserveScrollPosition = false;
    }
  }



  // Helper methods
  getCurrentInitiaLetter(conversation: Conversation): string {
    return this.chatService.getCurrentInitiaLetter(conversation, this.currentUserId);
  }

  getConversationName(conversation: Conversation): string {
    return this.chatService.getConversationName(conversation, this.currentUserId);
  }

  getUserInitiaLetter(fname: string, lname: string): string {
    return this.chatService.getUserInitiaLetter(fname, lname);
  }

  getColorFromName(fname: string, lname: string): string {
    return this.chatService.getColorFromName(fname, lname);
  }

  getConversationAvatar(conversation: Conversation): string {
    if (!conversation) return '';
    if (conversation.conversationType === 'group') {
      return conversation.conversationAvatar || '';
    }
    const participants = (conversation.participants || []).filter(p => p && p.userId !== this.currentUserId);
    if (participants.length > 0 && participants[0].avatar) {
      return participants[0].avatar;
    }
    return conversation.conversationAvatar || '';
  }

  getDirectUserStatus(conversation: Conversation): string {
    if (!conversation || conversation.conversationType === 'group') return '';
    const participants = (conversation.participants || []).filter(p => p && p.userId !== this.currentUserId);
    if (participants.length > 0) {
      return (participants[0].status || 'offline').toLowerCase();
    }
    return 'offline';
  }

  getDirectUserStatusColor(conversation: Conversation): string {
    const status = this.getDirectUserStatus(conversation);
    switch (status) {
      case 'available':
      case 'online':
        return '#34A853'; // Google Green
      case 'busy':
      case 'dnd':
        return '#EA4335'; // Google Red
      case 'away':
      case 'brb':
        return '#FBBC05'; // Google Yellow
      default:
        return '#9AA0A6'; // Google Gray
    }
  }

  getNormalizedStatus(statusInput: string): string {
    const s = (statusInput || '').toLowerCase();
    if (s === 'available' || s === 'online') return 'online';
    if (s === 'busy' || s === 'dnd') return 'busy';
    return 'offline';
  }

  getDirectUserStatusLabel(conversation: Conversation): string {
    const status = this.getDirectUserStatus(conversation);
    switch (status) {
      case 'available':
      case 'online':
        return 'Available';
      case 'busy':
      case 'dnd':
        return 'Do not disturb';
      case 'away':
      case 'brb':
        return 'Away';
      default:
        return 'Offline';
    }
  }

  failedAvatars = new Set<string>();

  onAvatarError(url: string | null | undefined): void {
    if (url) {
      this.failedAvatars.add(url);
    }
  }

  shouldShowDateSeparator(index: number): boolean {
    const messages = this.chatService.messages();
    if (!messages || !messages[index]) return false;

    if (index === 0) {
      return true;
    }

    const currentMsgDate = new Date(messages[index].createdAt || Date.now());
    const prevMsgDate = new Date(messages[index - 1].createdAt || Date.now());

    const isSameDayAsPrev = currentMsgDate.getDate() === prevMsgDate.getDate() &&
      currentMsgDate.getMonth() === prevMsgDate.getMonth() &&
      currentMsgDate.getFullYear() === prevMsgDate.getFullYear();

    return !isSameDayAsPrev;
  }

  getDateSeparatorText(dateInput: any): string {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    const today = new Date();

    const isToday = date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();

    if (isToday) {
      return 'Today';
    }

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const isYesterday = date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return 'Yesterday';
    }

    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  }

  getSenderAvatar(senderId: string): string {
    if (!senderId || senderId === this.currentUserId) return '';
    const p = (this.ws.currentConversation()?.participants || []).find(part => part.userId === senderId);
    return p?.avatar || '';
  }

  getSenderName(senderId: string): string {
    if (!senderId) return 'Unknown';
    if (senderId === this.currentUserId) return 'You';
    const p = (this.ws.currentConversation()?.participants || []).find(part => part.userId === senderId);
    if (p) return `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email || 'Member';
    return 'Member';
  }

  getOtherParticipantId(): string {
    const conv = this.ws.currentConversation();
    if (!conv) return '';
    const other = (conv.participants || []).find(p => p.userId !== this.currentUserId);
    return other?.userId || '';
  }


  isSequentialMessage(index: number): boolean {
    if (index <= 0) return false;
    const messages = this.chatService.messages();
    if (!messages || !messages[index] || !messages[index - 1]) return false;
    const current = messages[index];
    const prev = messages[index - 1];

    if (current.senderId !== prev.senderId) return false;
    if (this.shouldShowDateSeparator(index)) return false;

    const currentTime = new Date(current.createdAt || Date.now()).getTime();
    const prevTime = new Date(prev.createdAt || Date.now()).getTime();
    return (currentTime - prevTime) <= 5 * 60 * 1000;
  }

  quickEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
  hoveredMsgIndex: number | null = null;

  showMentionDropdown = signal<boolean>(false);
  mentionQuery = signal<string>('');
  pendingMentions = new Set<string>();
  mentionSelectedIndex = signal<number>(0);

  isUploadingFile = signal<boolean>(false);

  parseFileContent(content: string | null): { fileName: string; fileSize?: number; fileType?: string; url?: string } {
    if (!content) return { fileName: 'Attached File' };
    try {
      if (content.startsWith('{') && content.endsWith('}')) {
        return JSON.parse(content);
      }
    } catch (e) { }
    return { fileName: content };
  }

  formatFileSize(bytes?: number): string {
    if (!bytes || isNaN(bytes)) return '';
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  }

  getMentionParticipants(): Participant[] {
    const conv = this.ws.currentConversation();
    if (!conv || !conv.participants) return [];
    const query = this.mentionQuery().toLowerCase().trim();
    return conv.participants.filter(p => {
      if (!p || p.userId === this.currentUserId) return false;
      const fullName = ((p.firstName || '') + ' ' + (p.lastName || '')).toLowerCase();
      const email = (p.email || '').toLowerCase();
      return query === '' || fullName.includes(query) || email.includes(query);
    });
  }

  getMentionName(userId: string): string {
    const conv = this.ws.currentConversation();
    if (!conv || !conv.participants) return 'Member';
    const participant = conv.participants.find(p => p.userId === userId);
    if (participant) {
      return `${participant.firstName || ''} ${participant.lastName || ''}`.trim();
    }
    return 'Member';
  }

  formatMessageContent(msg: any): string {
    if (!msg || !msg.content) return '';
    let content = '';

    if (msg.type === 'file') {
      try {
        const fileData = JSON.parse(msg.content);
        if (!fileData.text) return '';
        content = fileData.text;
      } catch (e) {
        return '';
      }
    } else {
      content = msg.content;
    }

    // Simple HTML escaping to prevent XSS
    content = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Linkify URLs and Emails
    const linkRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])|(www\.[^\s<]+[^<.,:;"')\]\s])|([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
    content = content.replace(linkRegex, (match, httpUrl, wwwUrl, emailUrl) => {
      if (httpUrl) {
        return `<a href="${httpUrl}" target="_blank" class="chat-link" style="text-decoration: underline; color: inherit;">${httpUrl}</a>`;
      } else if (wwwUrl) {
        return `<a href="http://${wwwUrl}" target="_blank" class="chat-link" style="text-decoration: underline; color: inherit;">${wwwUrl}</a>`;
      } else if (emailUrl) {
        return `<a href="mailto:${emailUrl}" class="chat-link" style="text-decoration: underline; color: inherit;">${emailUrl}</a>`;
      }
      return match;
    });

    if (msg.mentions && msg.mentions.length > 0) {
      const conv = this.ws.currentConversation();
      if (conv && conv.participants) {
        msg.mentions.forEach((userId: string) => {
          const participant = conv.participants.find((p: Participant) => p.userId === userId);
          if (participant) {
            const fullName = `${participant.firstName || ''} ${participant.lastName || ''}`.trim();
            const escapedName = fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`@${escapedName}(?!\\w)`, 'gi'); // gi just in case case differs
            const mentionClass = userId === this.currentUserId ? 'mention-badge mention-me' : 'mention-badge';
            content = content.replace(regex, `<span class="${mentionClass}">@${fullName}</span>`);
          }
        });
      }
    }
    
    // Convert newlines to HTML line breaks
    content = content.replace(/\n/g, '<br>');
    
    return content;
  }

  onMessageInput(event: any): void {
    const input = event.target as HTMLTextAreaElement;
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
    const val = input.value || '';
    this.message.set(val);

    const cursor = input.selectionStart || val.length;
    const textBeforeCursor = val.substring(0, cursor);
    const atMatch = textBeforeCursor.match(/(?:^|\s)@([^@]{0,30})$/);

    if (atMatch) {
      const query = atMatch[1];
      // If the query contains more than 2 spaces, probably just a normal sentence after a mention
      if (query.split(' ').length > 2) {
        this.showMentionDropdown.set(false);
        return;
      }

      // If the query exactly matches a participant's name that is already mentioned, don't show
      const isAlreadyMentioned = Array.from(this.pendingMentions).some(userId => {
        const p = this.ws.currentConversation()?.participants?.find(x => x.userId === userId);
        if (!p) return false;
        const fullName = `${p.firstName || ''} ${p.lastName || ''}`.trim();
        return query.startsWith(fullName);
      });

      if (isAlreadyMentioned) {
        this.showMentionDropdown.set(false);
        return;
      }

      this.mentionQuery.set(query);
      this.showMentionDropdown.set(true);
      this.mentionSelectedIndex.set(0);
    } else {
      this.showMentionDropdown.set(false);
    }
  }

  selectMention(participant: Participant): void {
    const val = this.message() || '';
    const atIndex = val.lastIndexOf('@');
    if (atIndex !== -1) {
      const prefix = val.substring(0, atIndex);
      const mentionName = `${participant.firstName || ''} ${participant.lastName || ''}`.trim();
      const newText = `${prefix}@${mentionName} `;
      this.message.set(newText);
      if (participant.userId) {
        this.pendingMentions.add(participant.userId);
      }
    }
    this.showMentionDropdown.set(false);
    setTimeout(() => {
      if (this.messageInputRef) {
        this.messageInputRef.nativeElement.focus();
      }
    }, 0);
  }

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey && !this.showMentionDropdown()) {
      event.preventDefault();
      this.sendMessage();
      return;
    }

    if (event.key === 'Backspace' && this.messageInputRef) {
      const input = this.messageInputRef.nativeElement;
      const cursor = input.selectionStart;
      if (cursor === input.selectionEnd && cursor !== null && cursor > 0) {
        const val = input.value;
        const textBeforeCursor = val.substring(0, cursor);
        const participants = this.ws.currentConversation()?.participants || [];
        
        for (const userId of this.pendingMentions) {
          const p = participants.find(x => x.userId === userId);
          if (p) {
            const fullName = `@${(p.firstName || '')} ${(p.lastName || '')}`.trim();
            const fullNameWithSpace = `${fullName} `;
            let matchedText = '';
            
            if (textBeforeCursor.endsWith(fullNameWithSpace)) {
              matchedText = fullNameWithSpace;
            } else if (textBeforeCursor.endsWith(fullName)) {
              matchedText = fullName;
            }
            
            if (matchedText) {
              event.preventDefault();
              const newText = textBeforeCursor.substring(0, textBeforeCursor.length - matchedText.length) + val.substring(cursor);
              this.message.set(newText);
              this.pendingMentions.delete(userId);
              
              setTimeout(() => {
                input.value = newText;
                input.selectionStart = input.selectionEnd = cursor - matchedText.length;
                input.style.height = 'auto';
                input.style.height = input.scrollHeight + 'px';
              }, 0);
              return;
            }
          }
        }
      }
    }

    if (!this.showMentionDropdown()) return;
    const items = this.getMentionParticipants();
    if (items.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.mentionSelectedIndex.update(idx => (idx + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.mentionSelectedIndex.update(idx => (idx - 1 + items.length) % items.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      const selected = items[this.mentionSelectedIndex() || 0];
      if (selected) {
        this.selectMention(selected);
      }
    } else if (event.key === 'Escape') {
      this.showMentionDropdown.set(false);
    }
  }

  toggleEmojiPicker(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.showEmojiPicker.update(v => !v);
  }

  selectEmojiCategory(categoryId: string): void {
    this.selectedEmojiCategory.set(categoryId);
  }

  getActiveCategoryEmojis(): string[] {
    const cat = this.emojiCategories.find(c => c.id === this.selectedEmojiCategory());
    return cat ? cat.emojis : [];
  }

  onEmojiSelect(emoji: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.message.update(curr => (curr || '') + emoji);
  }

  isPureEmoji(content: string): boolean {
    if (!content) return false;
    const trimmed = content.trim();
    // Check if the string has only emoji characters and is reasonably short (1 to 6 emojis)
    // Using a robust regex approach or clean emoji matching
    if (trimmed.length > 20) return false;
    const nonEmojiChars = trimmed.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2300}-\u{23FF}\s]/gu, '');
    return nonEmojiChars.length === 0 && trimmed.length > 0;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // If the click target was removed from the DOM during event bubbling, ignore it
    if (target && !document.contains(target)) {
      return;
    }

    if (this.showEmojiPicker() && !target.closest('.emoji-picker-popover') && !target.closest('.input-action-btn[title="Emoji"]')) {
      this.showEmojiPicker.set(false);
    }
    if (this.showMentionDropdown() && !target.closest('.mention-dropdown-popover') && !target.closest('.message-input')) {
      this.showMentionDropdown.set(false);
    }
  }

  reactToMessage(msg: any, emoji: string): void {
    if (!msg.reactions) {
      msg.reactions = [];
    }
    const existingIndex = msg.reactions.findIndex((r: any) => r.userId === this.currentUserId);
    if (existingIndex > -1) {
      if (msg.reactions[existingIndex].emoji === emoji) {
        msg.reactions.splice(existingIndex, 1);
      } else {
        msg.reactions[existingIndex].emoji = emoji;
      }
    } else {
      msg.reactions.push({
        userId: this.currentUserId,
        emoji: emoji
      });
    }
    this.chatService.messages.update(msgs => [...msgs]);

    const messageId = msg.messageId || msg.id;
    const convId = msg.conversationId || this.ws.currentConversationId() || '';
    if (messageId && convId) {
      this.ws.sendMessageReaction({
        messageId: messageId,
        conversationId: convId,
        userId: this.currentUserId,
        emoji: emoji
      });
    }
  }

  getUniqueReactions(reactions: any[]): { emoji: string; count: number; hasUserReacted: boolean }[] {
    if (!reactions || !Array.isArray(reactions)) return [];
    const counts = new Map<string, { count: number; hasUserReacted: boolean }>();
    for (const r of reactions) {
      if (!r || !r.emoji) continue;
      const current = counts.get(r.emoji) || { count: 0, hasUserReacted: false };
      current.count += 1;
      if (r.userId === this.currentUserId) {
        current.hasUserReacted = true;
      }
      counts.set(r.emoji, current);
    }
    return Array.from(counts.entries()).map(([emoji, data]) => ({
      emoji,
      count: data.count,
      hasUserReacted: data.hasUserReacted
    }));
  }

  // Audio call
  startAudioCall() {
    const calleeIds = (this.ws.currentConversation()?.participants || [])
      .filter(p => p && p.userId !== this.currentUserId)
      .map(p => p.userId);
    this.initiateAudioCallService.execute(calleeIds, this.ws.currentConversation().id);
    this.router.navigate(['/btc/preview'], {
      state: {
        id: this.ws.currentConversation().id,
        type: CallType.AUDIO,
        title: this.ws.currentConversation().conversationName ? this.ws.currentConversation().conversationName : 'NEW',
        autoJoin: true
      }
    });
  }

  joinMeeting() {
    if (!this.ws.currentConversation() || !this.ws.currentConversation().id) return;
    this.router.navigate(['/btc/preview'], {
      state: {
        id: this.ws.currentConversation().id,
        type: CallType.VIDEO,
        title: this.ws.currentConversation().conversationName ? this.ws.currentConversation().conversationName : 'NEW',
        autoJoin: true
      }
    });
  }

  // Members Popover Methods
  private membersPopoverCloseHandler = (event: Event) => {
    // If the click target was removed from the DOM during event bubbling (e.g. clicking a search result), ignore it
    if (event.target instanceof Node && !document.contains(event.target)) {
      return;
    }
    this.showMembersDropdown = false;
    this.cancelCreateGroup();
    document.removeEventListener('click', this.membersPopoverCloseHandler);
  };

  toggleMembersDropdown(event: Event): void {
    event.stopPropagation();
    this.showMembersDropdown = !this.showMembersDropdown;

    if (this.showMembersDropdown) {
      // Compute fixed position for popover
      const trigger = event.currentTarget as HTMLElement;
      const rect = trigger.getBoundingClientRect();
      this.membersPopoverTop = rect.bottom + 6;
      this.membersPopoverLeft = rect.right - 280; // Approximate width of the panel to align right edges

      setTimeout(() => {
        document.addEventListener('click', this.membersPopoverCloseHandler);
      }, 0);
    } else {
      this.cancelCreateGroup();
      document.removeEventListener('click', this.membersPopoverCloseHandler);
    }
  }

  stopMembersPopoverPropagation(event: Event): void {
    event.stopPropagation();
  }

  cancelCreateGroup(): void {
    this.showCreateGroupInput = false;
    this.newGroupName = '';
    this.newGroupMembers = [];
    this.memberSearchQuery = '';
    this.memberSearchResults = [];
  }

  getDefaultGroupName(): string {
    const participants = this.ws.currentConversation()?.participants || [];
    if (participants.length === 0) return 'New Group';

    // Get first two names
    const names = participants.slice(0, 2).map(p => p.firstName);
    const othersCount = participants.length + this.newGroupMembers.length - 2;

    if (othersCount > 0) {
      return `${names.join(', ')} +${othersCount} others`;
    }
    return names.join(', ');
  }

  onMemberSearch(): void {
    this.memberSearchSelectedIndex = -1; // Reset selection on new search
    if (!this.memberSearchQuery || this.memberSearchQuery.length < 2) {
      this.memberSearchResults = [];
      return;
    }

    // Use the existing search functionality
    this.chatService.searchUsers(this.memberSearchQuery).then(() => {
      let participants: Participant[] = [];
      if (this.ws.currentConversation() && this.ws.currentConversation().participants.length > 0) {
        participants = this.ws.currentConversation().participants;
      }

      // Filter out members who are already in the group
      const existingIds = [
        ...participants.map(p => p.userId),
        ...this.newGroupMembers.map(m => m.userId)
      ];
      this.memberSearchResults = this.chatService.searchResults()
        .filter(user => !existingIds.includes(user.userId));
    });
  }

  onMemberSearchKeydown(event: KeyboardEvent): void {
    const total = this.memberSearchResults.length;
    if (total === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.memberSearchSelectedIndex = Math.min(this.memberSearchSelectedIndex + 1, total - 1);
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.memberSearchSelectedIndex = Math.max(this.memberSearchSelectedIndex - 1, -1);
        break;

      case 'Enter':
        event.preventDefault();
        if (this.memberSearchSelectedIndex >= 0 && this.memberSearchSelectedIndex < total) {
          this.addMemberToGroup(this.memberSearchResults[this.memberSearchSelectedIndex]);
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.memberSearchQuery = '';
        this.memberSearchResults = [];
        this.memberSearchSelectedIndex = -1;
        break;
    }
  }

  addMemberToGroup(member: SearchResult): void {
    // Check if already added
    if (!this.newGroupMembers.find(m => m.conversationId === member.conversationId)) {
      this.newGroupMembers.push(member);
    }
    this.memberSearchQuery = '';
    this.memberSearchResults = [];
    this.memberSearchSelectedIndex = -1;
  }

  async addMemberToExistingGroup(member: SearchResult): Promise<void> {
    const conv = this.ws.currentConversation();
    if (!conv || !conv.id) return;

    try {
      await this.chatService.addMembersToGroup(conv.id, this.currentUserId, [member.userId]);

      // Optimistically add to UI
      if (!conv.participants) conv.participants = [];
      conv.participants.push({
        userId: member.userId,
        email: '',
        firstName: member.name.split(' ')[0],
        lastName: member.name.split(' ').slice(1).join(' ') || '',
        avatar: '',
        status: 'offline',
        username: member.name,
        joinedAt: new Date(),
        role: 'member'
      });
      conv.memberCount = (conv.memberCount || 0) + 1;

      // Close dropdown and clear search
      this.memberSearchQuery = '';
      this.memberSearchResults = [];
      this.memberSearchSelectedIndex = -1;
      this.showMembersDropdown = false;
      this.cancelCreateGroup();

      const currentUserName = this.user.firstName + " " + (this.user.lastName || '');

      // 1st Notification: Sent to the whole group so existing members see it
      let groupMsg: any = {
        conversationId: conv.id,
        messageId: crypto.randomUUID(),
        senderId: this.currentUserId,
        recievedId: null,
        type: "text",
        senderName: currentUserName,
        replyTo: null,
        mentions: [],
        reactions: [],
        clientType: "web",
        createdAt: new Date(),
        editedAt: null,
        status: 1,
        content: `${member.name} was added to the group by ${currentUserName}.`,
        fileUrl: null
      };

      this.chatService.messages.update(msgs => [...msgs, groupMsg]);
      this.ws.sendEvent('send_notification', groupMsg);

      // 2nd Notification: Sent specifically to the newly added member
      let directMsg: any = {
        conversationId: conv.id,
        messageId: crypto.randomUUID(),
        senderId: this.currentUserId,
        recievedId: member.userId,
        type: "text",
        senderName: currentUserName,
        replyTo: null,
        mentions: [],
        reactions: [],
        clientType: "web",
        createdAt: new Date(),
        editedAt: null,
        status: 1,
        content: `You were added to this group by ${currentUserName}.`,
        fileUrl: null
      };
      // We don't add this to the local UI because it's meant for the other user.
      this.ws.sendEvent('send_notification', directMsg);

    } catch (err) {
      console.error('Failed to add member to group', err);
    }
  }

  removeNewGroupMember(member: SearchResult): void {
    this.newGroupMembers = this.newGroupMembers.filter(m => m.conversationId !== member.conversationId);
  }

  createGroup(): void {
    const groupName = this.newGroupName.trim() || this.getDefaultGroupName();
    const newGroupMembers = this.newGroupMembers.reduce((acc, m) => [...acc, ...m.participants], []);

    let participants: Participant[] = [];
    if (this.ws.currentConversation() && this.ws.currentConversation().participants.length > 0) {
      participants = this.ws.currentConversation().participants;
    }

    const allMembers: Participant[] = [
      ...participants,
      ...newGroupMembers
    ];

    // Call API to create group
    this.chatService.createGroupConversation(this.currentUserId, null).then((res: ResponseModel) => {
      // Reset state
      if (res.isSuccess && res.responseBody) {
        this.notifyGroupCreatedService.execute(res.responseBody.id, this.currentUserId);
        this.cancelCreateGroup();
        this.showMembersDropdown = false;
      } else {
        alert("Failed to create group error: " + res.responseBody.responseBody);
      }
    });
  }

  // Message methods
  onScroll(event: any) {
    const element = event.target;
    // Load more when scrolled to top (for loading older messages)
    if (element.scrollTop === 0) {
      this.loadMoreMessages(false);
    }
  }

  loadMoreMessages(scrollToBottom: boolean = false) {
    if (!this.ws.currentConversation()) return;

    // Save current scroll height before loading older messages
    if (!scrollToBottom && this.messagesContainer) {
      this.previousScrollHeight = this.messagesContainer.nativeElement.scrollHeight;
    }

    const conv = this.ws.currentConversation();
    const convId = (conv && (conv.id || conv.conversationId)) ? (conv.id || conv.conversationId) : '';
    this.chatService.getMessages(convId || '', this.pageIndex, 20, this.pageIndex > 1).then(() => {
      this.pageIndex = this.pageIndex + 1;
      if (scrollToBottom) {
        this.shouldScrollToBottom = true;
      } else {
        // Flag to preserve scroll position for older messages
        this.shouldPreserveScrollPosition = true;
      }
    });
  }

  sendMessage() {
    if (this.ws.currentConversation().id == null) {
      // call java to insert or create conversation channel
      this.chatService.createConversation(this.currentUserId, this.ws.currentConversation()).then((res: any) => {
        console.log("channel created", res);
        this.send(res);
      });
    } else {
      this.send(this.ws.currentConversation());
    }
  }

  cleanMessageBeforeSending(rawText: string, mentions: string[]): string {
    let text = rawText;
    const conv = this.ws.currentConversation();
    if (!conv || !conv.participants) return text;

    mentions.forEach(userId => {
      const participant = conv.participants.find(p => p.userId === userId);
      if (participant) {
        const fullName = `${participant.firstName || ''} ${participant.lastName || ''}`.trim();
        const escapedName = fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match @fullName followed optionally by space, removing it from the text
        const regex = new RegExp(`@${escapedName}\\s*`, 'gi');
        text = text.replace(regex, '');
      }
    });
    return text.trim();
  }

  private send(response: any) {
    const hasText = this.message() != null && this.message() !== '';
    const files = this.stagedFiles();
    const hasFile = files && files.length > 0;

    if ((!hasText && !hasFile) || response.id == null) {
      return;
    }

    const currentUserName = this.user.firstName + " " + this.user.lastName;
    const mentionsArray = Array.from(this.pendingMentions);
    const cleanContent = this.cleanMessageBeforeSending(this.message() || '', mentionsArray);

    if (hasFile) {
      for (let i = 0; i < files.length; i++) {
        const fileData = files[i];
        const isFirst = i === 0;

        let event: any = {
          conversationId: response.id,
          messageId: crypto.randomUUID(),
          senderId: this.currentUserId,
          recievedId: null,
          type: "file",
          senderName: currentUserName,
          replyTo: isFirst && this.replyingToMessage() ? (this.replyingToMessage().id || this.replyingToMessage().messageId) : null,
          mentions: isFirst ? mentionsArray : [],
          reactions: [],
          clientType: "web",
          createdAt: new Date(),
          editedAt: null,
          status: 0,
          fileUrl: fileData.url,
          content: JSON.stringify({
            fileName: fileData.fileName,
            fileSize: fileData.fileSize,
            fileType: fileData.fileType,
            url: fileData.url,
            text: isFirst ? cleanContent : ''
          })
        };
        this.chatService.messages.update(msgs => [...msgs, event]);
        this.chatDb.addPendingMessage(event.messageId, event.conversationId, event);
        this.ws.sendMessage(event);
      }
      this.stagedFiles.set([]);
    } else {
      let event: any = {
        conversationId: response.id,
        messageId: crypto.randomUUID(),
        senderId: this.currentUserId,
        recievedId: null,
        type: "text",
        senderName: currentUserName,
        replyTo: this.replyingToMessage() ? (this.replyingToMessage().id || this.replyingToMessage().messageId) : null,
        mentions: mentionsArray,
        reactions: [],
        clientType: "web",
        createdAt: new Date(),
        editedAt: null,
        status: 0,
        content: cleanContent,
        fileUrl: null
      };
      this.chatService.messages.update(msgs => [...msgs, event]);
      this.chatDb.addPendingMessage(event.messageId, event.conversationId, event);
      this.ws.sendMessage(event);
    }

    this.message.set('');
    if (this.messageInputRef) {
      this.messageInputRef.nativeElement.style.height = 'auto';
    }
    this.pendingMentions.clear();
    this.replyingToMessage.set(null);
    this.shouldScrollToBottom = true;
  }

  setReplyTo(msg: any) {
    this.replyingToMessage.set(msg);
    if (this.messageInputRef) {
      this.messageInputRef.nativeElement.focus();
    }
  }

  cancelReply() {
    this.replyingToMessage.set(null);
  }

  getRepliedMessage(replyToId: string): any {
    if (!replyToId) return null;
    return this.chatService.messages().find(m => m.id === replyToId || m.messageId === replyToId);
  }

  getMessageSnippet(msg: any): string {
    if (!msg) return '';
    if (msg.type === 'file') {
      try {
        const fileData = JSON.parse(msg.content);
        return fileData.fileName || 'File attachment';
      } catch (e) {
        return 'File attachment';
      }
    }
    const txt = msg.content || '';
    return txt.length > 50 ? txt.substring(0, 50) + '...' : txt;
  }

  scrollToBottom(): void {
    try {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
      }
    } catch (err) {
      console.error('Error scrolling to bottom:', err);
    }
  }

  async onFileSelected(event: any) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const files = Array.from(input.files);

    if (!this.ws.currentConversation() || !this.ws.currentConversation().id) {
      if (this.ws.currentConversation() && this.ws.currentConversation().id == null) {
        try {
          const res: any = await this.chatService.createConversation(this.currentUserId, this.ws.currentConversation());
          if (res && res.id) {
            this.ws.currentConversation().id = res.id;
          } else {
            alert("Please start the conversation with a text message before attaching files.");
            input.value = '';
            return;
          }
        } catch (e) {
          alert("Please start the conversation with a text message before attaching files.");
          input.value = '';
          return;
        }
      } else {
        alert("Please select a conversation first.");
        input.value = '';
        return;
      }
    }

    this.isUploadingFile.set(true);

    const uploadPromises = files.map(async (file) => {
      const uploadId = crypto.randomUUID();
      this.pendingUploads.update(uploads => [...uploads, { id: uploadId, fileName: file.name, fileSize: file.size, progress: 0 }]);

      try {
        const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
        if (file.size > CHUNK_SIZE) {
          // Multipart Upload
          const startPayload = {
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
            conversationId: this.ws.currentConversation().id
          };
          const startRes: any = await this.chatService.startMultipartUpload(startPayload);
          if (!startRes.isSuccess || !startRes.responseBody) throw new Error("Failed to start multipart");
          const { uploadId: s3UploadId, fileKey } = startRes.responseBody;

          const numChunks = Math.ceil(file.size / CHUNK_SIZE);
          let completedParts: { partNumber: number, eTag: string }[] = [];
          let uploadedBytes = 0;

          // Upload chunks concurrently in batches of 4
          const CONCURRENCY = 4;
          for (let i = 0; i < numChunks; i += CONCURRENCY) {
            const chunkPromises = [];
            for (let j = 0; j < CONCURRENCY && i + j < numChunks; j++) {
              const partNumber = i + j + 1;
              const start = (partNumber - 1) * CHUNK_SIZE;
              const end = Math.min(start + CHUNK_SIZE, file.size);
              const chunk = file.slice(start, end);

              const chunkPromise = (async () => {
                const urlRes: any = await this.chatService.getMultipartPreSignedUrl({ fileKey, uploadId: s3UploadId, partNumber });
                if (!urlRes.isSuccess || !urlRes.responseBody) throw new Error("Failed to get part url");
                const uploadUrl = urlRes.responseBody.uploadUrl;

                return await new Promise<{ partNumber: number, eTag: string }>((resolve, reject) => {
                  const req = new HttpRequest('PUT', uploadUrl, chunk, { reportProgress: true });
                  let lastLoaded = 0;
                  this.httpClient.request(req).subscribe({
                    next: (event: any) => {
                      if (event.type === HttpEventType.UploadProgress && event.total) {
                        const diff = event.loaded - lastLoaded;
                        lastLoaded = event.loaded;
                        uploadedBytes += diff;
                        this.pendingUploads.update(uploads => {
                          const up = uploads.find(u => u.id === uploadId);
                          if (up) up.progress = Math.round((uploadedBytes / file.size) * 100);
                          return [...uploads];
                        });
                      } else if (event.type === HttpEventType.Response) {
                        if (event.status === 200 || event.ok) {
                          const eTag = event.headers.get('ETag');
                          if (!eTag) reject(new Error("No ETag in response"));
                          else resolve({ partNumber, eTag: eTag });
                        } else {
                          reject(new Error("Part upload failed"));
                        }
                      }
                    },
                    error: (err) => reject(err)
                  });
                });
              })();
              chunkPromises.push(chunkPromise);
            }
            const results = await Promise.all(chunkPromises);
            completedParts.push(...results);
          }

          completedParts.sort((a, b) => a.partNumber - b.partNumber);
          const completeRes: any = await this.chatService.completeMultipartUpload({ fileKey, uploadId: s3UploadId, parts: completedParts });
          if (!completeRes.isSuccess || !completeRes.responseBody) throw new Error("Complete failed");

          this.stagedFiles.update(files => [...files, { fileName: file.name, url: completeRes.responseBody.publicUrl, fileSize: file.size, fileType: file.type, fileKey: fileKey }]);
        } else {
          // Standard Single Upload
          const payload = {
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
            conversationId: this.ws.currentConversation().id
          };
          const res: any = await this.chatService.getPresignedUrl(payload);
          if (res.isSuccess && res.responseBody) {
            const { uploadUrl, publicUrl, fileKey } = res.responseBody;

            await new Promise((resolve, reject) => {
              const req = new HttpRequest('PUT', uploadUrl, file, {
                reportProgress: true,
                responseType: 'text',
                headers: new HttpHeaders({ 'Content-Type': 'application/octet-stream' })
              });
              this.httpClient.request(req).subscribe({
                next: (event: any) => {
                  if (event.type === HttpEventType.UploadProgress && event.total) {
                    const progress = Math.round(100 * event.loaded / event.total);
                    this.pendingUploads.update(uploads => {
                      const up = uploads.find(u => u.id === uploadId);
                      if (up) up.progress = progress;
                      return [...uploads];
                    });
                  } else if (event.type === HttpEventType.Response) {
                    if (event.status === 200 || event.ok) {
                      this.stagedFiles.update(files => [...files, { fileName: file.name, url: publicUrl, fileSize: file.size, fileType: file.type, fileKey: fileKey }]);
                      resolve(event);
                    } else {
                      reject(new Error("Upload failed"));
                    }
                  }
                },
                error: (err) => reject(err)
              });
            });
          } else {
            throw new Error("Presigned URL failed");
          }
        }
      } catch (err) {
        console.error('File upload error:', err);
        alert(`Error uploading file: ${file.name}`);
      } finally {
        this.pendingUploads.update(uploads => uploads.filter(u => u.id !== uploadId));
      }
    });

    await Promise.all(uploadPromises);
    this.isUploadingFile.set(false);
    input.value = '';
  }

  async removeStagedFile(index: number) {
    const files = this.stagedFiles();
    const fileToRemove = files[index];
    if (fileToRemove && fileToRemove.fileKey) {
      try {
        await this.chatService.deleteFile(fileToRemove.fileKey);
      } catch (e) {
        console.error('Error deleting file from storage:', e);
      }
    }
    this.stagedFiles.update(files => files.filter((_, i) => i !== index));
  }

  private sendFileMessage(fileName: string, fileUrl: string, fileSize: number, fileType: string) {
    const response = this.ws.currentConversation();
    if (!response || !response.id) return;
    const currentUserName = this.user.firstName + " " + this.user.lastName;
    const event: any = {
      conversationId: response.id,
      messageId: crypto.randomUUID(),
      senderId: this.currentUserId,
      recievedId: null,
      type: "file",
      content: JSON.stringify({ fileName, fileSize, fileType, url: fileUrl }),
      senderName: currentUserName,
      fileUrl: fileUrl,
      replyTo: null,
      mentions: [],
      reactions: [],
      clientType: "web",
      createdAt: new Date(),
      editedAt: null,
      status: 1
    };

    this.chatService.messages.update(msgs => [...msgs, event]);
    this.ws.sendMessage(event);
    this.shouldScrollToBottom = true;
  }
}

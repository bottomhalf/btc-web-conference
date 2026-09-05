import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ManageService } from './manage.service';
import { ManagedUser, UserRole, UserStatus, UserDepartment, UserPermissions } from './user-management.model';
import { ThemeService } from '../providers/services/theme.service';

@Component({
  selector: 'app-manage',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manage.component.html',
  styleUrl: './manage.component.css'
})
export class ManageComponent implements OnInit {
  public manageService = inject(ManageService);
  public themeService = inject(ThemeService);

  // View mode
  viewMode = signal<'table' | 'grid'>('table');

  // Search input model
  searchInput = signal<string>('');

  // Selected filters
  roleFilter = signal<string>('All');
  statusFilter = signal<string>('All');
  departmentFilter = signal<string>('All');

  // Details drawer
  selectedUser = signal<ManagedUser | null>(null);
  isDrawerOpen = signal<boolean>(false);
  activeDrawerTab = signal<'overview' | 'permissions' | 'sessions' | 'activity'>('overview');

  // Add / Edit Modal
  isModalOpen = signal<boolean>(false);
  modalMode = signal<'add' | 'edit'>('add');
  modalUserForm: Partial<ManagedUser> & {
    mobile?: string;
    password?: string;
    avatarUrl?: string;
  } = this.getEmptyUserForm();

  // Delete modal
  isDeleteModalOpen = signal<boolean>(false);
  userToDelete = signal<ManagedUser | null>(null);

  // Roles Matrix Modal
  isRoleMatrixOpen = signal<boolean>(false);

  // Toast notification state
  toastNotification = signal<{ message: string; type: 'success' | 'danger' | 'info' } | null>(null);
  copiedId = signal<string | null>(null);

  // Roles, Departments, Statuses for dropdowns
  readonly availableRoles: UserRole[] = ['Admin', 'Moderator', 'Host', 'Member', 'Guest'];
  readonly availableDepartments: UserDepartment[] = ['Engineering', 'Product', 'Design', 'Marketing', 'Sales', 'Operations', 'HR', 'Executive'];
  readonly availableStatuses: { label: string; value: string }[] = [
    { label: 'All Statuses', value: 'All' },
    { label: 'Online', value: 'online' },
    { label: 'Active', value: 'active' },
    { label: 'Away', value: 'away' },
    { label: 'Busy', value: 'busy' },
    { label: 'Offline', value: 'offline' },
    { label: 'Invited / Pending', value: 'invited' },
    { label: 'Suspended', value: 'suspended' }
  ];

  // Soft avatar background colors matching modern aesthetic
  private readonly avatarColors = [
    'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
    'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
    'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)',
    'linear-gradient(135deg, #14b8a6 0%, #0284c7 100%)'
  ];

  ngOnInit(): void {
    // Initial fetch of directory users from backend API
    this.manageService.loadUsers();
  }

  // Filter actions
  onSearchChange(query: string): void {
    this.searchInput.set(query);
    this.manageService.setSearchQuery(query);
  }

  onRoleFilterChange(role: string): void {
    this.roleFilter.set(role);
    this.manageService.setRoleFilter(role);
  }

  onStatusFilterChange(status: string): void {
    this.statusFilter.set(status);
    this.manageService.setStatusFilter(status);
  }

  onDepartmentFilterChange(dept: string): void {
    this.departmentFilter.set(dept);
    this.manageService.setDepartmentFilter(dept);
  }

  resetAllFilters(): void {
    this.searchInput.set('');
    this.roleFilter.set('All');
    this.statusFilter.set('All');
    this.departmentFilter.set('All');
    this.manageService.resetFilters();
    this.showToast('Filters cleared', 'info');
  }

  toggleViewMode(mode: 'table' | 'grid'): void {
    this.viewMode.set(mode);
  }

  // User Details Drawer
  openUserDetails(user: ManagedUser): void {
    this.selectedUser.set(user);
    this.activeDrawerTab.set('overview');
    this.isDrawerOpen.set(true);
  }

  closeUserDetails(): void {
    this.isDrawerOpen.set(false);
    setTimeout(() => {
      if (!this.isDrawerOpen()) {
        this.selectedUser.set(null);
      }
    }, 250);
  }

  setDrawerTab(tab: 'overview' | 'permissions' | 'sessions' | 'activity'): void {
    this.activeDrawerTab.set(tab);
  }

  // Add & Edit Modals
  openAddUserModal(): void {
    this.modalMode.set('add');
    this.modalUserForm = this.getEmptyUserForm();
    this.isModalOpen.set(true);
  }

  openEditUserModal(user: ManagedUser, event?: Event): void {
    if (event) event.stopPropagation();
    this.modalMode.set('edit');
    this.modalUserForm = JSON.parse(JSON.stringify(user));
    this.isModalOpen.set(true);
  }

  closeUserModal(): void {
    this.isModalOpen.set(false);
  }

  onModalRoleChange(role: UserRole): void {
    if (this.modalUserForm) {
      this.modalUserForm.role = role;
      this.modalUserForm.permissions = this.manageService.getDefaultPermissionsForRole(role);
    }
  }

  async saveUserModal(): Promise<void> {
    if (!this.modalUserForm.firstName || !this.modalUserForm.email) {
      this.showToast('Please fill in required fields (Name & Email)', 'danger');
      return;
    }

    if (this.modalMode() === 'add') {
      const generatedUsername = this.modalUserForm.username ||
        (this.modalUserForm.firstName.toLowerCase() + '.' + (this.modalUserForm.lastName || 'user').toLowerCase());

      const registerPayload = {
        firstName: this.modalUserForm.firstName.trim(),
        lastName: (this.modalUserForm.lastName || '').trim(),
        mobile: (this.modalUserForm.phone || this.modalUserForm.mobile || '').trim(),
        email: this.modalUserForm.email.trim(),
        password: this.modalUserForm.password || 'TempPass@123',
        username: generatedUsername.trim(),
        avatarUrl: this.modalUserForm.avatarUrl || ''
      };

      const result = await this.manageService.registerUserApi(registerPayload, this.modalUserForm);
      if (result.success) {
        this.showToast(result.message || `User ${result.user.firstName} ${result.user.lastName} registered successfully`, 'success');
      } else {
        this.showToast(result.message || 'User added', 'info');
      }
    } else {
      if (this.modalUserForm.id) {
        const updatePayload = {
          id: this.modalUserForm.id,
          firstName: (this.modalUserForm.firstName || '').trim(),
          lastName: (this.modalUserForm.lastName || '').trim(),
          email: (this.modalUserForm.email || '').trim(),
          mobile: (this.modalUserForm.phone || this.modalUserForm.mobile || '').trim(),
          username: (this.modalUserForm.username || '').trim(),
          avatarUrl: this.modalUserForm.avatarUrl || '',
          status: (this.modalUserForm.status || 'ACTIVE').toUpperCase(),
          isActive: this.modalUserForm.status !== 'suspended',
          ...(this.modalUserForm.password ? { password: this.modalUserForm.password } : {})
        };

        const result = await this.manageService.updateUserApi(this.modalUserForm.id, updatePayload, this.modalUserForm);
        if (result.success) {
          this.showToast(result.message || `User ${this.modalUserForm.firstName} updated successfully`, 'success');
        } else {
          this.showToast(result.message || `User ${this.modalUserForm.firstName} updated`, 'info');
        }

        // Refresh details drawer if open
        if (this.selectedUser()?.id === this.modalUserForm.id) {
          const updated = this.manageService.users().find(u => u.id === this.modalUserForm.id);
          if (updated) this.selectedUser.set(updated);
        }
      }
    }

    this.closeUserModal();
  }

  // Delete User Dialog
  openDeleteModal(user: ManagedUser, event?: Event): void {
    if (event) event.stopPropagation();
    this.userToDelete.set(user);
    this.isDeleteModalOpen.set(true);
  }

  closeDeleteModal(): void {
    this.isDeleteModalOpen.set(false);
    this.userToDelete.set(null);
  }

  confirmDeleteUser(): void {
    const user = this.userToDelete();
    if (user) {
      this.manageService.deleteUser(user.id);
      this.showToast(`User ${user.firstName} ${user.lastName} was removed`, 'info');
      if (this.selectedUser()?.id === user.id) {
        this.closeUserDetails();
      }
    }
    this.closeDeleteModal();
  }

  // Quick Action: Toggle user status
  toggleUserStatus(user: ManagedUser, event?: Event): void {
    if (event) event.stopPropagation();
    this.manageService.toggleUserStatus(user.id);
    const updated = this.manageService.users().find(u => u.id === user.id);
    if (updated) {
      this.showToast(`Account status updated to ${updated.status}`, 'success');
      if (this.selectedUser()?.id === user.id) {
        this.selectedUser.set(updated);
      }
    }
  }

  // Bulk actions handlers
  onBulkStatusChange(status: UserStatus): void {
    const count = this.manageService.selectedUserIds().size;
    this.manageService.bulkUpdateStatus(status);
    this.showToast(`Updated status for ${count} users to ${status}`, 'success');
  }

  onBulkRoleChange(role: UserRole): void {
    const count = this.manageService.selectedUserIds().size;
    this.manageService.bulkUpdateRole(role);
    this.showToast(`Assigned role ${role} to ${count} users`, 'success');
  }

  onBulkDelete(): void {
    const count = this.manageService.selectedUserIds().size;
    if (confirm(`Are you sure you want to remove ${count} selected users?`)) {
      this.manageService.bulkDelete();
      this.showToast(`Removed ${count} selected users`, 'info');
    }
  }

  // Role Matrix Modal
  openRoleMatrix(): void {
    this.isRoleMatrixOpen.set(true);
  }

  closeRoleMatrix(): void {
    this.isRoleMatrixOpen.set(false);
  }

  // UI Helpers
  getUserInitials(user: ManagedUser): string {
    const first = (user.firstName || '').trim();
    const last = (user.lastName || '').trim();
    if (first && last) {
      return (first[0] + last[0]).toUpperCase();
    }
    if (first) {
      return first.substring(0, 2).toUpperCase();
    }
    return (user.username || 'U').substring(0, 2).toUpperCase();
  }

  getAvatarBackground(name: string): string {
    if (!name) return this.avatarColors[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % this.avatarColors.length;
    return this.avatarColors[idx];
  }

  getRoleBadgeClass(role: UserRole): string {
    switch (role) {
      case 'Admin': return 'badge-role-admin';
      case 'Moderator': return 'badge-role-moderator';
      case 'Host': return 'badge-role-host';
      case 'Member': return 'badge-role-member';
      case 'Guest': return 'badge-role-guest';
      default: return 'badge-role-member';
    }
  }

  getStatusBadgeClass(status: UserStatus): string {
    switch (status) {
      case 'online':
      case 'active':
        return 'status-badge-active';
      case 'away':
        return 'status-badge-away';
      case 'busy':
        return 'status-badge-busy';
      case 'offline':
        return 'status-badge-offline';
      case 'invited':
        return 'status-badge-invited';
      case 'suspended':
        return 'status-badge-suspended';
      default:
        return 'status-badge-offline';
    }
  }

  getStatusDotClass(status: UserStatus): string {
    switch (status) {
      case 'online':
      case 'active':
        return 'dot-online';
      case 'away':
        return 'dot-away';
      case 'busy':
        return 'dot-busy';
      case 'offline':
        return 'dot-offline';
      case 'invited':
        return 'dot-invited';
      case 'suspended':
        return 'dot-suspended';
      default:
        return 'dot-offline';
    }
  }

  copyToClipboard(text: string, key: string, event?: Event): void {
    if (event) event.stopPropagation();
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      this.copiedId.set(key);
      this.showToast('Copied to clipboard!', 'info');
      setTimeout(() => {
        if (this.copiedId() === key) {
          this.copiedId.set(null);
        }
      }, 2000);
    });
  }

  formatDate(dateStr: string): string {
    if (!dateStr || dateStr === 'Never') return dateStr || '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  formatRelative(dateStr: string): string {
    if (!dateStr || dateStr === 'Never') return dateStr || '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  showToast(message: string, type: 'success' | 'danger' | 'info' = 'success'): void {
    this.toastNotification.set({ message, type });
    setTimeout(() => {
      this.toastNotification.set(null);
    }, 3200);
  }

  private getEmptyUserForm(): Partial<ManagedUser> & { mobile?: string; password?: string; avatarUrl?: string } {
    return {
      firstName: '',
      lastName: '',
      username: '',
      email: '',
      phone: '',
      mobile: '',
      password: '',
      avatarUrl: '',
      role: 'Member',
      status: 'active',
      department: 'Engineering',
      designation: '',
      isEmailVerified: true,
      isTwoFactorEnabled: false,
      permissions: this.manageService.getDefaultPermissionsForRole('Member'),
      notes: ''
    };
  }
}

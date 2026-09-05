import { Injectable, inject, signal, computed } from '@angular/core';
import { ManagedUser, UserStats, UserFilterOptions, UserRole, UserStatus, UserDepartment, UserPermissions, RegisterUserRequest, RegisteredUserResponse, PagedResponse, UpdateUserRequest } from './user-management.model';
import { LocalService } from '../providers/services/local.service';
import { HttpService } from '../providers/services/http.service';

@Injectable({
  providedIn: 'root'
})
export class ManageService {
  private localService = inject(LocalService);
  private httpService = inject(HttpService);

  // Core reactive signals
  private _users = signal<ManagedUser[]>([]);
  private _isLoading = signal<boolean>(false);
  private _error = signal<string | null>(null);
  private _searchQuery = signal<string>('');
  private _selectedRole = signal<string>('All');
  private _selectedStatus = signal<string>('All');
  private _selectedDepartment = signal<string>('All');
  private _sortBy = signal<'name' | 'joinedAt' | 'lastLoginAt' | 'role' | 'status'>('name');
  private _sortDirection = signal<'asc' | 'desc'>('asc');
  private _currentPage = signal<number>(1);
  private _pageSize = signal<number>(10);
  private _totalRecords = signal<number>(0);
  private _selectedUserIds = signal<Set<string>>(new Set());

  // Public readonly views
  readonly users = this._users.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly searchQuery = this._searchQuery.asReadonly();
  readonly selectedRole = this._selectedRole.asReadonly();
  readonly selectedStatus = this._selectedStatus.asReadonly();
  readonly selectedDepartment = this._selectedDepartment.asReadonly();
  readonly sortBy = this._sortBy.asReadonly();
  readonly sortDirection = this._sortDirection.asReadonly();
  readonly currentPage = this._currentPage.asReadonly();
  readonly pageSize = this._pageSize.asReadonly();
  readonly totalRecords = this._totalRecords.asReadonly();
  readonly selectedUserIds = this._selectedUserIds.asReadonly();

  // Filtered & Sorted computed list
  readonly filteredUsers = computed<ManagedUser[]>(() => {
    let list = [...this._users()];
    const query = this._searchQuery().toLowerCase().trim();
    const role = this._selectedRole();
    const status = this._selectedStatus().toLowerCase();
    const dept = this._selectedDepartment();

    // Query filter
    if (query) {
      list = list.filter(u =>
        u.firstName.toLowerCase().includes(query) ||
        u.lastName.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query) ||
        u.userId.toLowerCase().includes(query) ||
        u.username.toLowerCase().includes(query) ||
        u.designation.toLowerCase().includes(query) ||
        u.department.toLowerCase().includes(query)
      );
    }

    // Role filter
    if (role !== 'All') {
      list = list.filter(u => u.role === role);
    }

    // Status filter
    if (status !== 'all') {
      list = list.filter(u => u.status.toLowerCase() === status);
    }

    // Department filter
    if (dept !== 'All') {
      list = list.filter(u => u.department === dept);
    }

    // Sorting
    const sortField = this._sortBy();
    const sortDir = this._sortDirection() === 'asc' ? 1 : -1;

    list.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
          const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
          comparison = nameA.localeCompare(nameB);
          break;
        case 'joinedAt':
          comparison = new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
          break;
        case 'lastLoginAt':
          comparison = new Date(a.lastLoginAt).getTime() - new Date(b.lastLoginAt).getTime();
          break;
        case 'role':
          comparison = a.role.localeCompare(b.role);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
      }
      return comparison * sortDir;
    });

    return list;
  });

  // Paginated user list
  readonly paginatedUsers = computed<ManagedUser[]>(() => {
    const list = this.filteredUsers();
    const page = this._currentPage();
    const size = this._pageSize();
    const start = (page - 1) * size;
    return list.slice(start, start + size);
  });

  // Pagination stats
  readonly totalFilteredCount = computed(() => this.filteredUsers().length);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalFilteredCount() / this._pageSize())));

  // Global Statistics
  readonly stats = computed<UserStats>(() => {
    const all = this._users();
    const activeOnline = all.filter(u => u.status === 'online' || u.status === 'active').length;
    const adminsCount = all.filter(u => u.role === 'Admin').length;
    const moderatorsCount = all.filter(u => u.role === 'Moderator').length;
    const invitedCount = all.filter(u => u.status === 'invited').length;
    const suspendedCount = all.filter(u => u.status === 'suspended').length;

    return {
      totalUsers: all.length,
      activeOnline,
      adminsCount,
      moderatorsCount,
      invitedCount,
      suspendedCount,
      growthRatePercent: 14.8
    };
  });

  constructor() {
    this.initializeDirectory();
  }

  /**
   * Initializes initial dataset combining current logged in user & directory seed
   */
  private initializeDirectory(): void {
    const currentUser = this.localService.getUser();

    const baseSeed: ManagedUser[] = [
      {
        id: 'usr-001',
        userId: 'BOT0035',
        username: 'alex.morgan',
        firstName: 'Alex',
        lastName: 'Morgan',
        email: 'alex.morgan@confeet.com',
        phone: '+1 (555) 234-8901',
        role: 'Admin',
        status: 'online',
        department: 'Engineering',
        designation: 'Lead Platform Architect',
        isEmailVerified: true,
        isTwoFactorEnabled: true,
        joinedAt: '2024-01-15T09:00:00Z',
        lastLoginAt: new Date(Date.now() - 5 * 60000).toISOString(),
        totalMeetingsHosted: 142,
        totalMeetingsAttended: 388,
        permissions: this.getDefaultPermissionsForRole('Admin'),
        sessions: [
          { sessionId: 'sess-101', device: 'Desktop (Chrome 124)', platform: 'Windows 11', ipAddress: '192.168.1.45', location: 'San Francisco, US', lastActive: 'Active now', isCurrent: true },
          { sessionId: 'sess-102', device: 'iPhone 15 Pro', platform: 'iOS 17.4', ipAddress: '10.0.0.12', location: 'San Francisco, US', lastActive: '25m ago' }
        ],
        recentActivities: [
          { id: 'act-1', action: 'Created Meeting', description: 'Hosted "Sprint Architecture Review"', timestamp: '1 hour ago', category: 'meeting' },
          { id: 'act-2', action: 'Security Update', description: 'Updated 2FA security key', timestamp: 'Yesterday', category: 'security' }
        ],
        notes: 'Platform lead administrator with global infrastructure permissions.'
      },
      {
        id: 'usr-002',
        userId: 'BOT0042',
        username: 'sarah.connor',
        firstName: 'Sarah',
        lastName: 'Connor',
        email: 'sarah.connor@confeet.com',
        phone: '+1 (555) 892-4411',
        role: 'Admin',
        status: 'online',
        department: 'Engineering',
        designation: 'VP of Infrastructure',
        isEmailVerified: true,
        isTwoFactorEnabled: true,
        joinedAt: '2023-11-10T10:30:00Z',
        lastLoginAt: new Date(Date.now() - 15 * 60000).toISOString(),
        totalMeetingsHosted: 215,
        totalMeetingsAttended: 512,
        permissions: this.getDefaultPermissionsForRole('Admin'),
        sessions: [
          { sessionId: 'sess-201', device: 'MacBook Pro 16"', platform: 'macOS Sonoma', ipAddress: '172.16.0.4', location: 'Austin, US', lastActive: 'Active now', isCurrent: false }
        ],
        recentActivities: [
          { id: 'act-3', action: 'User Permissions Changed', description: 'Promoted David Miller to Moderator', timestamp: '3 hours ago', category: 'admin' }
        ]
      },
      {
        id: 'usr-003',
        userId: 'BOT0078',
        username: 'david.miller',
        firstName: 'David',
        lastName: 'Miller',
        email: 'david.m@confeet.com',
        phone: '+1 (555) 431-7722',
        role: 'Moderator',
        status: 'busy',
        department: 'Product',
        designation: 'Principal Product Manager',
        isEmailVerified: true,
        isTwoFactorEnabled: true,
        joinedAt: '2024-02-01T08:15:00Z',
        lastLoginAt: new Date(Date.now() - 45 * 60000).toISOString(),
        totalMeetingsHosted: 94,
        totalMeetingsAttended: 240,
        permissions: this.getDefaultPermissionsForRole('Moderator'),
        sessions: [
          { sessionId: 'sess-301', device: 'ThinkPad X1 Carbon', platform: 'Linux Ubuntu', ipAddress: '192.168.2.88', location: 'Seattle, US', lastActive: '45m ago' }
        ],
        recentActivities: [
          { id: 'act-4', action: 'Recorded Meeting', description: 'Completed recording for "Q3 Roadmap Briefing"', timestamp: '2 hours ago', category: 'meeting' }
        ]
      },
      {
        id: 'usr-004',
        userId: 'BOT0091',
        username: 'elena.rostova',
        firstName: 'Elena',
        lastName: 'Rostova',
        email: 'elena.r@confeet.com',
        phone: '+1 (555) 612-9900',
        role: 'Host',
        status: 'online',
        department: 'Design',
        designation: 'Lead UX/UI Designer',
        isEmailVerified: true,
        isTwoFactorEnabled: false,
        joinedAt: '2024-03-12T14:00:00Z',
        lastLoginAt: new Date(Date.now() - 8 * 60000).toISOString(),
        totalMeetingsHosted: 68,
        totalMeetingsAttended: 195,
        permissions: this.getDefaultPermissionsForRole('Host'),
        sessions: [
          { sessionId: 'sess-401', device: 'iMac 24"', platform: 'macOS Ventura', ipAddress: '10.0.1.20', location: 'New York, US', lastActive: 'Active now' }
        ]
      },
      {
        id: 'usr-005',
        userId: 'BOT0104',
        username: 'marcus.vance',
        firstName: 'Marcus',
        lastName: 'Vance',
        email: 'marcus.v@confeet.com',
        phone: '+1 (555) 723-5511',
        role: 'Host',
        status: 'away',
        department: 'Sales',
        designation: 'Enterprise Sales Director',
        isEmailVerified: true,
        isTwoFactorEnabled: true,
        joinedAt: '2024-03-20T11:00:00Z',
        lastLoginAt: new Date(Date.now() - 90 * 60000).toISOString(),
        totalMeetingsHosted: 180,
        totalMeetingsAttended: 220,
        permissions: this.getDefaultPermissionsForRole('Host')
      },
      {
        id: 'usr-006',
        userId: 'BOT0118',
        username: 'aisha.patel',
        firstName: 'Aisha',
        lastName: 'Patel',
        email: 'aisha.patel@confeet.com',
        phone: '+1 (555) 349-2180',
        role: 'Member',
        status: 'online',
        department: 'Engineering',
        designation: 'Senior WebRTC Engineer',
        isEmailVerified: true,
        isTwoFactorEnabled: true,
        joinedAt: '2024-04-05T09:30:00Z',
        lastLoginAt: new Date(Date.now() - 2 * 60000).toISOString(),
        totalMeetingsHosted: 42,
        totalMeetingsAttended: 160,
        permissions: this.getDefaultPermissionsForRole('Member')
      },
      {
        id: 'usr-007',
        userId: 'BOT0132',
        username: 'james.wilson',
        firstName: 'James',
        lastName: 'Wilson',
        email: 'j.wilson@confeet.com',
        phone: '+1 (555) 881-0023',
        role: 'Member',
        status: 'offline',
        department: 'Marketing',
        designation: 'Growth Marketing Manager',
        isEmailVerified: true,
        isTwoFactorEnabled: false,
        joinedAt: '2024-04-18T16:20:00Z',
        lastLoginAt: '2026-09-03T18:30:00Z',
        totalMeetingsHosted: 15,
        totalMeetingsAttended: 88,
        permissions: this.getDefaultPermissionsForRole('Member')
      },
      {
        id: 'usr-008',
        userId: 'BOT0145',
        username: 'chloe.dupont',
        firstName: 'Chloe',
        lastName: 'Dupont',
        email: 'chloe.d@confeet.com',
        phone: '+33 1 42 68 55 00',
        role: 'Member',
        status: 'offline',
        department: 'HR',
        designation: 'People & Culture Lead',
        isEmailVerified: true,
        isTwoFactorEnabled: true,
        joinedAt: '2024-05-02T13:45:00Z',
        lastLoginAt: '2026-09-04T12:00:00Z',
        totalMeetingsHosted: 55,
        totalMeetingsAttended: 120,
        permissions: this.getDefaultPermissionsForRole('Member')
      },
      {
        id: 'usr-009',
        userId: 'BOT0160',
        username: 'liam.chen',
        firstName: 'Liam',
        lastName: 'Chen',
        email: 'liam.chen@confeet.com',
        role: 'Guest',
        status: 'invited',
        department: 'Operations',
        designation: 'Solutions Consultant',
        isEmailVerified: false,
        isTwoFactorEnabled: false,
        joinedAt: '2026-09-01T10:00:00Z',
        lastLoginAt: 'Never',
        totalMeetingsHosted: 0,
        totalMeetingsAttended: 0,
        permissions: this.getDefaultPermissionsForRole('Guest')
      },
      {
        id: 'usr-010',
        userId: 'BOT0175',
        username: 'robert.fox',
        firstName: 'Robert',
        lastName: 'Fox',
        email: 'robert.fox@external-audit.com',
        role: 'Guest',
        status: 'suspended',
        department: 'Executive',
        designation: 'External Compliance Auditor',
        isEmailVerified: true,
        isTwoFactorEnabled: true,
        joinedAt: '2024-01-20T11:15:00Z',
        lastLoginAt: '2026-08-15T14:22:00Z',
        totalMeetingsHosted: 5,
        totalMeetingsAttended: 30,
        permissions: this.getDefaultPermissionsForRole('Guest'),
        notes: 'Access temporarily suspended pending contract renewal.'
      }
    ];

    // If current logged-in user exists, prepend or update them
    if (currentUser && currentUser.userId) {
      const existingIdx = baseSeed.findIndex(u => u.userId === currentUser.userId || u.email === currentUser.email);
      const currentManagedUser: ManagedUser = {
        id: 'usr-current',
        userId: currentUser.userId,
        username: currentUser.firstName ? currentUser.firstName.toLowerCase() : 'admin.user',
        firstName: currentUser.firstName || 'Current',
        lastName: currentUser.lastName || 'User',
        email: currentUser.email || `${currentUser.userId.toLowerCase()}@confeet.com`,
        role: 'Admin',
        status: currentUser.status || 'online',
        department: 'Executive',
        designation: 'Conference Administrator',
        isEmailVerified: true,
        isTwoFactorEnabled: true,
        joinedAt: '2024-01-01T00:00:00Z',
        lastLoginAt: new Date().toISOString(),
        totalMeetingsHosted: 320,
        totalMeetingsAttended: 750,
        permissions: this.getDefaultPermissionsForRole('Admin'),
        sessions: [
          { sessionId: 'sess-curr', device: 'Current Browser Session', platform: 'WebRTC Desktop Client', lastActive: 'Active now', isCurrent: true }
        ],
        recentActivities: [
          { id: 'act-curr-1', action: 'User Directory Access', description: 'Accessed User Management console', timestamp: 'Just now', category: 'admin' }
        ]
      };

      if (existingIdx !== -1) {
        baseSeed[existingIdx] = { ...baseSeed[existingIdx], ...currentManagedUser };
      } else {
        baseSeed.unshift(currentManagedUser);
      }
    }

    this._users.set(baseSeed);
  }

  /**
   * Helper to generate standard permissions by role
   */
  getDefaultPermissionsForRole(role: UserRole): UserPermissions {
    switch (role) {
      case 'Admin':
        return {
          canStartMeeting: true,
          canRecordMeeting: true,
          canShareScreen: true,
          canInviteGuests: true,
          canMuteParticipants: true,
          canManageUsers: true,
          canAccessAdminMonitor: true,
          canManageIntegrations: true
        };
      case 'Moderator':
        return {
          canStartMeeting: true,
          canRecordMeeting: true,
          canShareScreen: true,
          canInviteGuests: true,
          canMuteParticipants: true,
          canManageUsers: false,
          canAccessAdminMonitor: true,
          canManageIntegrations: false
        };
      case 'Host':
        return {
          canStartMeeting: true,
          canRecordMeeting: true,
          canShareScreen: true,
          canInviteGuests: true,
          canMuteParticipants: true,
          canManageUsers: false,
          canAccessAdminMonitor: false,
          canManageIntegrations: false
        };
      case 'Member':
        return {
          canStartMeeting: true,
          canRecordMeeting: false,
          canShareScreen: true,
          canInviteGuests: true,
          canMuteParticipants: false,
          canManageUsers: false,
          canAccessAdminMonitor: false,
          canManageIntegrations: false
        };
      case 'Guest':
        return {
          canStartMeeting: false,
          canRecordMeeting: false,
          canShareScreen: false,
          canInviteGuests: false,
          canMuteParticipants: false,
          canManageUsers: false,
          canAccessAdminMonitor: false,
          canManageIntegrations: false
        };
    }
  }

  // Filter setters
  setSearchQuery(query: string): void {
    this._searchQuery.set(query);
    this._currentPage.set(1);
  }

  setRoleFilter(role: string): void {
    this._selectedRole.set(role);
    this._currentPage.set(1);
  }

  setStatusFilter(status: string): void {
    this._selectedStatus.set(status);
    this._currentPage.set(1);
  }

  setDepartmentFilter(dept: string): void {
    this._selectedDepartment.set(dept);
    this._currentPage.set(1);
  }

  setSorting(field: 'name' | 'joinedAt' | 'lastLoginAt' | 'role' | 'status'): void {
    if (this._sortBy() === field) {
      this._sortDirection.update(dir => dir === 'asc' ? 'desc' : 'asc');
    } else {
      this._sortBy.set(field);
      this._sortDirection.set('asc');
    }
  }

  setPage(page: number): void {
    if (page >= 1) {
      this._currentPage.set(page);
      this.loadUsers(page, this._pageSize());
    }
  }

  setPageSize(size: number): void {
    if (size >= 5) {
      this._pageSize.set(size);
      this._currentPage.set(1);
      this.loadUsers(1, size);
    }
  }

  /**
   * Fetch users from backend API: api/users/get-users?pageNumber=X&pageSize=Y
   */
  async loadUsers(pageNumber: number = this._currentPage(), pageSize: number = this._pageSize()): Promise<void> {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      const url = `users/get-users?pageNumber=${pageNumber}&pageSize=${pageSize}`;
      const res: any = await this.httpService.get(url);

      let pagedData: PagedResponse<RegisteredUserResponse> | null = null;

      if (res) {
        if (res.responseBody && (res.responseBody.data || res.responseBody.totalRecords !== undefined)) {
          pagedData = res.responseBody as PagedResponse<RegisteredUserResponse>;
        } else if (res.data && Array.isArray(res.data)) {
          pagedData = res as PagedResponse<RegisteredUserResponse>;
        } else if (Array.isArray(res)) {
          pagedData = {
            data: res,
            totalRecords: res.length,
            totalPages: Math.ceil(res.length / pageSize),
            currentPage: pageNumber,
            pageSize: pageSize,
            hasNext: false,
            hasPrevious: false
          };
        }
      }

      if (pagedData && pagedData.data && Array.isArray(pagedData.data) && pagedData.data.length > 0) {
        const currentUser = this.localService.getUser();
        const mappedUsers: ManagedUser[] = pagedData.data.map((u: RegisteredUserResponse, index: number) => {
          const isCurrUser = currentUser && (currentUser.userId === u.id || currentUser.email === u.email);
          const role: UserRole = isCurrUser ? 'Admin' : 'Member';
          const statusLower = (u.status || 'active').toLowerCase();
          const userStatus: UserStatus = (statusLower === 'online' || statusLower === 'away' || statusLower === 'busy' || statusLower === 'offline' || statusLower === 'suspended' || statusLower === 'invited')
            ? statusLower as UserStatus
            : 'active';

          return {
            id: u.id || 'usr-' + index,
            userId: u.id || 'BOT' + Math.floor(1000 + Math.random() * 9000),
            username: u.username || (u.firstName ? `${u.firstName.toLowerCase()}.${(u.lastName || 'user').toLowerCase()}` : `user_${index}`),
            firstName: u.firstName || 'User',
            lastName: u.lastName || '',
            email: u.email || '',
            phone: '',
            avatar: u.avatarUrl || '',
            role: role,
            status: userStatus,
            department: 'Engineering',
            designation: isCurrUser ? 'Conference Administrator' : 'Team Member',
            isEmailVerified: true,
            isTwoFactorEnabled: false,
            joinedAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
            lastLoginAt: u.updatedAt ? new Date(u.updatedAt).toISOString() : 'Never',
            totalMeetingsHosted: 0,
            totalMeetingsAttended: 0,
            permissions: this.getDefaultPermissionsForRole(role),
            sessions: isCurrUser ? [
              { sessionId: 'sess-curr', device: 'Current Browser Session', platform: 'WebRTC Desktop Client', lastActive: 'Active now', isCurrent: true }
            ] : [],
            recentActivities: [
              { id: 'act-' + (u.id || index), action: 'Directory Sync', description: 'Loaded from directory database', timestamp: 'Just now', category: 'profile' }
            ]
          };
        });

        this._users.set(mappedUsers);
        this._totalRecords.set(pagedData.totalRecords ?? mappedUsers.length);
        this._currentPage.set(pagedData.currentPage ?? pageNumber);
        this._pageSize.set(pagedData.pageSize ?? pageSize);
      }
    } catch (err: any) {
      console.warn('Backend API users/get-users returned an error or is offline:', err);
    } finally {
      this._isLoading.set(false);
    }
  }

  resetFilters(): void {
    this._searchQuery.set('');
    this._selectedRole.set('All');
    this._selectedStatus.set('All');
    this._selectedDepartment.set('All');
    this._sortBy.set('name');
    this._sortDirection.set('asc');
    this._currentPage.set(1);
  }

  // Selection management
  toggleSelectUser(userId: string): void {
    this._selectedUserIds.update(set => {
      const newSet = new Set(set);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  }

  toggleSelectAll(): void {
    const currentPaginated = this.paginatedUsers();
    const currentSelected = this._selectedUserIds();
    const allSelectedInPage = currentPaginated.every(u => currentSelected.has(u.id));

    this._selectedUserIds.update(set => {
      const newSet = new Set(set);
      if (allSelectedInPage) {
        currentPaginated.forEach(u => newSet.delete(u.id));
      } else {
        currentPaginated.forEach(u => newSet.add(u.id));
      }
      return newSet;
    });
  }

  clearSelection(): void {
    this._selectedUserIds.set(new Set());
  }

  isUserSelected(id: string): boolean {
    return this._selectedUserIds().has(id);
  }

  isAllPageSelected(): boolean {
    const pageUsers = this.paginatedUsers();
    if (pageUsers.length === 0) return false;
    return pageUsers.every(u => this._selectedUserIds().has(u.id));
  }

  // CRUD Operations
  /**
   * Register a user via backend API: api/users/register
   */
  async registerUserApi(payload: RegisterUserRequest, formMeta: Partial<ManagedUser>): Promise<{ success: boolean; message: string; user: ManagedUser }> {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      // Calls endpoint: api/users/register (HttpService prepends appServerBaseUrl http://localhost:7801/api/)
      const res: any = await this.httpService.post('users/register', payload);

      let responseUser: RegisteredUserResponse | null = null;
      let isSuccess = false;
      let message = 'User registered successfully';

      if (res) {
        if (res.responseBody) {
          responseUser = res.responseBody as RegisteredUserResponse;
          isSuccess = res.isSuccess ?? (res.httpStatusCode === 200 || res.httpStatusCode === 201);
          message = res.message || message;
        } else if (res.id || res.username || res.email) {
          responseUser = res as RegisteredUserResponse;
          isSuccess = true;
        } else if (res.isSuccess) {
          isSuccess = true;
          message = res.message || message;
        } else if (res.httpStatusCode === 200 || res.httpStatusCode === 201) {
          isSuccess = true;
        }
      }

      const role = (formMeta.role || 'Member') as UserRole;
      const serverId = responseUser?.id || 'usr-' + Date.now().toString(36);
      const serverUserId = responseUser?.id || formMeta.userId || 'BOT' + Math.floor(1000 + Math.random() * 9000);

      const createdUser: ManagedUser = {
        id: serverId,
        userId: serverUserId,
        username: responseUser?.username || payload.username,
        firstName: responseUser?.firstName || payload.firstName,
        lastName: responseUser?.lastName || payload.lastName,
        email: responseUser?.email || payload.email,
        phone: payload.mobile,
        avatar: responseUser?.avatarUrl || payload.avatarUrl || '',
        role: role,
        status: (responseUser?.status?.toLowerCase() as UserStatus) || (formMeta.status as UserStatus) || 'active',
        department: (formMeta.department || 'Engineering') as UserDepartment,
        designation: formMeta.designation || 'Team Member',
        isEmailVerified: true,
        isTwoFactorEnabled: formMeta.isTwoFactorEnabled ?? false,
        joinedAt: responseUser?.createdAt ? new Date(responseUser.createdAt).toISOString() : new Date().toISOString(),
        lastLoginAt: 'Never',
        totalMeetingsHosted: 0,
        totalMeetingsAttended: 0,
        permissions: formMeta.permissions || this.getDefaultPermissionsForRole(role),
        notes: formMeta.notes || '',
        recentActivities: [
          {
            id: 'act-' + Date.now(),
            action: 'Account Registered',
            description: 'User registered via users/register API',
            timestamp: 'Just now',
            category: 'profile'
          }
        ]
      };

      this._users.update(users => [createdUser, ...users]);
      return { success: true, message, user: createdUser };

    } catch (err: any) {
      const errMsg = err?.message || err?.errorMessage || 'Registration API error';
      this._error.set(errMsg);
      // Create local managed user as fallback
      const fallback = this.addUser({
        ...formMeta,
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.mobile,
        username: payload.username,
        avatar: payload.avatarUrl
      });
      return { success: false, message: errMsg, user: fallback };
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Update a user via backend API: api/users/update
   */
  async updateUserApi(id: string, payload: UpdateUserRequest, formMeta: Partial<ManagedUser>): Promise<{ success: boolean; message: string; user?: ManagedUser }> {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      // Calls endpoint: api/users/update (HttpService prepends appServerBaseUrl http://localhost:7801/api/)
      const res: any = await this.httpService.post('users/update', payload);

      let responseUser: RegisteredUserResponse | null = null;
      let isSuccess = false;
      let message = 'User updated successfully';

      if (res) {
        if (res.responseBody) {
          responseUser = res.responseBody as RegisteredUserResponse;
          isSuccess = res.isSuccess ?? (res.httpStatusCode === 200 || res.httpStatusCode === 201);
          message = res.message || message;
        } else if (res.id || res.username || res.email) {
          responseUser = res as RegisteredUserResponse;
          isSuccess = true;
        } else if (res.isSuccess) {
          isSuccess = true;
          message = res.message || message;
        } else if (res.httpStatusCode === 200 || res.httpStatusCode === 201) {
          isSuccess = true;
        }
      }

      const updatedRole = (formMeta.role || 'Member') as UserRole;
      let updatedUser: ManagedUser | undefined;

      this._users.update(users => users.map(u => {
        if (u.id === id || u.userId === id || (payload.id && (u.id === payload.id || u.userId === payload.id))) {
          const updatedPermissions = formMeta.permissions || (formMeta.role && formMeta.role !== u.role ? this.getDefaultPermissionsForRole(updatedRole) : u.permissions);
          const statusLower = (responseUser?.status || payload.status || u.status || 'active').toLowerCase();
          const userStatus: UserStatus = (statusLower === 'online' || statusLower === 'away' || statusLower === 'busy' || statusLower === 'offline' || statusLower === 'suspended' || statusLower === 'invited')
            ? statusLower as UserStatus
            : 'active';

          updatedUser = {
            ...u,
            ...formMeta,
            firstName: responseUser?.firstName || payload.firstName || u.firstName,
            lastName: responseUser?.lastName || payload.lastName || u.lastName,
            email: responseUser?.email || payload.email || u.email,
            phone: payload.mobile || u.phone,
            username: responseUser?.username || payload.username || u.username,
            avatar: responseUser?.avatarUrl || payload.avatarUrl || u.avatar,
            role: updatedRole,
            status: userStatus,
            permissions: updatedPermissions,
            lastLoginAt: responseUser?.updatedAt ? new Date(responseUser.updatedAt).toISOString() : u.lastLoginAt,
            recentActivities: [
              {
                id: 'act-' + Date.now(),
                action: 'Profile Updated',
                description: 'User details updated via users/update API',
                timestamp: 'Just now',
                category: 'admin'
              },
              ...(u.recentActivities || [])
            ]
          };
          return updatedUser;
        }
        return u;
      }));

      return { success: true, message, user: updatedUser };

    } catch (err: any) {
      const errMsg = err?.message || err?.errorMessage || 'Update API error';
      this._error.set(errMsg);
      // Fallback local update
      this.updateUser(id, formMeta);
      const fallbackUser = this._users().find(u => u.id === id || u.userId === id);
      return { success: false, message: errMsg, user: fallbackUser };
    } finally {
      this._isLoading.set(false);
    }
  }

  addUser(user: Partial<ManagedUser>): ManagedUser {
    const role = (user.role || 'Member') as UserRole;
    const newUser: ManagedUser = {
      id: 'usr-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
      userId: user.userId || 'BOT' + Math.floor(1000 + Math.random() * 9000),
      username: user.username || (user.firstName ? user.firstName.toLowerCase() + '.' + (user.lastName || 'user').toLowerCase() : 'new.user'),
      firstName: user.firstName || 'New',
      lastName: user.lastName || 'User',
      email: user.email || 'user@confeet.com',
      phone: user.phone || '',
      role: role,
      status: (user.status || 'invited') as UserStatus,
      department: (user.department || 'Engineering') as UserDepartment,
      designation: user.designation || 'Team Member',
      isEmailVerified: user.isEmailVerified ?? false,
      isTwoFactorEnabled: user.isTwoFactorEnabled ?? false,
      joinedAt: new Date().toISOString(),
      lastLoginAt: 'Never',
      totalMeetingsHosted: 0,
      totalMeetingsAttended: 0,
      permissions: user.permissions || this.getDefaultPermissionsForRole(role),
      notes: user.notes || '',
      recentActivities: [
        { id: 'act-' + Date.now(), action: 'Account Created', description: 'User profile registered in directory', timestamp: 'Just now', category: 'profile' }
      ]
    };

    this._users.update(users => [newUser, ...users]);
    return newUser;
  }

  updateUser(id: string, updates: Partial<ManagedUser>): boolean {
    let found = false;
    this._users.update(users => users.map(u => {
      if (u.id === id) {
        found = true;
        const updatedRole = (updates.role || u.role) as UserRole;
        const updatedPermissions = updates.permissions || (updates.role && updates.role !== u.role ? this.getDefaultPermissionsForRole(updatedRole) : u.permissions);
        return {
          ...u,
          ...updates,
          role: updatedRole,
          permissions: updatedPermissions,
          recentActivities: [
            { id: 'act-' + Date.now(), action: 'Profile Updated', description: 'User details updated by administrator', timestamp: 'Just now', category: 'admin' },
            ...(u.recentActivities || [])
          ]
        };
      }
      return u;
    }));
    return found;
  }

  deleteUser(id: string): boolean {
    let existed = false;
    this._users.update(users => {
      const filtered = users.filter(u => u.id !== id);
      existed = filtered.length !== users.length;
      return filtered;
    });

    this._selectedUserIds.update(set => {
      const newSet = new Set(set);
      newSet.delete(id);
      return newSet;
    });

    return existed;
  }

  toggleUserStatus(id: string): void {
    this._users.update(users => users.map(u => {
      if (u.id === id) {
        const nextStatus: UserStatus = u.status === 'suspended' ? 'active' : 'suspended';
        return {
          ...u,
          status: nextStatus,
          recentActivities: [
            { id: 'act-' + Date.now(), action: 'Status Changed', description: `Status changed to ${nextStatus}`, timestamp: 'Just now', category: 'security' },
            ...(u.recentActivities || [])
          ]
        };
      }
      return u;
    }));
  }

  // Bulk Operations
  bulkUpdateStatus(status: UserStatus): void {
    const selected = this._selectedUserIds();
    if (selected.size === 0) return;

    this._users.update(users => users.map(u => {
      if (selected.has(u.id)) {
        return {
          ...u,
          status,
          recentActivities: [
            { id: 'act-' + Date.now(), action: 'Bulk Status Update', description: `Status changed to ${status}`, timestamp: 'Just now', category: 'admin' },
            ...(u.recentActivities || [])
          ]
        };
      }
      return u;
    }));
    this.clearSelection();
  }

  bulkUpdateRole(role: UserRole): void {
    const selected = this._selectedUserIds();
    if (selected.size === 0) return;

    this._users.update(users => users.map(u => {
      if (selected.has(u.id)) {
        return {
          ...u,
          role,
          permissions: this.getDefaultPermissionsForRole(role),
          recentActivities: [
            { id: 'act-' + Date.now(), action: 'Bulk Role Update', description: `Role updated to ${role}`, timestamp: 'Just now', category: 'admin' },
            ...(u.recentActivities || [])
          ]
        };
      }
      return u;
    }));
    this.clearSelection();
  }

  bulkDelete(): void {
    const selected = this._selectedUserIds();
    if (selected.size === 0) return;

    this._users.update(users => users.filter(u => !selected.has(u.id)));
    this.clearSelection();
  }

  // Export utilities
  exportToCsv(): void {
    const users = this.filteredUsers();
    if (users.length === 0) return;

    const headers = ['User ID', 'First Name', 'Last Name', 'Email', 'Role', 'Status', 'Department', 'Designation', 'Joined Date', 'Meetings Hosted'];
    const rows = users.map(u => [
      `"${u.userId}"`,
      `"${u.firstName}"`,
      `"${u.lastName}"`,
      `"${u.email}"`,
      `"${u.role}"`,
      `"${u.status}"`,
      `"${u.department}"`,
      `"${u.designation}"`,
      `"${new Date(u.joinedAt).toLocaleDateString()}"`,
      u.totalMeetingsHosted
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `confeet_users_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  exportToJson(): void {
    const users = this.filteredUsers();
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(users, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `confeet_users_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }
}

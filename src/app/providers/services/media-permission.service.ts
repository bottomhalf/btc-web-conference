// media-permissions.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, fromEvent } from 'rxjs';

export interface MediaPermissions {
  camera: PermissionState;
  microphone: PermissionState;
  isSupported?: boolean;
  lastChecked?: Date;
}

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

@Injectable({
  providedIn: 'root'
})
export class MediaPermissionsService {
  private permissionsSubject = new BehaviorSubject<MediaPermissions>({
    camera: 'unknown',
    microphone: 'unknown',
    isSupported: false,
    lastChecked: new Date()
  });

  public permissions$ = this.permissionsSubject.asObservable();

  private cameraPermission?: PermissionStatus;
  private microphonePermission?: PermissionStatus;
  private eventListeners: (() => void)[] = [];

  // Prevent concurrent permission checks
  private isChecking = false;
  private pendingCheck = false;
  // Debounce timer
  private checkDebounceTimer?: any;

  constructor() {
    this.initializePermissionMonitoring();
  }

  private async initializePermissionMonitoring(): Promise<void> {
    // Initial check
    await this.checkPermissions();

    // Set up event-based monitoring
    this.setupEventListeners();

    // Set up Permissions API change listeners if supported
    await this.setupPermissionChangeListeners();
  }

  private setupEventListeners(): void {
    // Listen for visibility change events (when user switches tabs and comes back)
    if (typeof document !== 'undefined') {
      const visibilityChangeHandler = () => {
        if (!document.hidden) {
          this.checkPermissions();
        }
      };
      document.addEventListener('visibilitychange', visibilityChangeHandler);
      this.eventListeners.push(() =>
        document.removeEventListener('visibilitychange', visibilityChangeHandler)
      );
    }

    // Listen for focus events (when user comes back to the page)
    if (typeof window !== 'undefined') {
      const focusHandler = () => this.checkPermissions();
      window.addEventListener('focus', focusHandler);
      this.eventListeners.push(() =>
        window.removeEventListener('focus', focusHandler)
      );

      // Listen for page show event (back/forward navigation)
      const pageShowHandler = () => this.checkPermissions();
      window.addEventListener('pageshow', pageShowHandler);
      this.eventListeners.push(() =>
        window.removeEventListener('pageshow', pageShowHandler)
      );
    }

    // Listen for device changes (when devices are plugged/unplugged)
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      const deviceChangeHandler = () => {
        // Small delay to allow system to update permissions
        setTimeout(() => this.checkPermissions(), 100);
      };
      navigator.mediaDevices.addEventListener('devicechange', deviceChangeHandler);
      this.eventListeners.push(() =>
        navigator.mediaDevices.removeEventListener('devicechange', deviceChangeHandler)
      );
    }
  }

  private async setupPermissionChangeListeners(): Promise<void> {
    if (!this.isPermissionsAPISupported()) {
      return;
    }

    try {
      // Set up camera permission listener
      this.cameraPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
      this.cameraPermission.addEventListener('change', () => {
        this.checkPermissions();
      });

      // Set up microphone permission listener
      this.microphonePermission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      this.microphonePermission.addEventListener('change', () => {
        this.checkPermissions();
      });
    } catch (error) {
      console.warn('Could not set up permission change listeners:', error);
      // Fallback to periodic checking only when page is visible (less frequent)
      this.setupFallbackMonitoring();
    }
  }

  private setupFallbackMonitoring(): void {
    // Only for browsers that don't support permission change events
    // Check only when page becomes visible and less frequently
    let fallbackInterval: number;

    const startFallbackChecking = () => {
      // Check every 10 seconds instead of 2 seconds, and only when page is visible
      fallbackInterval = window.setInterval(() => {
        if (!document.hidden) {
          this.checkPermissions();
        }
      }, 10000);
    };

    const stopFallbackChecking = () => {
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
    };

    // Start checking when page is visible
    if (!document.hidden) {
      startFallbackChecking();
    }

    // Start/stop checking based on page visibility
    const visibilityHandler = () => {
      if (document.hidden) {
        stopFallbackChecking();
      } else {
        this.checkPermissions();
        startFallbackChecking();
      }
    };

    document.addEventListener('visibilitychange', visibilityHandler);
    this.eventListeners.push(() => {
      document.removeEventListener('visibilitychange', visibilityHandler);
      stopFallbackChecking();
    });
  }

  async checkPermissions(): Promise<MediaPermissions> {
    // Debounce: Don't check if already checking, queue for later
    if (this.isChecking) {
      this.pendingCheck = true;
      return this.permissionsSubject.value;
    }

    this.isChecking = true;

    try {
      const permissions: MediaPermissions = {
        camera: 'unknown',
        microphone: 'unknown',
        isSupported: this.isPermissionsAPISupported(),
        lastChecked: new Date()
      };

      if (permissions.isSupported) {
        // Use Permissions API if supported - this doesn't activate camera
        try {
          const [cameraResult, microphoneResult] = await Promise.allSettled([
            this.queryPermission('camera'),
            this.queryPermission('microphone')
          ]);

          // Only use fallback if query completely fails, not just rejected
          permissions.camera = cameraResult.status === 'fulfilled'
            ? cameraResult.value
            : 'unknown';  // Don't fallback to getUserMedia here

          permissions.microphone = microphoneResult.status === 'fulfilled'
            ? microphoneResult.value
            : 'unknown';  // Don't fallback to getUserMedia here

        } catch (error) {
          // Keep as unknown rather than activating camera
          permissions.camera = 'unknown';
          permissions.microphone = 'unknown';
        }
      }
      // Note: Removed fallback for browsers without Permissions API
      // The fallback getUserMedia approach causes camera light to turn on

      // Only emit if permissions actually changed
      const currentPermissions = this.permissionsSubject.value;
      if (this.hasPermissionsChanged(currentPermissions, permissions)) {
        this.permissionsSubject.next(permissions);
      }

      return permissions;
    } finally {
      this.isChecking = false;

      // Process pending check if any
      if (this.pendingCheck) {
        this.pendingCheck = false;
        // Small delay before next check
        setTimeout(() => this.checkPermissions(), 100);
      }
    }
  }

  private hasPermissionsChanged(current: MediaPermissions, updated: MediaPermissions): boolean {
    return current.camera !== updated.camera ||
      current.microphone !== updated.microphone ||
      current.isSupported !== updated.isSupported;
  }

  private async queryPermission(name: 'camera' | 'microphone'): Promise<PermissionState> {
    try {
      if (!navigator.permissions) {
        throw new Error('Permissions API not supported');
      }

      const permissionName = name === 'camera' ? 'camera' : 'microphone';
      const result = await navigator.permissions.query({ name: permissionName as PermissionName });
      return result.state as PermissionState;
    } catch (error) {
      throw error;
    }
  }

  private async fallbackPermissionCheck(type: 'camera' | 'microphone'): Promise<PermissionState> {
    try {
      // First check if devices are available
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasDevice = type === 'camera'
        ? devices.some(device => device.kind === 'videoinput')
        : devices.some(device => device.kind === 'audioinput');

      if (!hasDevice) {
        return 'denied'; // No device available
      }

      const constraints: MediaStreamConstraints = {
        video: type === 'camera' ? { width: 1, height: 1 } : false,
        audio: type === 'microphone' ? true : false
      };

      // Try to get access with minimal resource usage
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Check if we got the requested track
      const hasRequestedTrack = type === 'camera'
        ? stream.getVideoTracks().length > 0
        : stream.getAudioTracks().length > 0;

      // Clean up immediately
      stream.getTracks().forEach(track => track.stop());

      return hasRequestedTrack ? 'granted' : 'denied';

    } catch (error: any) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        return 'denied';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        return 'denied';
      } else if (error.name === 'NotSupportedError') {
        return 'denied';
      }
      return 'unknown';
    }
  }

  private isPermissionsAPISupported(): boolean {
    return !!(navigator.permissions && navigator.permissions.query);
  }

  // Method to request permissions explicitly
  async requestPermissions(camera: boolean = true, microphone: boolean = true): Promise<MediaPermissions> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasVideoDevice = devices.some(d => d.kind === 'videoinput');
      const hasAudioDevice = devices.some(d => d.kind === 'audioinput');

      const constraints: MediaStreamConstraints = {
        video: camera && hasVideoDevice,
        audio: microphone && hasAudioDevice
      };

      // If no devices are requested/available, just check and return
      if (!constraints.video && !constraints.audio) {
        await this.checkPermissions();
        return this.getCurrentPermissions();
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Clean up the stream immediately after getting permission
      stream.getTracks().forEach(track => track.stop());

      // Permissions will be automatically updated via event listeners
      // But we can force a check to get immediate feedback
      await this.checkPermissions();

      return this.getCurrentPermissions();
    } catch (error) {
      console.error('Error requesting media permissions:', error);
      await this.checkPermissions();
      return this.getCurrentPermissions();
    }
  }

  async requesMictPermissions(microphone: boolean = true): Promise<MediaPermissions> {
    try {
      const constraints: MediaStreamConstraints = {
        audio: microphone
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Clean up the stream immediately after getting permission
      stream.getTracks().forEach(track => track.stop());

      // Permissions will be automatically updated via event listeners
      // But we can force a check to get immediate feedback
      await this.checkPermissions();

      return this.getCurrentPermissions();
    } catch (error) {
      console.error('Error requesting media permissions:', error);
      await this.checkPermissions();
      return this.getCurrentPermissions();
    }
  }

  // Force a manual check (useful for user-triggered checks)
  async forceCheck(): Promise<MediaPermissions> {
    return await this.checkPermissions();
  }

  // Get current permissions synchronously (last known state)
  getCurrentPermissions(): MediaPermissions {
    return this.permissionsSubject.value;
  }

  // Check if specific permission is granted
  isCameraGranted(): boolean {
    return this.getCurrentPermissions().camera === 'granted';
  }

  isMicrophoneGranted(): boolean {
    return this.getCurrentPermissions().microphone === 'granted';
  }

  // Check if both permissions are granted
  areBothGranted(): boolean {
    const permissions = this.getCurrentPermissions();
    return permissions.camera === 'granted' && permissions.microphone === 'granted';
  }

  // Cleanup method
  destroy(): void {
    // Remove all event listeners
    this.eventListeners.forEach(removeListener => removeListener());
    this.eventListeners = [];

    // Remove permission change listeners
    if (this.cameraPermission) {
      this.cameraPermission.removeEventListener('change', () => this.checkPermissions());
    }
    if (this.microphonePermission) {
      this.microphonePermission.removeEventListener('change', () => this.checkPermissions());
    }
  }
}
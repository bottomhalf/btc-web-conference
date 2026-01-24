import { Injectable, OnInit, signal } from '@angular/core';
import { HttpService } from '../providers/services/http.service';

@Injectable({
    providedIn: 'root'
})
export class DeviceService implements OnInit {
    selectedCamera = signal<string | null>(null);
    selectedMic = signal<string | null>(null);
    selectedSpeaker = signal<string | null>(null);

    cameras = signal<MediaDeviceInfo[] | null>(null);
    microphones = signal<MediaDeviceInfo[] | null>(null);
    speakers = signal<MediaDeviceInfo[] | null>(null);

    constructor(private http: HttpService) { }

    ngOnInit(): void {
        this.loadDevices();
    }

    /** Load available media devices */
    async loadDevices() {
        try {
            // Request permission first - this is required to get real device IDs
            // const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

            const camPerm = await navigator.permissions.query({ name: 'camera' as PermissionName });
            const micPerm = await navigator.permissions.query({ name: 'microphone' as PermissionName });

            let stream: MediaStream | null = null;

            // Request permission ONLY if needed
            if (camPerm.state === 'prompt' || micPerm.state === 'prompt') {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: camPerm.state !== 'denied',
                    audio: micPerm.state !== 'denied'
                });
            }
            else if (camPerm.state === 'denied' || micPerm.state === 'denied') {
                // Don't spam getUserMedia if blocked
                console.warn('Camera or microphone permission denied');
            }

            // Now enumerate devices - after permission granted, we get real device IDs
            const devices = await navigator.mediaDevices.enumerateDevices();

            this.cameras.set(devices.filter(d => d.kind === 'videoinput'));
            this.microphones.set(devices.filter(d => d.kind === 'audioinput'));
            this.speakers.set(devices.filter(d => d.kind === 'audiooutput'));


            if (stream) {
                // Get the device IDs from the active tracks (these are the default devices)
                const videoTrack = stream.getVideoTracks()[0];
                const audioTrack = stream.getAudioTracks()[0];

                // Set selected devices from the active stream tracks (these are the actual defaults)
                this.selectedCamera.set(videoTrack?.getSettings().deviceId || this.cameras()[0]?.deviceId || null);
                this.selectedMic.set(audioTrack?.getSettings().deviceId || this.microphones()[0]?.deviceId || null);

                // ⚠️ THIS IS MISSING - Add this to stop the camera!
                stream.getTracks().forEach(track => track.stop());
            } else {
                // No permission yet → select first available device logically
                this.selectedCamera.set(this.cameras()[0]?.deviceId ?? null);
                this.selectedMic.set(this.microphones()[0]?.deviceId ?? null);
            }

            this.selectedSpeaker.set(this.speakers()[0]?.deviceId ?? null);
        } catch (err) {
            // Fallback: try to enumerate without permission (will have empty deviceIds)
            console.error('Error accessing media devices', err);
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.cameras.set(devices.filter(d => d.kind === 'videoinput'));
            this.microphones.set(devices.filter(d => d.kind === 'audioinput'));
            this.speakers.set(devices.filter(d => d.kind === 'audiooutput'));
        }
    }
}

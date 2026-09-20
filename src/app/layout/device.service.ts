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

            // Check if devices actually exist before requesting access
            const preDevices = await navigator.mediaDevices.enumerateDevices();
            const hasVideoDevice = preDevices.some(d => d.kind === 'videoinput');
            const hasAudioDevice = preDevices.some(d => d.kind === 'audioinput');

            let stream: MediaStream | null = null;

            // Request permission ONLY if needed and device exists
            if ((camPerm.state === 'prompt' && hasVideoDevice) || (micPerm.state === 'prompt' && hasAudioDevice)) {
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: camPerm.state !== 'denied' && hasVideoDevice,
                        audio: micPerm.state !== 'denied' && hasAudioDevice
                    });
                } catch (permErr) {
                    console.warn('Camera/microphone prompt cancelled or denied during device load:', permErr);
                }
            } else if (camPerm.state === 'denied' || micPerm.state === 'denied') {
                console.warn('Camera or microphone permission denied');
            }

            try {
                // Now enumerate devices - after permission granted, we get real device IDs and labels
                const devices = await navigator.mediaDevices.enumerateDevices();

                this.cameras.set(devices.filter(d => d.kind === 'videoinput'));
                this.microphones.set(devices.filter(d => d.kind === 'audioinput'));
                this.speakers.set(devices.filter(d => d.kind === 'audiooutput'));

                if (stream) {
                    const videoTrack = stream.getVideoTracks()[0];
                    const audioTrack = stream.getAudioTracks()[0];

                    this.selectedCamera.set(videoTrack?.getSettings().deviceId || this.cameras()[0]?.deviceId || null);
                    this.selectedMic.set(audioTrack?.getSettings().deviceId || this.microphones()[0]?.deviceId || null);
                } else {
                    if (!this.selectedCamera() && this.cameras()?.length) {
                        this.selectedCamera.set(this.cameras()[0]?.deviceId ?? null);
                    }
                    if (!this.selectedMic() && this.microphones()?.length) {
                        this.selectedMic.set(this.microphones()[0]?.deviceId ?? null);
                    }
                }

                if (!this.selectedSpeaker() && this.speakers()?.length) {
                    this.selectedSpeaker.set(this.speakers()[0]?.deviceId ?? null);
                }
            } finally {
                // CRITICAL: Stop probe stream immediately in finally block so camera LED does not stick!
                if (stream) {
                    stream.getTracks().forEach(track => {
                        track.stop();
                    });
                }
            }
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

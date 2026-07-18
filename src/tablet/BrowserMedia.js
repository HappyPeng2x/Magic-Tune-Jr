// Browser implementations of ScratchJr's native microphone and camera bridges.

function uuid () {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export class AudioCapture {
    constructor () {
        this.audio = new Audio();
        this.chunks = [];
        this.volume = 0;
    }

    start () {
        this.id = uuid();
        this.chunks = [];
        this.savedBlob = null;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
            return this.id + '.webm';
        }
        navigator.mediaDevices.getUserMedia({audio: true}).then(function (stream) {
            this.stream = stream;
            this.recorder = new MediaRecorder(stream);
            this.recorder.ondataavailable = function (event) {
                if (event.data && event.data.size) this.chunks.push(event.data);
            }.bind(this);
            this.recorder.start();
            this.startMeter(stream);
        }.bind(this)).catch(function (err) {
            console.warn('Microphone unavailable:', err);
        });
        return this.id + '.webm';
    }

    startMeter (stream) {
        var AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        this.context = this.context || new AudioContext();
        if (this.context.state === 'suspended') this.context.resume().catch(function () {});
        this.source = this.context.createMediaStreamSource(stream);
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 256;
        this.samples = new Uint8Array(this.analyser.fftSize);
        this.source.connect(this.analyser);
    }

    getVolume () {
        if (!this.analyser) return 0;
        this.analyser.getByteTimeDomainData(this.samples);
        var sum = 0;
        for (var i = 0; i < this.samples.length; i++) {
            var sample = (this.samples[i] - 128) / 128;
            sum += sample * sample;
        }
        return Math.min(1, Math.sqrt(sum / this.samples.length) * 4);
    }

    stop (whenDone) {
        if (this.recorder && this.recorder.state !== 'inactive') {
            this.recorder.onstop = function () {
                this.savedBlob = null;
                if (whenDone) whenDone();
            }.bind(this);
            this.recorder.stop();
            return;
        }
        if (this.source) this.source.disconnect();
        this.source = null;
        this.analyser = null;
        if (whenDone) whenDone();
    }

    blob () {
        if (!this.savedBlob && this.chunks.length) {
            var type = (this.recorder && this.recorder.mimeType) || 'audio/webm';
            this.savedBlob = new Blob(this.chunks, {type: type});
        }
        return this.savedBlob;
    }

    play () {
        var blob = this.blob();
        if (!blob) return;
        this.stopPlay();
        this.playUrl = URL.createObjectURL(blob);
        this.audio.src = this.playUrl;
        this.audio.play().catch(function () {});
    }

    stopPlay () {
        this.audio.pause();
        this.audio.currentTime = 0;
        if (this.playUrl) URL.revokeObjectURL(this.playUrl);
        this.playUrl = null;
    }

    releaseStream () {
        if (this.stream) this.stream.getTracks().forEach(function (track) { track.stop(); });
        this.stream = null;
        if (this.source) this.source.disconnect();
        this.source = null;
        this.analyser = null;
    }
}

export class CameraCapture {
    constructor (data) {
        this.data = data;
        this.facingMode = 'user';
    }

    show () {
        this.container = document.createElement('div');
        this.container.id = 'cameraPickerDiv';
        this.container.style.position = 'absolute';
        this.container.style.zIndex = 90000;
        this.video = document.createElement('video');
        this.video.autoplay = true;
        this.video.playsInline = true;
        this.mask = document.createElement('img');
        this.mask.src = this.data.image;
        this.container.appendChild(this.video);
        this.container.appendChild(this.mask);
        document.getElementById('backdrop').appendChild(this.container);
        this.layout(this.video, this.data.x, this.data.y, this.data.width, this.data.height);
        this.layout(this.mask, this.data.mx, this.data.my, this.data.mw, this.data.mh);
        this.start();
    }

    layout (element, x, y, width, height) {
        element.style.position = 'absolute';
        element.style.left = x + 'px';
        element.style.top = y + 'px';
        if (width) element.style.width = width + 'px';
        if (height) element.style.height = height + 'px';
    }

    start () {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
        navigator.mediaDevices.getUserMedia({
            video: {width: this.data.width, height: this.data.height, facingMode: this.facingMode},
            audio: false
        }).then(function (stream) {
            this.stream = stream;
            this.video.srcObject = stream;
            this.video.style.transform = this.facingMode === 'user' ? 'scale(-1, 1)' : 'none';
        }.bind(this)).catch(function (err) {
            console.warn('Camera unavailable:', err);
        });
    }

    switchCamera (mode) {
        this.stopStream();
        this.facingMode = mode === 'back' ? 'environment' : 'user';
        this.start();
    }

    snapshot () {
        if (!this.stream || !this.video.videoWidth) return null;
        var canvas = document.createElement('canvas');
        canvas.width = this.data.width;
        canvas.height = this.data.height;
        var context = canvas.getContext('2d');
        if (this.facingMode === 'user') {
            context.translate(canvas.width, 0);
            context.scale(-1, 1);
        }
        context.drawImage(this.video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
    }

    stopStream () {
        if (this.stream) this.stream.getTracks().forEach(function (track) { track.stop(); });
        this.stream = null;
        if (this.video) this.video.srcObject = null;
    }

    hide () {
        this.stopStream();
        if (this.container) this.container.remove();
        this.container = null;
    }
}

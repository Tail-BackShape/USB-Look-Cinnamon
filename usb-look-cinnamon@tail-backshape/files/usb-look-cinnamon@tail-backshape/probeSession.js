'use strict';

// Tracks popup-only probes and invalidates results after close, filter
// changes and unplug events. No process inspection when inactive.
var ProbeSession = class ProbeSession {
    constructor(inspector, runner, scheduler, cancellableFactory, intervalMs = 5000) {
        this._inspector = inspector;
        this._runner = runner;
        this._scheduler = scheduler;
        this._cancellableFactory = cancellableFactory;
        this._intervalMs = Math.max(3000, intervalMs);
        this._active = false;
        this._generation = 0;
        this._pending = null;
        this._cancellable = null;
        this._devices = [];
        this._onUpdate = null;
    }

    open(devices, onUpdate) {
        this.close();
        this._active = true;
        this._devices = (devices || []).slice();
        this._onUpdate = onUpdate;
        this._inspectCycle();
    }

    updateDevices(devices) {
        const list = (devices || []).slice();
        if (this._active) {
            const callback = this._onUpdate;
            this.open(list, callback);
        } else {
            this._devices = list;
        }
    }

    close() {
        this._active = false;
        this._generation++;
        if (this._pending !== null) {
            this._scheduler.cancel(this._pending);
            this._pending = null;
        }
        if (this._cancellable) {
            try { this._cancellable.cancel(); } catch (error) {
                // Ignore cancellation races.
            }
            this._cancellable = null;
        }
        this._onUpdate = null;
    }

    async _inspectCycle() {
        if (!this._active) return;
        const token = this._generation;
        this._cancellable = this._cancellableFactory();
        for (const device of this._devices) {
            if (!this._active || token !== this._generation) return;
            let result;
            try {
                result = await this._inspector.inspectDevice(
                    device, this._runner, this._cancellable);
            } catch (error) {
                result = {status:'Unknown',
                    reason:error && error.message || 'Probe unavailable',
                    processes:[],mounts:[]};
            }
            if (!this._active || token !== this._generation) return;
            if (this._onUpdate) this._onUpdate(device.id, result);
        }
        if (this._active && token === this._generation) {
            this._cancellable = null;
            this._pending = this._scheduler.schedule(() => {
                this._pending = null;
                this._inspectCycle();
            }, this._intervalMs);
        }
    }
};

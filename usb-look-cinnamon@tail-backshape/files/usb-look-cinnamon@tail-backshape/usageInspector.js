'use strict';

// Optional, read-only usage detection. Never opens a monitored device.
// Neither lsof nor findmnt receives a command shell or interpolated script.
function unknown(reason) {
    return {status:'Unknown',reason:String(reason || 'Information unavailable'),processes:[],mounts:[],checkedAt:Date.now()};
}
function parseLsof(stdout, stderr, exitCode) {
    const lines = typeof stdout === 'string' ? stdout.split(/\r?\n/) : [];
    const processes = [];
    let current = null;
    let invalid = false;
    for (const line of lines) {
        if (!line) continue;
        if (line[0] === 'p') {
            if (!/^p[1-9][0-9]*$/.test(line)) {
                invalid = true;
                current = null;
                continue;
            }
            const pid = Number(line.slice(1));
            if (!Number.isSafeInteger(pid)) {
                invalid = true;
                current = null;
                continue;
            }
            current = {pid,command:'Unknown'};
            processes.push(current);
        } else if (line[0] === 'c' && current) {
            current.command = line.slice(1) || 'Unknown';
        }
    }
    if (invalid) return unknown('Malformed lsof output');
    if (processes.length > 0)
        return {status:'Busy',reason:'Visible open file descriptors',processes,mounts:[],checkedAt:Date.now()};
    if (exitCode === 1 && !(stderr || '').trim()) {
        return {status:'Not in use',reason:'No open processes visible to this user; not proof of exclusivity',
            processes:[],mounts:[],checkedAt:Date.now()};
    }
    return unknown((stderr || '').trim() || 'lsof returned no usable process evidence');
}
function parseMounts(stdout, stderr, exitCode) {
    const mounts = typeof stdout === 'string' ?
        stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
    if (exitCode === 0 && mounts.length)
        return {status:'Mounted',reason:'findmnt reports a mount target',
            processes:[],mounts,checkedAt:Date.now()};
    if (exitCode === 1 && !(stderr || '').trim())
        return {status:'Unmounted',reason:'No mount found for this block node',
            processes:[],mounts:[],checkedAt:Date.now()};
    return unknown((stderr || '').trim() || 'Mount state unavailable');
}

// Cinnamon's auto-export scanner recognizes var, but not async function declarations.
var inspectDevice = async function(device, runner, cancellable) {
    const categories = device && Array.isArray(device.categories) ? device.categories : [];
    const storage = categories.includes('storage');
    const inspectOpeners = categories.some(c => ['serial','camera','debug'].includes(c));
    if (!storage && !inspectOpeners)
        return unknown('No reliable generic busy indicator for this USB class');
    const nodes = (device && Array.isArray(device.nodes) ? device.nodes : [])
        .filter(node => typeof node === 'string' && node.startsWith('/dev/') &&
                        !/[\0\r\n]/.test(node)).slice(0, 8);
    if (nodes.length === 0) return unknown('No accessible device node found');
    if (!runner || typeof runner.run !== 'function')
        return unknown('Usage inspection helper unavailable');
    const results = [];
    for (const node of nodes) {
        try {
            const args = storage ?
                ['findmnt','--noheadings','--raw','--output','TARGET','--source',node] :
                ['lsof','-n','-P','-Fpc','--',node];
            const result = await runner.run(args, cancellable);
            results.push(storage ?
                parseMounts(result.stdout,result.stderr,result.exitCode) :
                parseLsof(result.stdout,result.stderr,result.exitCode));
        } catch (error) {
            results.push(unknown(error && error.message || String(error)));
        }
    }
    if (storage) {
        const mounts = Array.from(new Set(results.flatMap(r => r.mounts || [])));
        if (mounts.length)
            return {status:'Mounted',reason:'findmnt reports a mount target',
                processes:[],mounts,checkedAt:Date.now()};
        if (results.every(r => r.status === 'Unmounted'))
            return {status:'Unmounted',reason:'No mount found on inspected block nodes',
                processes:[],mounts:[],checkedAt:Date.now()};
        return unknown(results.find(r => r.status === 'Unknown')?.reason || 'Unknown mount state');
    }
    const processes = [];
    const seen = new Set();
    for (const result of results) {
        for (const process of result.processes || []) {
            if (!seen.has(process.pid)) {
                seen.add(process.pid);
                processes.push(process);
            }
        }
    }
    if (processes.length)
        return {status:'Busy',reason:'Visible open file descriptors',
            processes,mounts:[],checkedAt:Date.now()};
    if (results.every(r => r.status === 'Not in use'))
        return {status:'Not in use',reason:'No process visible to this user; not proof of exclusivity',
            processes:[],mounts:[],checkedAt:Date.now()};
    return unknown(results.find(r => r.status === 'Unknown')?.reason || 'Unknown usage state');
};

// A cancelled asynchronous GIO operation does not terminate its subprocess.
// Terminate only the lsof/findmnt subprocess that this runner created.
function createGioRunner(Gio, GLib, timeoutMs = 5000) {
    return {
        run(argv, cancellable) {
            return new Promise((resolve, reject) => {
                if (cancellable && typeof cancellable.is_cancelled === 'function' &&
                    cancellable.is_cancelled()) {
                    reject(new Error('Inspection cancelled'));
                    return;
                }
                let proc = null;
                let cancelledId = 0;
                let timeoutId = 0;
                let completed = false;

                function settle(error, result) {
                    if (completed) return;
                    completed = true;
                    if (timeoutId) {
                        GLib.source_remove(timeoutId);
                        timeoutId = 0;
                    }
                    if (cancelledId && cancellable) {
                        cancellable.disconnect(cancelledId);
                        cancelledId = 0;
                    }
                    if (error) reject(error);
                    else resolve(result);
                }

                function terminate(reason) {
                    if (completed) return;
                    if (proc) {
                        try { proc.force_exit(); } catch (_) {
                            // The subprocess may already have exited.
                        }
                    }
                    settle(new Error(reason));
                }

                try {
                    const flags = Gio.SubprocessFlags.STDOUT_PIPE |
                                  Gio.SubprocessFlags.STDERR_PIPE;
                    proc = Gio.Subprocess.new(argv, flags);

                    // Gio.Cancellable.connect() is a cancellation convenience
                    // method, not GObject.connect('cancelled', callback).
                    if (cancellable)
                        cancelledId = cancellable.connect(
                            () => terminate('Inspection cancelled'));
                    if (cancellable && cancellable.is_cancelled()) {
                        terminate('Inspection cancelled');
                        return;
                    }
                    timeoutId = GLib.timeout_add(
                        GLib.PRIORITY_DEFAULT, timeoutMs, () => {
                            terminate('Inspection timeout');
                            return GLib.SOURCE_REMOVE;
                        });
                    proc.communicate_utf8_async(null, null, (process, res) => {
                        try {
                            const finished = process.communicate_utf8_finish(res);
                            settle(null, {
                                stdout: finished[1] || '',
                                stderr: finished[2] || '',
                                exitCode: process.get_exit_status()
                            });
                        } catch (error) {
                            settle(error);
                        }
                    });
                } catch (error) {
                    // If setup fails after spawning, do not leave a helper.
                    if (proc && !completed) {
                        try { proc.force_exit(); } catch (_) {}
                    }
                    settle(error);
                }
            });
        }
    };
}

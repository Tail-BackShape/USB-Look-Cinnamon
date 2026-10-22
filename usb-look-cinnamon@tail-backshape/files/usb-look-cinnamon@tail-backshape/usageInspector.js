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

async function inspectDevice(device, runner, cancellable) {
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
                ['lsof','-b','-n','-P','-Fpc','--',node];
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
}

function createGioRunner(Gio) {
    return {
        run(argv,cancellable) {
            return new Promise((resolve,reject) => {
                try {
                    const flags = Gio.SubprocessFlags.STDOUT_PIPE |
                        Gio.SubprocessFlags.STDERR_PIPE;
                    const proc = Gio.Subprocess.new(argv,flags);
                    proc.communicate_utf8_async(null,cancellable || null,(process,res) => {
                        try {
                            const finished = process.communicate_utf8_finish(res);
                            resolve({
                                stdout: finished[1] || '',stderr:finished[2] || '',
                                exitCode:process.get_exit_status()
                            });
                        } catch (error) {
                            reject(error);
                        }
                    });
                } catch (error) {
                    reject(error);
                }
            });
        }
    };
}

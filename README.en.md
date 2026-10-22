# USB-Look-Cinnamon

[日本語README](README.md) · [Approved design (Japanese)](docs/superpowers/specs/2026-10-22-usb-look-cinnamon-design.md) · [Implementation plan](docs/superpowers/plans/2026-10-22-usb-look-cinnamon.md)

> **Development snapshot v0.1.0 — not hardware-validated.** Source and mocked tests exist, but acceptance testing on Linux Mint / Cinnamon 6.6.7 has not been completed. This is not a stable release.

USB-Look-Cinnamon is a lightweight, read-only Cinnamon panel applet that shows connected USB devices, their identifiers, and usage evidence where observable.

## Implemented in source

- Nine device categories, with **per-category** on/off switches only: serial, debug, storage, HID, camera, audio, network, hubs, other
- GUdev hotplug monitoring, physical-device deduplication, composite-interface grouping
- Panel icon/count using the native Cinnamon font and theme
- Search, collapsible categories and details, device paths/drivers, clipboard copy
- Optional `lsof` process/PID inspection for applicable nodes; `findmnt` mount state for storage
- Usage checks only while the popup is visible; stale results invalidated after close, removal, or filter changes
- Optional connect/disconnect notifications (disabled by default)

No generic, reliable exclusive-use state exists for all USB device classes. A `Not in use` label describes only what this user could observe; it cannot guarantee availability. `Unknown` is used when evidence is insufficient.

## Requirements

- Linux Mint / Cinnamon 6.6.7 is the initial target (**not yet tested on hardware**)
- Cinnamon JavaScript runtime and GUdev GI typelib (`gir1.2-gudev-1.0` on Ubuntu/Mint distributions)
- Optional `lsof` for process inspection; `findmnt` (typically from `util-linux`) for mount inspection
- No mandatory daemon, Python virtual environment, or Docker

On Mint/Ubuntu, install dependencies if missing:

```bash
sudo apt install gir1.2-gudev-1.0
sudo apt install lsof
```

## Local installation (experimental)

From the repository root:

```bash
sh scripts/install-local.sh
```

The script copies the applet into `~/.local/share/cinnamon/applets/usb-look-cinnamon@tail-backshape/` (or under `XDG_DATA_HOME`). It refuses to replace an existing directory. For upgrades, back up and manually replace the previous applet.

Enable **USB-Look-Cinnamon** in Cinnamon **System Settings → Applets**. Left-click to open the viewer; right-click for Cinnamon's native menu. Configure the nine category switches from the applet settings.

For removal, first remove the applet from the panel, then inspect and delete only its dedicated applet directory. The installer never writes to system directories.

## Development and testing

```bash
npm test
npm run check
sh -n scripts/install-local.sh
```

Node.js 18+ tests use mocked GUdev/Cinnamon fixtures. They do **not** substitute for GUI, hardware, permission, hotplug, and resource tests described in [the manual test matrix](docs/test-matrix.md).

## Safety and license

The applet does not open monitored devices, reset USB, terminate processes, force unmounts, flash firmware, elevate privileges, or send data to an external service. IDE-to-port associations are intentionally out of scope.

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CHANGELOG.md](CHANGELOG.md). Copyright (c) 2026 Tail-BackShape. Licensed under [MIT](LICENSE).

The repository remains private until its owner decides on a future open-source publication.

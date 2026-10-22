# USB-Look-Cinnamon

[日本語](README.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md)

A Cinnamon panel applet for viewing connected USB devices and their usage state. Browse devices by category, search for a product or port, and inspect available process and mount information.

## Features

- Show or hide nine categories: serial, debug, storage, HID, camera, audio, USB network, hubs, and other
- Update the device list on USB events and show a device count in the panel
- Group composite interfaces under one physical device
- Search by product name, VID/PID, or device node
- View manufacturer, sysfs paths, device nodes, and drivers; copy device identifiers
- Show process names/PIDs for applicable devices and mount targets for storage
- Optional connect/disconnect notifications, disabled by default

Usage checks run only while the popup is open. The applet uses the Cinnamon theme and system font.

## Requirements

- Linux Mint / Cinnamon
- GUdev GObject Introspection typelib (`gir1.2-gudev-1.0` on Mint/Ubuntu)
- Optional `lsof` for process information
- `findmnt` for mount information, normally included in `util-linux`

**v0.1.0 is a development version.** Device listing, search, category filtering, detail menus, and execution of usage checks have been checked on Linux Mint 22.3 / Cinnamon 6.6.9. USB hotplug, detection of active device users and storage mounts, and resource usage measurements remain unverified.

## Installation

On Mint/Ubuntu, install GUdev if missing. Add `lsof` if you want process information.

```bash
sudo apt install gir1.2-gudev-1.0
sudo apt install lsof
```

Clone the repository and run the installer:

```bash
git clone https://github.com/Tail-BackShape/USB-Look-Cinnamon.git
cd USB-Look-Cinnamon
sh scripts/install-local.sh
```

Open Cinnamon **System Settings → Applets** and add **USB-Look-Cinnamon** to the panel.

The installer copies the applet to `~/.local/share/cinnamon/applets/usb-look-cinnamon@tail-backshape/`, or to `cinnamon/applets/usb-look-cinnamon@tail-backshape/` under `XDG_DATA_HOME` when set. No additional background daemon is required.

### Updating and uninstalling

The installer refuses to overwrite an existing directory. To update, remove the applet from the panel, move its installation directory elsewhere as a backup, and run the installer from the updated source. Then add the applet to the panel again.

To uninstall, remove the applet from the panel, then delete only its dedicated installation directory listed above.

## Usage

1. Left-click the panel icon to open the device list.
2. Search by product name, VID/PID, or port.
3. Expand a category and device to view details and usage state.
4. Open settings from the right-click menu to change categories, the panel count, and notifications.

Search filters only the popup list. The panel count includes physical devices in enabled categories and excludes root hubs.

### Understanding usage states

| State | Meaning |
| --- | --- |
| `Busy` | A process visible to this user has the device open. |
| `Not in use` | No process visible to this user was found with the device open. |
| `Mounted` | A mount target was found for an inspected device node. |
| `Unmounted` | No mount target was found for the inspected device nodes. |
| `Unknown` | The device class is unsupported, information is insufficient, permissions prevent inspection, or a helper reports warnings. |

`Not in use` does not guarantee that a device is available. Processes belonging to other users may be invisible. When filesystem warnings from `lsof` leave the result incomplete, the applet shows `Unknown`.

## Read-only operation

The applet does not open monitored devices, reset USB devices, force unmounts, flash firmware, terminate processes using devices, elevate privileges, or send data externally. On cancellation or timeout, it terminates only the temporary `lsof` / `findmnt` helpers it started.

## Development and bug reports

Use Node.js 18 or later:

```bash
npm test
npm run check
sh -n scripts/install-local.sh
```

Automated tests use mocked GUdev and Cinnamon APIs. See the [manual test matrix](docs/test-matrix.md) for hardware checks and the [design specification (Japanese)](docs/superpowers/specs/2026-10-22-usb-look-cinnamon-design.md) for development decisions.

Report bugs in [Issues](https://github.com/Tail-BackShape/USB-Look-Cinnamon/issues) with your OS and Cinnamon versions, reproduction steps, and expected and actual results. Remove personal information and device serial numbers from logs before sharing them.

## License

[MIT](LICENSE) · Copyright (c) 2026 Tail-BackShape.

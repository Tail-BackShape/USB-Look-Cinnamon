# USB-Look-Cinnamon

[日本語README](README.md)

> **Pre-implementation: this repository currently contains a design specification, not an installable Cinnamon applet.**

USB-Look-Cinnamon is a planned lightweight open-source applet for the Linux Mint Cinnamon panel. It aims to show connected USB devices, their identities, and device-type-specific usage information.

## Planned features

- List USB serial devices, debug probes, storage, HID, cameras, audio, network adapters, hubs, and other USB devices
- Display available VID/PID, product, device nodes, and kernel driver information
- Update on USB connect and disconnect events
- Enable or disable monitoring **by device category only** (no per-device toggles)
- Where observable, show processes and PIDs opening serial ports and other applicable device nodes
- Inherit Cinnamon's system font and light/dark theme
- Report an explicit Unknown status when usage information cannot be determined

USB usage cannot be measured consistently for all device classes. “Not in use” does not guarantee exclusive access or future availability.

## Project status

- [x] Core requirements agreed
- [x] UI and interaction design agreed
- [x] Design specification drafted
- [ ] Final specification review and implementation plan
- [ ] Applet implementation
- [ ] Automated and real-device testing
- [ ] First release

**There is no installable build yet.** Installation instructions will be added after implementation and verification.

## Platform and architecture

The initial validation target is **Linux Mint / Cinnamon 6.6.7**, with future consideration of Cinnamon 6.x compatibility. The intended stack is CJS/JavaScript with GUdev, without a mandatory additional resident daemon.

See the [design specification (Japanese)](docs/superpowers/specs/2026-10-22-usb-look-cinnamon-design.md).

## Safety and scope

The first release is intended to be **read-only**. USB reset/disconnect, forced process termination, firmware flashing, and IDE-project association are not in scope. No remote service is required, and sensitive device identifiers should not be included in diagnostic logs.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance and [CHANGELOG.md](CHANGELOG.md) for project history.

Copyright (c) 2026 Tail-BackShape. Licensed under the [MIT License](LICENSE).

The repository is currently private and is being prepared for a potential future public open-source release.

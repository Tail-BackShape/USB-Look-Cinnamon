#!/bin/sh
# Installs into the current user's Cinnamon applet directory only.
set -eu
uuid='usb-look-cinnamon@tail-backshape'
script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
source_dir="$script_dir/../usb-look-cinnamon@tail-backshape/files/$uuid"
data_dir="${XDG_DATA_HOME:-$HOME/.local/share}"
target_parent="$data_dir/cinnamon/applets"
target="$target_parent/$uuid"

if [ ! -f "$source_dir/applet.js" ] || [ ! -f "$source_dir/metadata.json" ]; then
    printf '%s\n' 'Error: Applet sources were not found.' >&2
    exit 1
fi
if [ -e "$target" ]; then
    printf '%s\n' "Error: $target already exists. Back it up or remove it yourself before reinstalling." >&2
    exit 1
fi

mkdir -p "$target_parent"
cp -R "$source_dir" "$target"
printf '%s\n' "Installed to: $target"
printf '%s\n' 'Enable USB-Look-Cinnamon in Cinnamon Settings > Applets.'

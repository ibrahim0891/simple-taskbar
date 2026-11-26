// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const IMAGE_EXT_RE = /\.(jpe?g|png|webp)$/i;

/**
 * Return the user's XDG backgrounds directory path.
 *
 * @returns {string} Path to `~/.local/share/backgrounds`.
 */
export function userBackgroundsDir() {
    return `${GLib.get_user_data_dir()}/backgrounds`;
}

/**
 * Recursively collect wallpaper image entries under `dirPath`.
 *
 * @param {string} dirPath Directory path to scan.
 * @param {boolean} isUserScope Whether entries live in the user data folder.
 * @param {Array<object>} out Output array receiving image metadata objects.
 */
export function collectWallpaperImages(dirPath, isUserScope, out) {
    const dir = Gio.File.new_for_path(dirPath);
    if (!dir.query_exists(null))
        return;

    let enumerator;
    try {
        enumerator = dir.enumerate_children(
            'standard::name,standard::type',
            Gio.FileQueryInfoFlags.NONE,
            null
        );
    } catch {
        return;
    }

    let info;
    while ((info = enumerator.next_file(null)) !== null) {
        const name = info.get_name();
        const childPath = `${dirPath}/${name}`;
        if (info.get_file_type() === Gio.FileType.DIRECTORY) {
            collectWallpaperImages(childPath, isUserScope, out);
        } else if (info.get_file_type() === Gio.FileType.REGULAR && IMAGE_EXT_RE.test(name)) {
            out.push({
                path: childPath,
                uri: Gio.File.new_for_path(childPath).get_uri(),
                name,
                isUserScope,
            });
        }
    }
    enumerator.close(null);
}

/**
 * List sorted image entries installed for a wallpaper pack.
 *
 * @param {string} packId Wallpaper pack identifier.
 * @returns {Array<object>} Sorted list of image entries.
 */
export function listPackWallpapers(packId) {
    const images = [];
    collectWallpaperImages(`${userBackgroundsDir()}/${packId}`, true, images);
    return images.sort((a, b) => a.path.localeCompare(b.path));
}

function fileEntry(file) {
    const path = file.get_path();
    return {
        path,
        uri: file.get_uri(),
        name: file.get_basename(),
        isUserScope: false,
    };
}

/**
 * Pick matching light and dark wallpaper entries for a preset pack.
 *
 * @param {string} packId Wallpaper pack identifier.
 * @returns {{light: object, dark: object}|null} Light/dark pair or null if unavailable.
 */
export function pickPackWallpaperPair(packId) {
    if (packId === 'gnome-adwaita') {
        const lightFile = Gio.File.new_for_path('/usr/share/backgrounds/gnome/adwaita-l.jpg');
        const darkFile = Gio.File.new_for_path('/usr/share/backgrounds/gnome/adwaita-d.jpg');
        if (!lightFile.query_exists(null) && !darkFile.query_exists(null))
            return null;
        const light = fileEntry(lightFile.query_exists(null) ? lightFile : darkFile);
        const dark = fileEntry(darkFile.query_exists(null) ? darkFile : lightFile);
        return {light, dark};
    }

    const files = listPackWallpapers(packId);
    if (files.length === 0)
        return null;

    if (packId === 'ubuntu') {
        const light = files.find(f => /ubuntu_colors/i.test(f.name)) ??
            files.find(f => /hikari/i.test(f.name)) ??
            files.find(f => /purple/i.test(f.name)) ??
            files.find(f => /light|day/i.test(f.name)) ??
            files[0];
        const dark = files.find(f => /yume_B/i.test(f.name)) ??
            files.find(f => /yume/i.test(f.name)) ??
            files.find(f => /dark|night/i.test(f.name)) ??
            light;
        return {light, dark};
    }

    if (packId === 'windows11') {
        const light = files.find(f => /^img0\./i.test(f.name)) ?? files[0];
        const dark = files.find(f => /^img19\./i.test(f.name)) ??
            files.find(f => /dark|night/i.test(f.name)) ??
            light;
        return {light, dark};
    }

    if (packId === 'windows10') {
        const light = files.find(f => /^img0\./i.test(f.name)) ??
            files.find(f => /light|day/i.test(f.name)) ??
            files.find(f => !/dark|night/i.test(f.name)) ??
            files[0];
        const dark = files.find(f => /^img0[-_]dark\./i.test(f.name)) ??
            files.find(f => /dark|night/i.test(f.name)) ??
            files.find(f => /^img102\./i.test(f.name)) ??
            files.find(f => /^img4\./i.test(f.name)) ??
            light;
        return {light, dark};
    }

    const light = files.find(f => /light|day/i.test(f.name)) ??
        files.find(f => !/dark|night/i.test(f.name)) ??
        files[0];
    const dark = files.find(f => /dark|night/i.test(f.name)) ?? light;
    return {light, dark};
}

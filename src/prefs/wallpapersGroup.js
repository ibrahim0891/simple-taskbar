// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    collectWallpaperImages,
    pickPackWallpaperPair,
    userBackgroundsDir,
} from '../shared/wallpaperPacks.js';

const BACKGROUND_SCHEMA = 'org.gnome.desktop.background';
const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';
const PICTURE_URI_KEY = 'picture-uri';
const PICTURE_URI_DARK_KEY = 'picture-uri-dark';
const COLOR_SCHEME_KEY = 'color-scheme';
const ROW_THUMB_WIDTH = 72;
const ROW_THUMB_HEIGHT = 44;
const GRID_THUMB_WIDTH = 168;
const GRID_THUMB_HEIGHT = 104;
const THUMB_RADIUS = 8;

function getWallpaperPacks() {
    return [
        {
            id: 'mactahoe',
            name: 'MacTahoe',
            description: _('macOS Tahoe wallpapers (vinceliuice/MacTahoe-gtk-theme)'),
        },
        {
            id: 'windows11',
            name: 'Windows 11',
            description: _('Windows 11 Bloom wallpapers (viridivn/windows11wallpapers)'),
        },
        {
            id: 'windows10',
            name: 'Windows 10',
            description: _('Windows 10 Hero wallpapers (thedoggybrad/Windows-10-22H2-Web-Folder)'),
        },
        {
            id: 'ubuntu',
            name: 'Ubuntu',
            description: _('Ubuntu Noble Numbat wallpapers'),
        },
    ];
}

function backgroundSearchPaths() {
    const paths = [userBackgroundsDir()];
    for (const dir of GLib.get_system_data_dirs())
        paths.push(`${dir}/backgrounds`);
    return [...new Set(paths)];
}

function discoverAllWallpapers() {
    const userDir = userBackgroundsDir();
    const images = [];
    for (const baseDir of backgroundSearchPaths())
        collectWallpaperImages(baseDir, baseDir === userDir, images);
    return images.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {sensitivity: 'base'})
    );
}

function deleteRecursive(file) {
    if (!file.query_exists(null))
        return;
    const info = file.query_info('standard::type', Gio.FileQueryInfoFlags.NONE, null);
    if (info.get_file_type() === Gio.FileType.DIRECTORY) {
        const enumerator = file.enumerate_children(
            'standard::name,standard::type',
            Gio.FileQueryInfoFlags.NONE,
            null
        );
        let child;
        while ((child = enumerator.next_file(null)) !== null)
            deleteRecursive(file.get_child(child.get_name()));
        enumerator.close(null);
    }
    file.delete(null);
}

function roundedClip(cr, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    cr.newSubPath();
    cr.arc(width - r, r, r, -Math.PI / 2, 0);
    cr.arc(width - r, height - r, r, 0, Math.PI / 2);
    cr.arc(r, height - r, r, Math.PI / 2, Math.PI);
    cr.arc(r, r, r, Math.PI, 1.5 * Math.PI);
    cr.closePath();
    cr.clip();
}

const MAX_CONCURRENT_THUMBS = 4;

class ThumbnailLoader {
    constructor() {
        this._cache = new Map();
        this._queue = [];
        this._inFlight = 0;
    }

    clearCache() {
        this._cache.clear();
    }

    destroy() {
        this._queue = [];
        this._cache.clear();
    }

    load(filePath, width, height, cancellable, onLoaded) {
        const key = `${filePath}:${width}x${height}`;
        const cached = this._cache.get(key);
        if (cached) {
            onLoaded(cached);
            return;
        }

        this._queue.push({key, filePath, width, height, cancellable, onLoaded});
        this._pump();
    }

    _pump() {
        while (this._inFlight < MAX_CONCURRENT_THUMBS && this._queue.length > 0) {
            const task = this._queue.shift();
            if (task.cancellable?.is_cancelled())
                continue;

            const cached = this._cache.get(task.key);
            if (cached) {
                task.onLoaded(cached);
                continue;
            }

            this._inFlight++;
            this._decodeTask(task);
        }
    }

    _decodeTask(task) {
        const {key, filePath, width, height, cancellable, onLoaded} = task;
        const finish = () => {
            this._inFlight--;
            this._pump();
        };

        Gio.File.new_for_path(filePath).read_async(
            GLib.PRIORITY_DEFAULT_IDLE,
            cancellable,
            (file, readRes) => {
                let stream = null;
                try {
                    stream = file.read_finish(readRes);
                } catch {
                    finish();
                    return;
                }

                GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(
                    stream,
                    width * 2,
                    height * 2,
                    true,
                    cancellable,
                    (_src, pixRes) => {
                        let pixbuf = null;
                        try {
                            const raw = GdkPixbuf.Pixbuf.new_from_stream_finish(pixRes);
                            const scale = Math.max(width / raw.get_width(), height / raw.get_height());
                            const scaledW = Math.max(width, Math.round(raw.get_width() * scale));
                            const scaledH = Math.max(height, Math.round(raw.get_height() * scale));
                            pixbuf = raw.scale_simple(scaledW, scaledH, GdkPixbuf.InterpType.BILINEAR);
                            this._cache.set(key, pixbuf);
                        } catch {
                            pixbuf = null;
                        } finally {
                            try {
                                stream.close(null);
                            } catch {
                                // Ignore stream close error.
                            }
                        }
                        if (pixbuf && !cancellable?.is_cancelled())
                            onLoaded(pixbuf);
                        finish();
                    }
                );
            }
        );
    }
}

function createUniformThumbnail(filePath, width, height, thumbnailLoader, cancellable) {
    const area = new Gtk.DrawingArea({
        width_request: width,
        height_request: height,
        hexpand: false,
        vexpand: false,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
    });

    let pixbuf = null;
    let alive = true;
    area.connect('destroy', () => {
        alive = false;
    });

    area.set_draw_func((_widget, cr, w, h) => {
        roundedClip(cr, w, h, THUMB_RADIUS);
        if (pixbuf) {
            const dx = Math.round((w - pixbuf.get_width()) / 2);
            const dy = Math.round((h - pixbuf.get_height()) / 2);
            Gdk.cairo_set_source_pixbuf(cr, pixbuf, dx, dy);
            cr.paint();
        } else {
            cr.setSourceRGBA(0.5, 0.5, 0.5, 0.14);
            cr.paint();
        }
    });

    if (filePath) {
        thumbnailLoader.load(filePath, width, height, cancellable, loaded => {
            if (!alive)
                return;
            pixbuf = loaded;
            area.queue_draw();
        });
        return area;
    }

    const box = new Gtk.Overlay({
        width_request: width,
        height_request: height,
        hexpand: false,
        vexpand: false,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
    });
    box.set_child(area);
    box.add_overlay(new Gtk.Image({
        icon_name: 'folder-download-symbolic',
        pixel_size: 20,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        css_classes: ['dim-label'],
    }));
    return box;
}

function createInteractiveThumbnail({
    filePath,
    width,
    height,
    thumbnailLoader,
    cancellable = null,
    active = false,
    onApply = null,
    onRemove = null,
}) {
    const overlay = new Gtk.Overlay({
        width_request: width,
        height_request: height,
        hexpand: false,
        vexpand: false,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
    });

    const thumb = createUniformThumbnail(filePath, width, height, thumbnailLoader, cancellable);
    if (onApply) {
        const clickButton = new Gtk.Button({
            child: thumb,
            css_classes: ['flat'],
        });
        clickButton.set_margin_top(0);
        clickButton.set_margin_bottom(0);
        clickButton.set_margin_start(0);
        clickButton.set_margin_end(0);
        clickButton.connect('clicked', onApply);
        overlay.set_child(clickButton);
    } else {
        overlay.set_child(thumb);
    }

    if (active) {
        overlay.add_overlay(new Gtk.Image({
            icon_name: 'object-select-symbolic',
            pixel_size: 14,
            halign: Gtk.Align.END,
            valign: Gtk.Align.END,
            margin_bottom: 4,
            margin_end: 4,
            css_classes: ['osd', 'circular'],
        }));
    }

    if (onRemove) {
        const removeButton = new Gtk.Button({
            icon_name: 'window-close-symbolic',
            tooltip_text: _('Remove'),
            halign: Gtk.Align.END,
            valign: Gtk.Align.START,
            margin_top: 4,
            margin_end: 4,
            visible: false,
            css_classes: ['osd', 'circular'],
        });
        removeButton.connect('clicked', onRemove);
        overlay.add_overlay(removeButton);

        const motion = new Gtk.EventControllerMotion();
        motion.connect('enter', () => {
            removeButton.visible = true;
        });
        motion.connect('leave', () => {
            removeButton.visible = false;
        });
        overlay.add_controller(motion);
    }

    return overlay;
}

/**
 * Add Wallpapers download/install and installed-wallpaper grid chooser to General.
 *
 * @param {object} params Group parameters.
 * @param {Adw.PreferencesWindow} params.window Preferences window.
 * @param {Adw.PreferencesPage} params.page General preferences page.
 * @param {Gio.Settings} params.settings Extension settings.
 * @param {string} params.extensionPath Extension root directory path.
 */
export function addWallpapersGroup({window, page, settings, extensionPath}) {
    const backgroundSettings = new Gio.Settings({schema_id: BACKGROUND_SCHEMA});
    let interfaceSettings = null;
    try {
        interfaceSettings = new Gio.Settings({schema_id: INTERFACE_SCHEMA});
    } catch {
        interfaceSettings = null;
    }
    const scriptPath = `${extensionPath}/src/prefs/install-wallpaper.sh`;

    const group = new Adw.PreferencesGroup({
        title: _('Wallpapers'),
        description: _('Download wallpapers into ~/.local/share/backgrounds or choose an installed wallpaper.'),
    });
    page.add(group);

    const progressRow = new Adw.ActionRow({
        visible: false,
    });
    const progressBar = new Gtk.ProgressBar({
        show_text: true,
        hexpand: true,
        valign: Gtk.Align.CENTER,
    });
    const progressBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        margin_top: 8,
        margin_bottom: 8,
        margin_start: 12,
        margin_end: 12,
    });
    const stopButton = new Gtk.Button({
        label: _('Stop'),
        valign: Gtk.Align.CENTER,
        css_classes: ['destructive-action'],
    });
    progressBox.append(progressBar);
    progressBox.append(stopButton);
    progressRow.set_child(progressBox);

    let activeSubprocess = null;
    let activeCancellable = null;
    let pulseId = 0;
    let syncIdleId = 0;
    let installedPageOpen = false;
    let installedDirty = true;
    let installedThumbCancellable = null;
    const packThumbCancellable = new Gio.Cancellable();
    const thumbnailLoader = new ThumbnailLoader();
    const packRows = [];

    const stopPulse = () => {
        if (pulseId) {
            GLib.source_remove(pulseId);
            pulseId = 0;
        }
    };

    const stopSyncIdle = () => {
        if (syncIdleId) {
            GLib.source_remove(syncIdleId);
            syncIdleId = 0;
        }
    };

    const applyPackWallpaper = pack => {
        const pair = pickPackWallpaperPair(pack.id);
        if (!pair)
            return;
        backgroundSettings.set_string(PICTURE_URI_KEY, pair.light.uri);
        backgroundSettings.set_string(PICTURE_URI_DARK_KEY, pair.dark.uri);
        window.add_toast(new Adw.Toast({
            title: _('Applied %s wallpaper').format(pack.name),
        }));
    };

    const setRowPreview = (entry, previewPath, installed) => {
        if (entry.previewWidget)
            entry.row.remove(entry.previewWidget);
        entry.previewWidget = createInteractiveThumbnail({
            filePath: previewPath,
            width: ROW_THUMB_WIDTH,
            height: ROW_THUMB_HEIGHT,
            thumbnailLoader,
            cancellable: packThumbCancellable,
            onApply: installed ? () => applyPackWallpaper(entry.pack) : null,
            onRemove: installed
                ? () => {
                    deleteRecursive(
                        Gio.File.new_for_path(`${userBackgroundsDir()}/${entry.pack.id}`)
                    );
                    syncAll({invalidateCache: true});
                }
                : null,
        });
        entry.row.add_prefix(entry.previewWidget);
    };

    const syncPackRows = () => {
        const currentLight = backgroundSettings.get_string(PICTURE_URI_KEY);
        const currentDark = backgroundSettings.get_string(PICTURE_URI_DARK_KEY);
        const preferDark = interfaceSettings?.get_string(COLOR_SCHEME_KEY) === 'prefer-dark';
        const busy = activeSubprocess !== null;
        progressRow.visible = busy;

        for (const entry of packRows) {
            const pair = pickPackWallpaperPair(entry.pack.id);
            const installed = pair !== null;
            const active = installed &&
                currentLight === pair.light.uri &&
                currentDark === pair.dark.uri;

            if (active)
                entry.row.subtitle = `${entry.pack.description} • ${_('Active')}`;
            else if (installed)
                entry.row.subtitle = `${entry.pack.description} • ${_('Installed')}`;
            else
                entry.row.subtitle = entry.pack.description;

            const previewPath = pair
                ? (preferDark ? pair.dark.path : pair.light.path)
                : null;
            if (entry.lastPreviewPath !== previewPath || entry.lastInstalled !== installed) {
                setRowPreview(entry, previewPath, installed);
                entry.lastPreviewPath = previewPath;
                entry.lastInstalled = installed;
            }

            entry.installButton.visible = !installed;
            entry.installButton.sensitive = !busy;
            entry.applyButton.visible = installed;
            entry.applyButton.sensitive = !active;
            entry.applyButton.label = active ? _('Active') : _('Apply');
        }
    };

    const installedNavRow = new Adw.ActionRow({
        title: _('All Installed Wallpapers'),
        subtitle: _('Browse wallpapers in ~/.local/share/backgrounds and system folders'),
        icon_name: 'preferences-desktop-wallpaper-symbolic',
        activatable: true,
    });
    installedNavRow.add_suffix(new Gtk.Image({
        icon_name: 'go-next-symbolic',
        valign: Gtk.Align.CENTER,
        css_classes: ['dim-label'],
    }));

    const flowBox = new Gtk.FlowBox({
        selection_mode: Gtk.SelectionMode.NONE,
        homogeneous: true,
        max_children_per_line: 3,
        min_children_per_line: 2,
        row_spacing: 12,
        column_spacing: 12,
        margin_top: 12,
        margin_bottom: 16,
        margin_start: 16,
        margin_end: 16,
        valign: Gtk.Align.START,
    });
    const scrolled = new Gtk.ScrolledWindow({
        child: flowBox,
        vexpand: true,
        hexpand: true,
    });
    const headerBar = new Adw.HeaderBar();
    const refreshButton = new Gtk.Button({
        icon_name: 'view-refresh-symbolic',
        tooltip_text: _('Refresh Installed Wallpapers'),
    });
    headerBar.pack_end(refreshButton);

    const installedToolbar = new Adw.ToolbarView();
    installedToolbar.add_top_bar(headerBar);
    installedToolbar.set_content(scrolled);
    const installedSubpage = new Adw.NavigationPage({
        title: _('Installed Wallpapers'),
        child: installedToolbar,
    });
    installedNavRow.connect('activated', () => {
        window.push_subpage(installedSubpage);
    });

    const rebuildInstalledWallpapers = () => {
        installedDirty = false;
        installedThumbCancellable?.cancel();
        installedThumbCancellable = new Gio.Cancellable();

        let child;
        while ((child = flowBox.get_first_child()) !== null)
            flowBox.remove(child);

        const currentLight = backgroundSettings.get_string(PICTURE_URI_KEY);
        const currentDark = backgroundSettings.get_string(PICTURE_URI_DARK_KEY);

        for (const item of discoverAllWallpapers()) {
            const active = currentLight === item.uri || currentDark === item.uri;
            const tile = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                spacing: 6,
                halign: Gtk.Align.CENTER,
            });
            tile.append(createInteractiveThumbnail({
                filePath: item.path,
                width: GRID_THUMB_WIDTH,
                height: GRID_THUMB_HEIGHT,
                thumbnailLoader,
                cancellable: installedThumbCancellable,
                active,
                onApply: () => {
                    backgroundSettings.set_string(PICTURE_URI_KEY, item.uri);
                    backgroundSettings.set_string(PICTURE_URI_DARK_KEY, item.uri);
                    window.add_toast(new Adw.Toast({
                        title: _('Applied wallpaper %s').format(item.name),
                    }));
                },
                onRemove: item.isUserScope
                    ? () => {
                        deleteRecursive(Gio.File.new_for_path(item.path));
                        syncAll({invalidateCache: true});
                    }
                    : null,
            }));
            tile.append(new Gtk.Label({
                label: item.name,
                ellipsize: Pango.EllipsizeMode.END,
                max_width_chars: 20,
                css_classes: active ? ['caption', 'accent'] : ['caption', 'dim-label'],
            }));
            flowBox.append(tile);
        }
    };

    const syncAll = ({invalidateCache = false} = {}) => {
        if (invalidateCache)
            thumbnailLoader.clearCache();
        syncPackRows();
        if (installedPageOpen)
            rebuildInstalledWallpapers();
        else
            installedDirty = true;
    };

    const scheduleSync = () => {
        if (syncIdleId)
            return;

        syncIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            syncIdleId = 0;
            syncAll();
            return GLib.SOURCE_REMOVE;
        });
    };

    installedSubpage.connect('showing', () => {
        installedPageOpen = true;
        if (installedDirty)
            rebuildInstalledWallpapers();
    });
    installedSubpage.connect('hidden', () => {
        installedPageOpen = false;
        installedThumbCancellable?.cancel();
        installedThumbCancellable = null;
    });

    const readStreamLines = (stream, cancellable) => {
        stream.read_line_async(GLib.PRIORITY_DEFAULT, cancellable, (source, res) => {
            try {
                const [line] = source.read_line_finish_utf8(res);
                if (line === null)
                    return;
                const trimmed = line.trim();
                if (trimmed)
                    progressBar.text = trimmed.slice(0, 60);
                readStreamLines(stream, cancellable);
            } catch {
                // Stream closed or cancelled.
            }
        });
    };

    const runInstall = pack => {
        if (activeSubprocess)
            return;

        progressBar.text = _('Installing %s wallpapers...').format(pack.name);
        const cancellable = new Gio.Cancellable();
        activeCancellable = cancellable;

        try {
            const proc = Gio.Subprocess.new(
                ['bash', scriptPath, pack.id],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE
            );
            activeSubprocess = proc;
            stopPulse();
            pulseId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
                progressBar.pulse();
                return GLib.SOURCE_CONTINUE;
            });
            syncPackRows();

            const stdout = new Gio.DataInputStream({
                base_stream: proc.get_stdout_pipe(),
            });
            readStreamLines(stdout, cancellable);

            proc.wait_check_async(cancellable, (source, res) => {
                let success = false;
                let errorMessage = null;
                try {
                    success = source.wait_check_finish(res);
                } catch (e) {
                    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        errorMessage = e.message;
                }

                stopPulse();
                activeSubprocess = null;
                activeCancellable = null;
                syncAll({invalidateCache: true});

                if (success) {
                    window.add_toast(new Adw.Toast({
                        title: _('%s wallpapers installed').format(pack.name),
                    }));
                } else if (errorMessage) {
                    window.add_toast(new Adw.Toast({
                        title: _('Failed to install %s: %s').format(pack.name, errorMessage),
                    }));
                }
            });
        } catch (e) {
            stopPulse();
            activeSubprocess = null;
            activeCancellable = null;
            syncPackRows();
            window.add_toast(new Adw.Toast({
                title: _('Failed to start installer: %s').format(e.message),
            }));
        }
    };

    stopButton.connect('clicked', () => {
        activeSubprocess?.force_exit();
        activeCancellable?.cancel();
    });

    refreshButton.connect('clicked', () => syncAll({invalidateCache: true}));

    for (const pack of getWallpaperPacks()) {
        const row = new Adw.ActionRow({
            title: pack.name,
            subtitle: pack.description,
            activatable: true,
        });
        row.set_title_lines(1);
        row.set_subtitle_lines(2);
        row.connect('activated', () => {
            if (pickPackWallpaperPair(pack.id))
                applyPackWallpaper(pack);
        });

        const applyButton = new Gtk.Button({
            label: _('Apply'),
            valign: Gtk.Align.CENTER,
        });
        applyButton.connect('clicked', () => applyPackWallpaper(pack));

        const installButton = new Gtk.Button({
            label: _('Install'),
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        installButton.connect('clicked', () => runInstall(pack));

        row.add_suffix(applyButton);
        row.add_suffix(installButton);
        group.add(row);
        packRows.push({
            pack,
            row,
            applyButton,
            installButton,
            previewWidget: null,
            lastPreviewPath: undefined,
            lastInstalled: undefined,
        });
    }

    const preserveRow = new Adw.SwitchRow({
        title: _('Preserve Wallpaper'),
        subtitle: _('Keep your current wallpaper instead of switching automatically with Ubuntu, macOS Dock, or Windows presets'),
    });
    settings.bind(
        'preserve-wallpaper',
        preserveRow,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    group.add(progressRow);
    group.add(preserveRow);
    group.add(installedNavRow);

    const lightId = backgroundSettings.connect(`changed::${PICTURE_URI_KEY}`, scheduleSync);
    const darkId = backgroundSettings.connect(`changed::${PICTURE_URI_DARK_KEY}`, scheduleSync);
    const colorSchemeId = interfaceSettings?.connect(`changed::${COLOR_SCHEME_KEY}`, scheduleSync) ?? 0;
    window.connect('close-request', () => {
        stopPulse();
        stopSyncIdle();
        packThumbCancellable.cancel();
        installedThumbCancellable?.cancel();
        installedThumbCancellable = null;
        thumbnailLoader.destroy();
        backgroundSettings.disconnect(lightId);
        backgroundSettings.disconnect(darkId);
        if (colorSchemeId)
            interfaceSettings.disconnect(colorSchemeId);
        activeSubprocess?.force_exit();
        activeCancellable?.cancel();
    });

    syncAll();
}

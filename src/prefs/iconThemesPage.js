// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';
const ICON_THEME_KEY = 'icon-theme';
const PREVIEW_LOOKUP_SIZE = 48;
const PREVIEW_ICON_SIZE = 18;
const PREVIEW_CARD_SIZE = 52;
const PREVIEW_SLOT_CANDIDATES = [
    ['folder', 'inode-directory'],
    ['system-file-manager', 'org.gnome.Nautilus', 'org.gnome.Files', 'user-home'],
    ['utilities-terminal', 'org.gnome.Terminal', 'gnome-terminal', 'application-x-executable'],
    ['preferences-system', 'org.gnome.Settings', 'applications-system', 'emblem-system'],
];
const IGNORED_THEME_DIRS = new Set(['default', 'hicolor', 'locolor']);
const THEME_REBUILD_BATCH_SIZE = 6;

function getIconPacks() {
    return [
        {
            id: 'mactahoe',
            name: 'MacTahoe',
            themeName: 'MacTahoe',
            description: _('macOS Tahoe-style icon theme (vinceliuice/MacTahoe-icon-theme)'),
        },
        {
            id: 'win11',
            name: 'Windows 11',
            themeName: 'Win11',
            description: _('Windows 11 Fluent icon theme (yeyushengfan258/Win11-icon-theme)'),
        },
        {
            id: 'tela-circle',
            name: 'Tela Circle',
            themeName: 'Tela-circle',
            description: _('Circular flat icon theme (vinceliuice/Tela-circle-icon-theme)'),
        },
        {
            id: 'yaru',
            name: 'Yaru',
            themeName: 'Yaru',
            description: _('Official Ubuntu Yaru icon theme (ubuntu/yaru)'),
        },
    ];
}

function userIconsDir() {
    return `${GLib.get_user_data_dir()}/icons`;
}

function iconSearchPaths() {
    const paths = [userIconsDir()];
    for (const dir of GLib.get_system_data_dirs())
        paths.push(`${dir}/icons`);
    return [...new Set(paths)];
}

function isThemeInstalled(themeName) {
    return iconSearchPaths().some(base =>
        Gio.File.new_for_path(`${base}/${themeName}/index.theme`).query_exists(null)
    );
}

function discoverInstalledIconThemes() {
    const found = new Map();
    const userDir = userIconsDir();

    for (const baseDir of iconSearchPaths()) {
        const dir = Gio.File.new_for_path(baseDir);
        if (!dir.query_exists(null))
            continue;

        let enumerator;
        try {
            enumerator = dir.enumerate_children(
                'standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE,
                null
            );
        } catch {
            continue;
        }

        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            if (info.get_file_type() !== Gio.FileType.DIRECTORY)
                continue;
            const id = info.get_name();
            if (IGNORED_THEME_DIRS.has(id) || found.has(id))
                continue;

            const indexPath = `${baseDir}/${id}/index.theme`;
            if (!Gio.File.new_for_path(indexPath).query_exists(null))
                continue;

            const keyFile = new GLib.KeyFile();
            try {
                keyFile.load_from_file(indexPath, GLib.KeyFileFlags.NONE);
                if (!keyFile.has_group('Icon Theme'))
                    continue;

                const directories = keyFile.get_string('Icon Theme', 'Directories').trim();
                if (!directories)
                    continue;

                let hidden = false;
                try {
                    hidden = keyFile.get_boolean('Icon Theme', 'Hidden');
                } catch {
                    hidden = false;
                }
                if (hidden)
                    continue;

                let name = id;
                try {
                    name = keyFile.get_string('Icon Theme', 'Name') || id;
                } catch {
                    name = id;
                }

                found.set(id, {
                    id,
                    name,
                    scope: baseDir === userDir ? '~/.local/share/icons' : baseDir,
                });
            } catch {
                // Ignore malformed or non-icon index.theme files.
            }
        }
        enumerator.close(null);
    }

    return [...found.values()].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, {sensitivity: 'base'})
    );
}

function createFolderPreview(themeName, scaleFactor, installed) {
    // Outer wrapper adds the margin that add_prefix eats so the card is not clipped.
    const wrapper = new Gtk.Box({
        width_request: PREVIEW_CARD_SIZE + 8,
        height_request: PREVIEW_CARD_SIZE,
        hexpand: false,
        vexpand: false,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        margin_start: 4,
    });

    const box = new Gtk.Box({
        width_request: PREVIEW_CARD_SIZE,
        height_request: PREVIEW_CARD_SIZE,
        hexpand: false,
        vexpand: false,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        css_classes: ['card'],
    });

    if (!installed) {
        box.append(new Gtk.Image({
            icon_name: 'folder-download-symbolic',
            pixel_size: 24,
            hexpand: true,
            vexpand: true,
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        }));
        wrapper.append(box);
        return wrapper;
    }

    const previewTheme = Gtk.IconTheme.new();
    previewTheme.set_search_path(iconSearchPaths());
    previewTheme.set_theme_name(themeName);

    const grid = new Gtk.Grid({
        row_spacing: 2,
        column_spacing: 2,
        row_homogeneous: true,
        column_homogeneous: true,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        hexpand: true,
        vexpand: true,
        margin_top: 5,
        margin_bottom: 5,
        margin_start: 5,
        margin_end: 5,
    });

    PREVIEW_SLOT_CANDIDATES.forEach((candidates, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        let paintable = null;
        for (const iconName of candidates) {
            if (previewTheme.has_icon(iconName)) {
                paintable = previewTheme.lookup_icon(
                    iconName,
                    null,
                    PREVIEW_LOOKUP_SIZE,
                    scaleFactor,
                    Gtk.TextDirection.NONE,
                    Gtk.IconLookupFlags.FORCE_REGULAR
                );
                if (paintable)
                    break;
            }
        }

        const image = paintable
            ? Gtk.Image.new_from_paintable(paintable)
            : new Gtk.Image({icon_name: 'image-missing-symbolic'});
        image.set_pixel_size(PREVIEW_ICON_SIZE);
        image.set_size_request(PREVIEW_ICON_SIZE, PREVIEW_ICON_SIZE);
        grid.attach(image, col, row, 1, 1);
    });

    box.append(grid);
    wrapper.append(box);
    return wrapper;
}

/**
 * Add Icon Themes download/install and installed-theme chooser groups to General.
 *
 * @param {object} params Group parameters.
 * @param {Adw.PreferencesWindow} params.window Preferences window.
 * @param {Adw.PreferencesPage} params.page General preferences page.
 * @param {string} params.extensionPath Extension root directory path.
 */
export function addIconThemesGroups({window, page, settings, extensionPath}) {
    const interfaceSettings = new Gio.Settings({schema_id: INTERFACE_SCHEMA});
    const scriptPath = `${extensionPath}/src/prefs/install-icon-theme.sh`;
    const scaleFactor = window.get_scale_factor() || 1;

    const group = new Adw.PreferencesGroup({
        title: _('Icon Themes'),
        description: _('Download icon packs into ~/.local/share/icons or choose an installed theme.'),
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
    let rebuildIdleId = 0;
    let installedPageOpen = false;
    let installedDirty = true;
    let cachedInstalledThemes = null;
    const packRows = [];
    let installedRowWidgets = [];

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

    const stopRebuildIdle = () => {
        if (rebuildIdleId) {
            GLib.source_remove(rebuildIdleId);
            rebuildIdleId = 0;
        }
    };

    const setRowPreview = (entry, themeName, installed) => {
        if (entry.previewWidget)
            entry.row.remove(entry.previewWidget);
        entry.previewWidget = createFolderPreview(themeName, scaleFactor, installed);
        entry.row.add_prefix(entry.previewWidget);
    };

    const syncPackRows = () => {
        const currentTheme = interfaceSettings.get_string(ICON_THEME_KEY);
        const busy = activeSubprocess !== null;
        progressRow.visible = busy;

        for (const entry of packRows) {
            const installed = isThemeInstalled(entry.pack.themeName);
            const active = currentTheme === entry.pack.themeName;
            if (active)
                entry.row.subtitle = `${entry.pack.description} • ${_('Active')}`;
            else if (installed)
                entry.row.subtitle = `${entry.pack.description} • ${_('Installed')}`;
            else
                entry.row.subtitle = entry.pack.description;

            if (entry.wasInstalled !== installed) {
                setRowPreview(entry, entry.pack.themeName, installed);
                entry.wasInstalled = installed;
            }

            entry.installButton.label = installed ? _('Reinstall') : _('Install');
            entry.installButton.sensitive = !busy;
            if (installed)
                entry.installButton.remove_css_class('suggested-action');
            else
                entry.installButton.add_css_class('suggested-action');

            entry.applyButton.visible = installed;
            entry.applyButton.sensitive = !active;
            entry.applyButton.label = active ? _('Active') : _('Apply');
        }
    };

    const installedNavRow = new Adw.ActionRow({
        title: _('All Installed Icon Themes'),
        subtitle: _('Active: %s').format(interfaceSettings.get_string(ICON_THEME_KEY)),
        icon_name: 'preferences-desktop-icons-symbolic',
        activatable: true,
    });
    installedNavRow.add_suffix(new Gtk.Image({
        icon_name: 'go-next-symbolic',
        valign: Gtk.Align.CENTER,
        css_classes: ['dim-label'],
    }));

    const installedPrefPage = new Adw.PreferencesPage();
    const installedGroup = new Adw.PreferencesGroup({
        title: _('Installed Icon Themes'),
        description: _('Preview and apply any icon theme installed on your system.'),
    });
    installedPrefPage.add(installedGroup);
    const refreshButton = new Gtk.Button({
        icon_name: 'view-refresh-symbolic',
        tooltip_text: _('Refresh Installed Themes'),
        valign: Gtk.Align.CENTER,
        css_classes: ['flat'],
    });
    installedGroup.set_header_suffix(refreshButton);

    const installedToolbar = new Adw.ToolbarView();
    installedToolbar.add_top_bar(new Adw.HeaderBar());
    installedToolbar.set_content(installedPrefPage);
    const installedSubpage = new Adw.NavigationPage({
        title: _('Installed Icon Themes'),
        child: installedToolbar,
    });
    installedNavRow.connect('activated', () => {
        window.push_subpage(installedSubpage);
    });

    const rebuildInstalledThemes = () => {
        stopRebuildIdle();
        installedDirty = false;
        for (const row of installedRowWidgets)
            installedGroup.remove(row);
        installedRowWidgets = [];

        const currentTheme = interfaceSettings.get_string(ICON_THEME_KEY);
        installedNavRow.subtitle = _('Active: %s').format(currentTheme);

        cachedInstalledThemes ??= discoverInstalledIconThemes();
        const themes = cachedInstalledThemes;
        let index = 0;

        const appendBatch = () => {
            const end = Math.min(index + THEME_REBUILD_BATCH_SIZE, themes.length);
            for (; index < end; index++) {
                const theme = themes[index];
                const active = currentTheme === theme.id;
                const row = new Adw.ActionRow({
                    title: theme.name,
                    subtitle: active ? `${theme.scope} • ${_('Active')}` : theme.scope,
                });
                row.add_prefix(createFolderPreview(theme.id, scaleFactor, true));

                const applyButton = new Gtk.Button({
                    label: active ? _('Active') : _('Apply'),
                    valign: Gtk.Align.CENTER,
                    sensitive: !active,
                });
                applyButton.connect('clicked', () => {
                    interfaceSettings.set_string(ICON_THEME_KEY, theme.id);
                    window.add_toast(new Adw.Toast({
                        title: _('Applied %s icon theme').format(theme.name),
                    }));
                });
                row.add_suffix(applyButton);

                installedGroup.add(row);
                installedRowWidgets.push(row);
            }
            if (index < themes.length)
                return GLib.SOURCE_CONTINUE;

            rebuildIdleId = 0;
            return GLib.SOURCE_REMOVE;
        };

        if (themes.length > 0 && appendBatch() === GLib.SOURCE_CONTINUE)
            rebuildIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, appendBatch);
    };

    const syncAll = ({invalidateCache = false} = {}) => {
        if (invalidateCache)
            cachedInstalledThemes = null;
        syncPackRows();
        installedNavRow.subtitle = _('Active: %s').format(
            interfaceSettings.get_string(ICON_THEME_KEY)
        );
        if (installedPageOpen)
            rebuildInstalledThemes();
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
            rebuildInstalledThemes();
    });
    installedSubpage.connect('hidden', () => {
        installedPageOpen = false;
        stopRebuildIdle();
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

        progressBar.text = _('Installing %s...').format(pack.name);
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
                        title: _('%s installed to ~/.local/share/icons').format(pack.name),
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

    for (const pack of getIconPacks()) {
        const row = new Adw.ActionRow({
            title: pack.name,
            subtitle: pack.description,
        });
        row.set_title_lines(1);
        row.set_subtitle_lines(2);

        const applyButton = new Gtk.Button({
            label: _('Apply'),
            valign: Gtk.Align.CENTER,
        });
        applyButton.connect('clicked', () => {
            interfaceSettings.set_string(ICON_THEME_KEY, pack.themeName);
            window.add_toast(new Adw.Toast({
                title: _('Applied %s icon theme').format(pack.name),
            }));
        });

        const installButton = new Gtk.Button({
            label: _('Install'),
            valign: Gtk.Align.CENTER,
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
            wasInstalled: null,
        });
    }

    const preserveRow = new Adw.SwitchRow({
        title: _('Preserve Icon Theme'),
        subtitle: _('Keep your current icon theme instead of switching automatically with Ubuntu, macOS Dock, or Windows presets'),
    });
    settings.bind(
        'preserve-icon-theme',
        preserveRow,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );

    group.add(progressRow);
    group.add(preserveRow);
    group.add(installedNavRow);

    const interfaceSignalId = interfaceSettings.connect(
        `changed::${ICON_THEME_KEY}`,
        scheduleSync
    );
    window.connect('close-request', () => {
        stopPulse();
        stopSyncIdle();
        stopRebuildIdle();
        interfaceSettings.disconnect(interfaceSignalId);
        activeSubprocess?.force_exit();
        activeCancellable?.cancel();
    });

    syncAll();
}

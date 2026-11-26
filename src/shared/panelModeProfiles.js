// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {DOCK_AUTO_HIDE_SETTINGS, disablePressureRevealForHotEdge} from './autoHideSettings.js';
import {DEFAULT_PANEL_WINDOW_SETTING_KEYS, defaultPanelWindowSettingKey} from './defaultPanelWindowSettings.js';
import {normalizePanelItemOrder} from './panelItemOrder.js';
import {positionIsVertical} from './panelPositionUtils.js';
import {
    setBoolean,
    setInteger,
    setString,
    setStringArray,
} from './settingsUtils.js';
import {
    applyWindowsXpThemeAppearance,
    applyWindowsXpThemeSettings,
} from './windowsXpTheme.js';
import {applyWindows10ThemeDefaults} from './windows10Theme.js';
import {applyWindows11ThemeDefaults} from './windows11Theme.js';
import {applyMacosDockDefaults} from './macosDockTheme.js';
import {applyUbuntuDockDefaults} from './ubuntuTheme.js';
import {applyFloatingIslandDefaults} from './floatingIslandTheme.js';

export const PANEL_MODE_TASKBAR = 'taskbar';
export const PANEL_MODE_DEFAULT = 'default-panel';
export const PANEL_MODE_DOCK = 'dock';
export const PANEL_MODE_MACOS_DOCK = 'macos-dock';
export const PANEL_MODE_UBUNTU = 'ubuntu';
export const PANEL_MODE_FLOATING_ISLAND = 'floating-island';
export const PANEL_MODE_WINDOWS_XP = 'windows-xp';
export const PANEL_MODE_WINDOWS_10 = 'windows-10';
export const PANEL_MODE_WINDOWS_11 = 'windows-11';

const THEME_MODES = new Set([
    PANEL_MODE_WINDOWS_XP,
    PANEL_MODE_WINDOWS_10,
    PANEL_MODE_WINDOWS_11,
    PANEL_MODE_MACOS_DOCK,
    PANEL_MODE_UBUNTU,
    PANEL_MODE_FLOATING_ISLAND,
]);

const PRESET_ICON_THEMES = new Map([
    [PANEL_MODE_DEFAULT, 'Adwaita'],
    [PANEL_MODE_UBUNTU, 'Yaru'],
    [PANEL_MODE_MACOS_DOCK, 'MacTahoe'],
    [PANEL_MODE_WINDOWS_10, 'Win11'],
    [PANEL_MODE_WINDOWS_11, 'Win11'],
    [PANEL_MODE_FLOATING_ISLAND, 'Tela-circle'],
]);

const PRESET_WALLPAPER_PACKS = new Map([
    [PANEL_MODE_DEFAULT, 'gnome-adwaita'],
    [PANEL_MODE_UBUNTU, 'ubuntu'],
    [PANEL_MODE_MACOS_DOCK, 'mactahoe'],
    [PANEL_MODE_WINDOWS_10, 'windows10'],
    [PANEL_MODE_WINDOWS_11, 'windows11'],
]);

function listPackWallpapers(packId) {
    const dir = Gio.File.new_for_path(`${GLib.get_user_data_dir()}/backgrounds/${packId}`);
    if (!dir.query_exists(null))
        return [];

    const files = [];
    try {
        const enumerator = dir.enumerate_children(
            'standard::name,standard::type',
            Gio.FileQueryInfoFlags.NONE,
            null
        );
        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            if (info.get_file_type() !== Gio.FileType.REGULAR)
                continue;
            const name = info.get_name();
            if (/\.(jpe?g|png|webp)$/i.test(name))
                files.push(`${dir.get_path()}/${name}`);
        }
        enumerator.close(null);
    } catch {
        return [];
    }
    return files.sort((a, b) => a.localeCompare(b));
}

function pickPackWallpaperPair(packId) {
    if (packId === 'gnome-adwaita') {
        const lightFile = Gio.File.new_for_path('/usr/share/backgrounds/gnome/adwaita-l.jpg');
        const darkFile = Gio.File.new_for_path('/usr/share/backgrounds/gnome/adwaita-d.jpg');
        if (!lightFile.query_exists(null) && !darkFile.query_exists(null))
            return null;
        const lightUri = (lightFile.query_exists(null) ? lightFile : darkFile).get_uri();
        const darkUri = (darkFile.query_exists(null) ? darkFile : lightFile).get_uri();
        return {lightUri, darkUri};
    }

    const files = listPackWallpapers(packId);
    if (files.length === 0)
        return null;
    if (packId === 'ubuntu') {
        const purple = files.find(f => /ubuntu_colors/i.test(f)) ??
            files.find(f => /purple/i.test(f)) ??
            files[0];
        const uri = Gio.File.new_for_path(purple).get_uri();
        return {lightUri: uri, darkUri: uri};
    }
    if (packId === 'windows11') {
        const light = files.find(f => /\/img0\./i.test(f)) ?? files[0];
        const dark = files.find(f => /\/img19\./i.test(f)) ??
            files.find(f => /dark|night/i.test(f)) ??
            light;
        return {
            lightUri: Gio.File.new_for_path(light).get_uri(),
            darkUri: Gio.File.new_for_path(dark).get_uri(),
        };
    }
    const light = files.find(f => /light|day/i.test(f)) ??
        files.find(f => !/dark|night/i.test(f)) ??
        files[0];
    const dark = files.find(f => /dark|night/i.test(f)) ?? light;
    return {
        lightUri: Gio.File.new_for_path(light).get_uri(),
        darkUri: Gio.File.new_for_path(dark).get_uri(),
    };
}

function syncPresetWallpaper(settings, currentMode, nextMode) {
    if (currentMode === nextMode || settings.get_boolean('preserve-wallpaper'))
        return;

    let backgroundSettings;
    try {
        backgroundSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
    } catch {
        return;
    }

    const targetPack = PRESET_WALLPAPER_PACKS.get(nextMode);
    if (targetPack) {
        if (!PRESET_WALLPAPER_PACKS.has(currentMode) && !settings.get_string('saved-wallpaper-uri')) {
            settings.set_string('saved-wallpaper-uri', backgroundSettings.get_string('picture-uri'));
            settings.set_string('saved-wallpaper-uri-dark', backgroundSettings.get_string('picture-uri-dark'));
        }
        const pair = pickPackWallpaperPair(targetPack);
        if (pair) {
            backgroundSettings.set_string('picture-uri', pair.lightUri);
            backgroundSettings.set_string('picture-uri-dark', pair.darkUri);
        }
        return;
    }

    const savedLight = settings.get_string('saved-wallpaper-uri');
    const savedDark = settings.get_string('saved-wallpaper-uri-dark');
    if (savedLight || savedDark) {
        if (savedLight)
            backgroundSettings.set_string('picture-uri', savedLight);
        if (savedDark)
            backgroundSettings.set_string('picture-uri-dark', savedDark);
        settings.set_string('saved-wallpaper-uri', '');
        settings.set_string('saved-wallpaper-uri-dark', '');
    }
}

function isIconThemeInstalled(themeName) {
    const searchDirs = [
        `${GLib.get_user_data_dir()}/icons`,
        ...GLib.get_system_data_dirs().map(dir => `${dir}/icons`),
    ];
    return searchDirs.some(dir =>
        Gio.File.new_for_path(`${dir}/${themeName}/index.theme`).query_exists(null)
    );
}

function syncPresetIconTheme(settings, currentMode, nextMode) {
    if (currentMode === nextMode || settings.get_boolean('preserve-icon-theme'))
        return;

    let interfaceSettings;
    try {
        interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    } catch {
        return;
    }

    const targetTheme = PRESET_ICON_THEMES.get(nextMode);
    if (targetTheme) {
        if (!PRESET_ICON_THEMES.has(currentMode) && !settings.get_string('saved-icon-theme')) {
            settings.set_string(
                'saved-icon-theme',
                interfaceSettings.get_string('icon-theme')
            );
        }
        if (isIconThemeInstalled(targetTheme))
            interfaceSettings.set_string('icon-theme', targetTheme);
        return;
    }

    const savedTheme = settings.get_string('saved-icon-theme');
    if (savedTheme) {
        if (isIconThemeInstalled(savedTheme))
            interfaceSettings.set_string('icon-theme', savedTheme);
        settings.set_string('saved-icon-theme', '');
    }
}

function isDockThemeMode(mode) {
    return mode === PANEL_MODE_MACOS_DOCK || mode === PANEL_MODE_UBUNTU;
}

export function isDefaultPanelWithoutDock(settings) {
    return settings.get_boolean('default-gnome-panel') &&
        !settings.get_boolean('dock-mode');
}

export const PANEL_AXIS_PROFILE_ENABLED_KEYS = Object.freeze({
    [PANEL_MODE_TASKBAR]: 'taskbar-axis-profiles-enabled',
    [PANEL_MODE_DEFAULT]: 'default-panel-axis-profiles-enabled',
    [PANEL_MODE_DOCK]: 'dock-axis-profiles-enabled',
});

const DEFAULT_TASKBAR_ICON_SPACING = 6;

const PANEL_AXIS_HORIZONTAL = 'horizontal';
const PANEL_AXIS_VERTICAL = 'vertical';

const PROFILE_KEYS = new Map([
    [PANEL_MODE_TASKBAR, {
        settings: 'taskbar-mode-settings',
        saved: 'taskbar-mode-settings-saved',
    }],
    [PANEL_MODE_DEFAULT, {
        settings: 'default-panel-mode-settings',
        saved: 'default-panel-mode-settings-saved',
    }],
    [PANEL_MODE_WINDOWS_XP, {
        settings: 'windows-xp-mode-settings',
        saved: 'windows-xp-mode-settings-saved',
    }],
    [PANEL_MODE_WINDOWS_10, {
        settings: 'windows-10-mode-settings',
        saved: 'windows-10-mode-settings-saved',
    }],
    [PANEL_MODE_WINDOWS_11, {
        settings: 'windows-11-mode-settings',
        saved: 'windows-11-mode-settings-saved',
    }],
    [PANEL_MODE_MACOS_DOCK, {
        settings: 'macos-dock-mode-settings',
        saved: 'macos-dock-mode-settings-saved',
    }],
    [PANEL_MODE_UBUNTU, {
        settings: 'ubuntu-mode-settings',
        saved: 'ubuntu-mode-settings-saved',
    }],
    [PANEL_MODE_FLOATING_ISLAND, {
        settings: 'floating-island-mode-settings',
        saved: 'floating-island-mode-settings-saved',
    }],
]);

const AXIS_PROFILE_KEYS = new Map([
    [`${PANEL_MODE_TASKBAR}:${PANEL_AXIS_HORIZONTAL}`, {
        settings: 'taskbar-horizontal-settings',
        saved: 'taskbar-horizontal-settings-saved',
    }],
    [`${PANEL_MODE_TASKBAR}:${PANEL_AXIS_VERTICAL}`, {
        settings: 'taskbar-vertical-settings',
        saved: 'taskbar-vertical-settings-saved',
    }],
    [`${PANEL_MODE_DEFAULT}:${PANEL_AXIS_HORIZONTAL}`, {
        settings: 'default-panel-horizontal-settings',
        saved: 'default-panel-horizontal-settings-saved',
    }],
    [`${PANEL_MODE_DEFAULT}:${PANEL_AXIS_VERTICAL}`, {
        settings: 'default-panel-vertical-settings',
        saved: 'default-panel-vertical-settings-saved',
    }],
    [`${PANEL_MODE_DOCK}:${PANEL_AXIS_HORIZONTAL}`, {
        settings: 'dock-horizontal-settings',
        saved: 'dock-horizontal-settings-saved',
    }],
    [`${PANEL_MODE_DOCK}:${PANEL_AXIS_VERTICAL}`, {
        settings: 'dock-vertical-settings',
        saved: 'dock-vertical-settings-saved',
    }],
]);

const MODE_SETTING_KEYS = new Set([
    'active-panel-axis',
    'active-dock-axis',
    'active-panel-mode',
    'default-gnome-panel',
    'default-panel-show-running-windows',
    'dock-item-order',
    'dock-mode',
    'dock-layout-settings',
    'dock-mode-initialized',
    'blur-my-shell-dock-mode',
    'dock-autohide-enabled',
    ...Object.values(DOCK_AUTO_HIDE_SETTINGS),
    'dock-dodge-windows-enabled',
    'dock-dodge-windows-mode',
    'dock-dodge-pointer-reveal-enabled',
    'dock-edge-reveal-enabled',
    'dock-hide-dash-enabled',
    'dock-launch-to-desktop-enabled',
    'dock-multi-monitor-panels',
    'dock-max-length',
    'dock-side-padding',
    'dock-full-width-side-padding',
    'dock-highlight-edge-gap',
    'dock-transparency-enabled',
    'dock-transparency-level',
    'dock-transparency-on-unmaximized',
    'dock-transparency-dynamic-behavior',
    'dock-transparency-dynamic-distance',
    'dock-transparency-dynamic-level',
    'dock-transparency-dynamic-animation-time',
    'dock-custom-panel-color-enabled',
    'dock-custom-panel-color',
    'dock-custom-panel-gradient-enabled',
    'dock-custom-panel-gradient-color',
    'dock-custom-panel-gradient-direction',
    'dock-panel-theme-follow-system',
    'dock-panel-theme',
    'dock-panel-blur-enabled',
    'dock-panel-border-enabled',
    'dock-panel-border-light-enabled',
    'dock-workspace-scroll-action',
    'dock-workspace-scroll-delay',
    'dock-panel-mode',
    'dock-floating',
    'dock-panel-mode-floating',
    'dock-floating-snap-to-edge',
    'dock-floating-window-gap',
    'dock-panel-height',
    'dock-panel-height-follow-icon-size',
    'dock-position',
    'dock-axis-profiles-enabled',
    'dock-axis-profiles-initialized',
    'taskbar-axis-profiles-enabled',
    'default-panel-axis-profiles-enabled',
    'panel-axis-profiles-initialized',
    'panel-mode-profiles-initialized',
    'panel-profile-transition',
    'windows-xp-theme-enabled',
    'windows-10-theme-enabled',
    'windows-11-theme-enabled',
    'macos-dock-theme-enabled',
    'ubuntu-theme-enabled',
    'floating-island-theme-enabled',
    'preserve-icon-theme',
    'saved-icon-theme',
    'preserve-wallpaper',
    'saved-wallpaper-uri',
    'saved-wallpaper-uri-dark',
    'start-menu-displaced-overlay-key',
    'start-menu-pinned-apps',
    'start-menu-tile-sizes',
    'clock-date-order',
    'hot-edge-overview-enabled',
    'hot-edge-pressure-threshold',
    'hot-edge-animation-enabled',
    'hot-edge-open-app-grid',
    'grid-alt-tab-enabled',
    'grid-alt-tab-isolate-workspaces',
    'grid-alt-tab-show-on-primary-monitor',
    'grid-alt-tab-isolate-monitors',
    'grid-alt-tab-max-card-size',
    'grid-alt-tab-hotkey',
    'grid-alt-tab-backward-hotkey',
    'app-grid-layout',
    'app-grid-columns',
    'app-grid-rows',
    'nautilus-places-enabled',
    'super-e-file-manager-enabled',
    'super-e-file-manager-hotkey',
    'spotlight-hotkey',
    'spotlight-displaced-input-source-keys',
    'panel-button-corner-radius',
    'default-panel-button-corner-radius',
    'panel-buttons-follow-app-highlight',
    'default-panel-buttons-follow-app-highlight',
]);
for (const key of DEFAULT_PANEL_WINDOW_SETTING_KEYS)
    MODE_SETTING_KEYS.add(defaultPanelWindowSettingKey(key));

for (const profile of PROFILE_KEYS.values()) {
    MODE_SETTING_KEYS.add(profile.settings);
    MODE_SETTING_KEYS.add(profile.saved);
}
for (const profile of AXIS_PROFILE_KEYS.values()) {
    MODE_SETTING_KEYS.add(profile.settings);
    MODE_SETTING_KEYS.add(profile.saved);
}

export const PANEL_PROFILE_STATE_KEYS = Object.freeze([
    'active-panel-mode',
    'active-panel-axis',
    'active-dock-axis',
    'panel-mode-profiles-initialized',
    'panel-axis-profiles-initialized',
    'dock-axis-profiles-initialized',
    'dock-mode-initialized',
    'dock-layout-settings',
    ...[...PROFILE_KEYS.values(), ...AXIS_PROFILE_KEYS.values()]
        .flatMap(profile => [profile.settings, profile.saved]),
]);

const DOCK_LAYOUT_SETTING_KEYS = new Set([
    ...[...MODE_SETTING_KEYS].filter(key =>
        key.startsWith('dock-') && key !== 'dock-mode' &&
        !PANEL_PROFILE_STATE_KEYS.includes(key)),
    'active-dock-axis',
    'dock-axis-profiles-initialized',
    'dock-mode-initialized',
    'blur-my-shell-dock-mode',
]);

const DOCK_AXIS_SHARED_SETTING_KEYS = new Set([
    ...DEFAULT_PANEL_WINDOW_SETTING_KEYS,
    'taskbar-highlight-length-enabled',
    'taskbar-highlight-length',
    'hide-app-labels',
    'taskbar-locked',
    'hide-pinned-taskbar-apps',
    'hide-pinned-secondary-monitors',
    'hide-unpinned-taskbar-apps',
    'use-pinned-apps-as-launchers',
    'keep-pinned-app-windows-together',
    'show-pinned-app-separator',
    'show-location-separator',
    'show-start-button-separator',
    'start-button-position',
    'start-button-follow-app-alignment',
    'start-button-padding',
    'start-button-custom-icon',
    'gnome-start-button-visible',
    'windows-start-menu-enabled',
]);

const DOCK_AXIS_EXCLUDED_SETTING_KEYS = new Set([
    ...PANEL_PROFILE_STATE_KEYS,
    'dock-mode',
    'dock-position',
    'dock-axis-profiles-enabled',
]);
const DOCK_AXIS_PROFILE_VERSION_KEY = 'dock-axis-profile-version';

const PANEL_AXIS_DOMAIN = Object.freeze({
    positionKey: 'panel-position',
    activeAxisKey: 'active-panel-axis',
    initializedKey: 'panel-axis-profiles-initialized',
    isActiveMode: (settings, mode) =>
        settings.get_string('active-panel-mode') === mode,
});

const DOCK_AXIS_DOMAIN = Object.freeze({
    positionKey: 'dock-position',
    activeAxisKey: 'active-dock-axis',
    initializedKey: 'dock-axis-profiles-initialized',
    isActiveMode: settings => settings.get_boolean('dock-mode'),
});

function axisDomainForMode(mode) {
    return mode === PANEL_MODE_DOCK ? DOCK_AXIS_DOMAIN : PANEL_AXIS_DOMAIN;
}

function domainAxis(settings, domain) {
    return positionIsVertical(settings.get_string(domain.positionKey))
        ? PANEL_AXIS_VERTICAL
        : PANEL_AXIS_HORIZONTAL;
}

function axisProfile(mode, axis) {
    return AXIS_PROFILE_KEYS.get(`${mode}:${axis}`);
}

function axisProfilesEnabled(settings, mode) {
    return !THEME_MODES.has(mode) &&
        settings.get_boolean(PANEL_AXIS_PROFILE_ENABLED_KEYS[mode]);
}

export function activeDockMode(settings) {
    if (settings.get_boolean('macos-dock-theme-enabled'))
        return PANEL_MODE_MACOS_DOCK;
    if (settings.get_boolean('ubuntu-theme-enabled'))
        return PANEL_MODE_UBUNTU;
    if (settings.get_boolean('floating-island-theme-enabled'))
        return PANEL_MODE_FLOATING_ISLAND;
    return PANEL_MODE_DOCK;
}

export function getRequestedPanelMode(settings) {
    if (settings.get_boolean('windows-xp-theme-enabled'))
        return PANEL_MODE_WINDOWS_XP;
    if (settings.get_boolean('windows-10-theme-enabled'))
        return PANEL_MODE_WINDOWS_10;
    if (settings.get_boolean('windows-11-theme-enabled'))
        return PANEL_MODE_WINDOWS_11;
    if (settings.get_boolean('macos-dock-theme-enabled'))
        return PANEL_MODE_MACOS_DOCK;
    if (settings.get_boolean('ubuntu-theme-enabled'))
        return PANEL_MODE_UBUNTU;
    if (settings.get_boolean('floating-island-theme-enabled'))
        return PANEL_MODE_FLOATING_ISLAND;
    if (settings.get_boolean('default-gnome-panel'))
        return PANEL_MODE_DEFAULT;
    return PANEL_MODE_TASKBAR;
}

function panelModeSettingKeys(settings, mode) {
    return settings.settings_schema.list_keys().filter(key =>
        !MODE_SETTING_KEYS.has(key) ||
        isDockThemeMode(mode) && DOCK_LAYOUT_SETTING_KEYS.has(key));
}

function savedSettingValues(settings, keys) {
    const values = {};
    for (const key of keys) {
        const value = settings.get_user_value(key);
        if (value)
            values[key] = value;
    }
    return values;
}

function savePanelModeSettings(settings, mode) {
    const profile = PROFILE_KEYS.get(mode);
    const values = savedSettingValues(settings, panelModeSettingKeys(settings, mode));
    settings.set_value(profile.settings, new GLib.Variant('a{sv}', values));
    settings.set_boolean(profile.saved, true);
}

function restoreSettingValue(settings, key, value) {
    if (value && settings.settings_schema.get_key(key).range_check(value))
        settings.set_value(key, value);
    else
        settings.reset(key);
}

function restorePanelModeSettings(settings, mode) {
    const profile = PROFILE_KEYS.get(mode);
    if (!settings.get_boolean(profile.saved))
        return false;

    const values = settings.get_value(profile.settings).deepUnpack();
    for (const key of panelModeSettingKeys(settings, mode))
        restoreSettingValue(settings, key, values[key]);
    if (mode === PANEL_MODE_TASKBAR && !values['dock-min-icon-size'] && axisProfilesEnabled(settings, mode)) {
        const profile = axisProfile(mode, domainAxis(settings, PANEL_AXIS_DOMAIN));
        const axisValues = settings.get_value(profile.settings).deepUnpack();
        restoreSettingValue(settings, 'dock-min-icon-size', axisValues['dock-min-icon-size']);
    }
    return true;
}

function resetPanelModeSettings(settings, mode) {
    for (const key of panelModeSettingKeys(settings, mode))
        settings.reset(key);
}

function saveDockLayout(settings) {
    const values = savedSettingValues(settings, DOCK_LAYOUT_SETTING_KEYS);
    settings.set_value('dock-layout-settings', new GLib.Variant('a{sv}', values));
}

function restoreDockLayout(settings) {
    const values = settings.get_value('dock-layout-settings').deepUnpack();
    for (const key of DOCK_LAYOUT_SETTING_KEYS)
        restoreSettingValue(settings, key, values[key]);
}

function panelAxisSettingKeys(settings, mode) {
    return settings.settings_schema.list_keys().filter(key => {
        if (mode === PANEL_MODE_DOCK) {
            return DOCK_AXIS_SHARED_SETTING_KEYS.has(key) ||
                key.startsWith('locations-') ||
                (key.startsWith('dock-') && !DOCK_AXIS_EXCLUDED_SETTING_KEYS.has(key));
        }

        if (mode === PANEL_MODE_TASKBAR && key === 'dock-min-icon-size')
            return true;

        return !MODE_SETTING_KEYS.has(key) &&
            !['panel-position', 'spotlight-enabled'].includes(key) &&
            !key.startsWith('dock-');
    });
}

function savePanelAxisSettings(settings, mode, axis) {
    const profile = axisProfile(mode, axis);
    const values = savedSettingValues(settings, panelAxisSettingKeys(settings, mode));
    if (mode === PANEL_MODE_DOCK)
        values[DOCK_AXIS_PROFILE_VERSION_KEY] = new GLib.Variant('u', 1);
    settings.set_value(profile.settings, new GLib.Variant('a{sv}', values));
    settings.set_boolean(profile.saved, true);
}

function restorePanelAxisSettings(settings, mode, axis) {
    const profile = axisProfile(mode, axis);
    if (!settings.get_boolean(profile.saved))
        return false;

    const values = settings.get_value(profile.settings).deepUnpack();
    const legacyDockProfile = mode === PANEL_MODE_DOCK && !values[DOCK_AXIS_PROFILE_VERSION_KEY];
    const missingKeys = new Set();
    for (const key of panelAxisSettingKeys(settings, mode)) {
        if (legacyDockProfile && !values[key])
            continue;
        if (!values[key])
            missingKeys.add(key);
        restoreSettingValue(settings, key, values[key]);
    }
    applyInitialPanelAxisSettings(settings, mode, axis, missingKeys);
    return true;
}

function syncActivitiesPanelItemOrder(settings, vertical) {
    const order = normalizePanelItemOrder(settings.get_strv('panel-item-order'));
    order.splice(order.indexOf('activities'), 1);
    if (vertical)
        order.splice(order.indexOf('right-box'), 0, 'activities');
    else
        order.splice(order.indexOf('left-box') + 1, 0, 'activities');
    setStringArray(settings, 'panel-item-order', order);
}

function applyInitialPanelAxisSettings(settings, mode, axis, keys = null) {
    if (mode !== PANEL_MODE_TASKBAR && mode !== PANEL_MODE_DOCK)
        return;

    const vertical = axis === PANEL_AXIS_VERTICAL;
    const applies = key => !keys || keys.has(key);
    if (applies('app-alignment'))
        setString(settings, 'app-alignment', vertical ? 'left' : 'center');
    if (applies('icon-spacing'))
        setInteger(settings, 'icon-spacing', DEFAULT_TASKBAR_ICON_SPACING);
    if (applies('running-indicator-position')) {
        setString(
            settings,
            'running-indicator-position',
            vertical ? 'left' : 'bottom'
        );
    }
    if (applies('start-button-padding'))
        setInteger(settings, 'start-button-padding', 2);
    if (mode === PANEL_MODE_TASKBAR && applies('activities-button-position')) {
        setString(
            settings,
            'activities-button-position',
            vertical ? 'right' : 'left'
        );
        if (applies('panel-item-order'))
            syncActivitiesPanelItemOrder(settings, vertical);
    }
}

function activateRestoredAxis(settings, domain, mode) {
    const axis = domainAxis(settings, domain);
    settings.set_string(domain.activeAxisKey, axis);
    if (axisProfilesEnabled(settings, mode)) {
        const profile = axisProfile(mode, axis);
        if (!settings.get_boolean(profile.saved))
            savePanelAxisSettings(settings, mode, axis);
    }
    settings.set_boolean(domain.initializedKey, true);
}

function applyAxisPositionChange(settings, domain, mode, position) {
    const currentAxis = settings.get_string(domain.activeAxisKey);
    settings.set_boolean('panel-profile-transition', true);
    settings.set_string(domain.positionKey, position);
    const axis = domainAxis(settings, domain);
    if (currentAxis !== axis) {
        if (axisProfilesEnabled(settings, mode)) {
            savePanelAxisSettings(settings, mode, currentAxis);
            if (!restorePanelAxisSettings(settings, mode, axis))
                applyInitialPanelAxisSettings(settings, mode, axis);
        }
        settings.set_string(domain.activeAxisKey, axis);
    }
    settings.set_boolean('panel-profile-transition', false);
}

function applyDefaultPanelSettings(settings) {
    settings.set_int('panel-height', 32);
    settings.set_int('panel-button-padding', 12);
    settings.set_string('panel-position', 'top');
    settings.set_string('clock-position', 'center');
    settings.set_string('default-panel-clock-style', 'gnome');
    settings.set_boolean('windows-start-menu-enabled', false);
    settings.set_boolean('gnome-start-button-visible', false);
    settings.set_boolean('show-desktop-button-visible', false);
    settings.set_boolean('hide-dash-enabled', false);
    settings.set_boolean('launch-to-desktop-enabled', false);
}

function applyInitialPanelModeSettings(settings, mode) {
    if (mode === PANEL_MODE_DEFAULT) {
        applyDefaultPanelSettings(settings);
    } else if (mode === PANEL_MODE_MACOS_DOCK) {
        applyDefaultPanelSettings(settings);
        applyMacosDockDefaults(settings);
    } else if (mode === PANEL_MODE_UBUNTU) {
        applyDefaultPanelSettings(settings);
        applyUbuntuDockDefaults(settings);
    } else if (mode === PANEL_MODE_FLOATING_ISLAND) {
        applyFloatingIslandDefaults(settings);
    } else if (mode === PANEL_MODE_WINDOWS_10) {
        applyWindows10ThemeDefaults(settings);
    } else if (mode === PANEL_MODE_WINDOWS_11) {
        applyWindows11ThemeDefaults(settings);
    } else if (mode === PANEL_MODE_WINDOWS_XP) {
        settings.set_boolean('activities-button-visible', false);
        applyWindowsXpThemeAppearance(settings);
        applyWindowsXpThemeSettings(settings);
    }
}

function setModeFlags(settings, mode) {
    settings.set_boolean(
        'default-gnome-panel',
        mode === PANEL_MODE_DEFAULT || isDockThemeMode(mode)
    );
    settings.set_boolean(
        'windows-xp-theme-enabled',
        mode === PANEL_MODE_WINDOWS_XP
    );
    settings.set_boolean(
        'windows-10-theme-enabled',
        mode === PANEL_MODE_WINDOWS_10
    );
    settings.set_boolean(
        'windows-11-theme-enabled',
        mode === PANEL_MODE_WINDOWS_11
    );
    settings.set_boolean('macos-dock-theme-enabled', mode === PANEL_MODE_MACOS_DOCK);
    settings.set_boolean('ubuntu-theme-enabled', mode === PANEL_MODE_UBUNTU);
    settings.set_boolean('floating-island-theme-enabled', mode === PANEL_MODE_FLOATING_ISLAND);
    if (isDockThemeMode(mode))
        settings.set_boolean('dock-mode', true);
    else if (mode !== PANEL_MODE_DEFAULT)
        settings.set_boolean('dock-mode', false);
}

export function setPanelMode(settings, mode) {
    if (!settings.get_boolean('panel-mode-profiles-initialized'))
        initializePanelModeProfiles(settings);
    if (!settings.get_boolean('panel-axis-profiles-initialized'))
        initializePanelAxisProfiles(settings);

    const currentMode = settings.get_string('active-panel-mode');
    settings.set_boolean('panel-profile-transition', true);
    if (currentMode !== mode) {
        if (axisProfilesEnabled(settings, currentMode)) {
            savePanelAxisSettings(
                settings,
                currentMode,
                settings.get_string('active-panel-axis')
            );
        }
        savePanelModeSettings(settings, currentMode);
        if (isDockThemeMode(mode) && !isDockThemeMode(currentMode))
            saveDockLayout(settings);
        else if (!isDockThemeMode(mode) && isDockThemeMode(currentMode))
            restoreDockLayout(settings);
        setModeFlags(settings, mode);
        if (!restorePanelModeSettings(settings, mode)) {
            resetPanelModeSettings(settings, mode);
            applyInitialPanelModeSettings(settings, mode);
        }
        settings.set_string('active-panel-mode', mode);
        activateRestoredAxis(settings, PANEL_AXIS_DOMAIN, mode);
        if (isDockThemeMode(mode))
            activateRestoredAxis(settings, DOCK_AXIS_DOMAIN, mode);
        syncPresetIconTheme(settings, currentMode, mode);
        syncPresetWallpaper(settings, currentMode, mode);
    } else {
        setModeFlags(settings, mode);
    }
    disablePressureRevealForHotEdge(settings);
    settings.set_boolean('panel-profile-transition', false);
    settings.set_boolean('panel-mode-profiles-initialized', true);
}

export function initializePanelModeProfiles(settings) {
    if (settings.get_boolean('panel-mode-profiles-initialized')) {
        synchronizePanelMode(settings);
        return;
    }

    const mode = getRequestedPanelMode(settings);
    savePanelModeSettings(settings, mode);
    settings.set_string('active-panel-mode', mode);
    settings.set_boolean('panel-mode-profiles-initialized', true);
    initializePanelAxisProfiles(settings);
}

export function clearInterruptedProfileTransition(settings) {
    setBoolean(settings, 'panel-profile-transition', false);
}

export function synchronizePanelMode(settings) {
    if (settings.get_boolean('panel-profile-transition'))
        return;
    setPanelMode(settings, getRequestedPanelMode(settings));
}

export function setPanelPosition(settings, position) {
    if (!settings.get_boolean('panel-mode-profiles-initialized'))
        initializePanelModeProfiles(settings);
    if (!settings.get_boolean('panel-axis-profiles-initialized'))
        initializePanelAxisProfiles(settings);

    applyAxisPositionChange(
        settings,
        PANEL_AXIS_DOMAIN,
        settings.get_string('active-panel-mode'),
        position
    );
}

export function setDockPosition(settings, position) {
    if (!settings.get_boolean('dock-axis-profiles-initialized'))
        initializeDockAxisProfiles(settings);

    applyAxisPositionChange(
        settings,
        DOCK_AXIS_DOMAIN,
        activeDockMode(settings),
        position
    );
}

export function setPanelAxisProfilesEnabled(settings, mode, enabled) {
    const key = PANEL_AXIS_PROFILE_ENABLED_KEYS[mode];
    if (settings.get_boolean(key) === enabled)
        return;

    const domain = axisDomainForMode(mode);
    if (enabled && domain.isActiveMode(settings, mode)) {
        const axis = domainAxis(settings, domain);
        savePanelAxisSettings(settings, mode, axis);
        settings.set_string(domain.activeAxisKey, axis);
    }
    settings.set_boolean(key, enabled);
}

export function initializePanelAxisProfiles(settings) {
    if (settings.get_boolean('panel-axis-profiles-initialized')) {
        synchronizePanelPosition(settings);
        return;
    }

    activateRestoredAxis(
        settings,
        PANEL_AXIS_DOMAIN,
        settings.get_string('active-panel-mode')
    );
}

export function initializeDockAxisProfiles(settings) {
    if (settings.get_boolean('dock-axis-profiles-initialized'))
        return;

    activateRestoredAxis(settings, DOCK_AXIS_DOMAIN, activeDockMode(settings));
}

export function synchronizePanelPosition(settings) {
    if (settings.get_boolean('panel-profile-transition'))
        return;
    setPanelPosition(settings, settings.get_string('panel-position'));
}

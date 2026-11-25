// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    CLASSIC_HIGHLIGHT_SETTINGS,
    HIGHLIGHT_LENGTH_SETTINGS,
    HIGHLIGHT_SIZE_SETTINGS,
    TASKBAR_HIGHLIGHT_STYLE,
} from './classicHighlightSettings.js';
import {
    setBoolean,
    setInteger,
    setString,
} from './settingsUtils.js';

export const WINDOWS_11_PANEL_HEIGHT = 48;
export const WINDOWS_11_ICON_SIZE = 26;
export const WINDOWS_11_ICON_SPACING = 4;
export const WINDOWS_11_ICON_EDGE_PADDING = 6;
export const WINDOWS_11_ALIGNMENT = 'center';
export const WINDOWS_11_BUTTON_LENGTH = 42;
export const WINDOWS_11_BUTTON_SIZE = 40;
export const WINDOWS_11_BORDER_RADIUS = 8;
export const WINDOWS_11_INDICATOR_SIZE = 3;

export function applyWindows11ThemeDefaults(settings) {
    setString(settings, 'panel-position', 'bottom');
    setInteger(settings, 'panel-height', WINDOWS_11_PANEL_HEIGHT);
    setInteger(settings, 'icon-size', WINDOWS_11_ICON_SIZE);
    setInteger(settings, 'icon-spacing', WINDOWS_11_ICON_SPACING);
    setInteger(settings, 'icon-edge-padding', WINDOWS_11_ICON_EDGE_PADDING);
    setString(settings, 'app-alignment', WINDOWS_11_ALIGNMENT);
    setString(settings, 'start-button-position', WINDOWS_11_ALIGNMENT);
    setString(settings, 'start-button-custom-icon', 'builtin:windows11');
    setInteger(settings, 'start-button-padding', 0);
    setString(settings, 'taskbar-highlight-style', TASKBAR_HIGHLIGHT_STYLE.CLASSIC);
    setInteger(settings, CLASSIC_HIGHLIGHT_SETTINGS.borderRadius, WINDOWS_11_BORDER_RADIUS);
    setBoolean(settings, HIGHLIGHT_SIZE_SETTINGS.enabled, true);
    setInteger(settings, HIGHLIGHT_SIZE_SETTINGS.size, WINDOWS_11_BUTTON_SIZE);
    setBoolean(settings, HIGHLIGHT_LENGTH_SETTINGS.enabled, true);
    setInteger(settings, HIGHLIGHT_LENGTH_SETTINGS.size, WINDOWS_11_BUTTON_LENGTH);
    setString(settings, 'running-indicator-style', 'metro');
    setInteger(settings, 'running-indicator-size', WINDOWS_11_INDICATOR_SIZE);
    setBoolean(settings, 'running-indicator-full-length', false);
    setString(settings, 'clock-style', 'windows');
    setString(settings, 'start-menu-style', 'windows-11');
    setBoolean(settings, 'windows-start-menu-enabled', true);
    setBoolean(settings, 'windows-11-weather-visible', true);
    setBoolean(settings, 'windows-11-search-bar-visible', true);
    setBoolean(settings, 'transparency-enabled', false);
    setBoolean(settings, 'activities-button-visible', false);
}

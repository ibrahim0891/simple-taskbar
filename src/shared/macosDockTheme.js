// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import GLib from 'gi://GLib';

import {
    APPLICATION_CLICK_ANIMATION,
    APP_ICON_HOVER_ANIMATION,
    APP_ICON_HOVER_ANIMATION_SETTINGS,
    WINDOW_MINIMIZE_EFFECT,
} from './applicationAnimations.js';
import {HOVER_ACTION} from './interactionActions.js';
import {CLASSIC_HIGHLIGHT_SETTINGS, TASKBAR_HIGHLIGHT_STYLE} from './classicHighlightSettings.js';

export function applyMacosDockDefaults(settings) {
    settings.set_int('icon-size', 70);
    settings.set_int('dock-min-icon-size', 32);
    settings.set_int('icon-spacing', 0);
    settings.set_int('icon-edge-padding', 3);
    settings.set_string('app-alignment', 'center');
    settings.set_int('start-button-padding', 2);
    settings.set_boolean('windows-start-menu-enabled', false);
    settings.set_boolean('gnome-start-button-visible', true);
    settings.set_string('default-panel-start-button-location', 'dock');
    settings.set_strv('dock-item-order', ['applications', 'start-button']);
    settings.set_boolean('hide-pinned-taskbar-apps', false);
    settings.set_boolean('hide-unpinned-taskbar-apps', false);
    settings.set_string('start-button-custom-icon', 'builtin:macos-launchpad');
    settings.set_boolean('use-pinned-apps-as-launchers', false);
    settings.set_boolean('show-pinned-app-separator', true);
    settings.set_boolean('focused-app-visible', true);
    settings.set_boolean('spotlight-enabled', true);
    settings.set_boolean('panel-theme-follow-system', true);
    settings.set_string('panel-theme', 'light');
    settings.set_string('default-panel-clock-style', 'gnome');
    settings.set_string('window-minimize-effect', WINDOW_MINIMIZE_EFFECT.MAGIC_LAMP);
    settings.set_string('animate-appicon-hover-animation-type', APP_ICON_HOVER_ANIMATION.MAGNIFY);
    const zoom = settings.get_value(APP_ICON_HOVER_ANIMATION_SETTINGS.zoom).deepUnpack();
    zoom[APP_ICON_HOVER_ANIMATION.MAGNIFY] = 1.5;
    settings.set_value(
        APP_ICON_HOVER_ANIMATION_SETTINGS.zoom,
        new GLib.Variant('a{sd}', zoom)
    );
    settings.set_string('application-click-animation', APPLICATION_CLICK_ANIMATION.BOUNCE);
    settings.set_string('application-hover-action', HOVER_ACTION.SHOW_TOOLTIP);
    settings.set_string('combine-app-buttons-mode', 'always');
    settings.set_string('running-indicator-style', 'dashes');
    settings.set_string('running-indicator-position', 'bottom');
    settings.set_int('running-indicator-size', 4);
    settings.set_boolean('running-indicator-full-length', false);
    settings.set_boolean('custom-indicator-colors-enabled', false);
    settings.set_boolean('match-icon-color', true);
    settings.set_string('focused-indicator-color', '#000000');
    settings.set_string('unfocused-indicator-color', '#000000');
    settings.set_string('taskbar-highlight-style', TASKBAR_HIGHLIGHT_STYLE.GLASS);
    settings.set_boolean(CLASSIC_HIGHLIGHT_SETTINGS.hoverEnabled, false);
    settings.set_boolean(CLASSIC_HIGHLIGHT_SETTINGS.focusEnabled, false);
    settings.set_boolean('dock-panel-theme-follow-system', true);
    settings.set_string('dock-panel-theme', 'light');
    settings.set_boolean('dock-transparency-enabled', true);
    settings.set_int('dock-transparency-level', 30);
    settings.set_boolean('dock-custom-panel-color-enabled', false);
    settings.set_boolean('dock-custom-panel-gradient-enabled', false);
    settings.set_boolean('dock-panel-mode', false);
    settings.set_boolean('dock-floating', true);
    settings.set_int('dock-side-padding', 0);
    settings.set_int('dock-corner-radius', 24);
    settings.set_string('dock-position', 'bottom');
    settings.set_boolean('dock-show-locations', true);
    settings.set_boolean('dock-show-minimized-windows', true);
}

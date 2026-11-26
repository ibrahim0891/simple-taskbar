// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import {
    APPLICATION_CLICK_ANIMATION,
    APP_ICON_HOVER_ANIMATION,
    WINDOW_MINIMIZE_EFFECT,
} from './applicationAnimations.js';
import {HOVER_ACTION} from './interactionActions.js';
import {CLASSIC_HIGHLIGHT_SETTINGS, TASKBAR_HIGHLIGHT_STYLE} from './classicHighlightSettings.js';

/**
 * Apply Ubuntu Dock-style defaults (left-edge panel dock, bottom app grid button,
 * top-aligned apps, regular GNOME topbar, and Ubuntu orange dot indicators).
 *
 * @param {Gio.Settings} settings Extension settings object.
 */
export function applyUbuntuDockDefaults(settings) {
    settings.set_int('icon-size', 48);
    settings.set_int('icon-spacing', 6);
    settings.set_int('start-button-padding', 2);
    settings.set_boolean('windows-start-menu-enabled', false);
    settings.set_boolean('gnome-start-button-visible', true);
    settings.set_string('default-panel-start-button-location', 'dock');
    settings.set_strv('dock-item-order', ['applications', 'start-button']);
    settings.set_string('app-alignment', 'left');
    settings.set_boolean('start-button-follow-app-alignment', false);
    settings.set_string('start-button-position', 'right');
    settings.set_boolean('use-pinned-apps-as-launchers', false);
    settings.set_boolean('show-pinned-app-separator', false);
    settings.set_boolean('focused-app-visible', true);
    settings.set_boolean('spotlight-enabled', false);
    settings.set_string('window-minimize-effect', WINDOW_MINIMIZE_EFFECT.GNOME_DEFAULT);
    settings.set_string('animate-appicon-hover-animation-type', APP_ICON_HOVER_ANIMATION.NONE);
    settings.set_string('application-click-animation', APPLICATION_CLICK_ANIMATION.NONE);
    settings.set_string('application-hover-action', HOVER_ACTION.SHOW_TOOLTIP);
    settings.set_string('combine-app-buttons-mode', 'always');
    settings.set_string('running-indicator-style', 'dots');
    settings.set_string('running-indicator-position', 'left');
    settings.set_int('running-indicator-size', 4);
    settings.set_boolean('custom-indicator-colors-enabled', true);
    settings.set_boolean('match-icon-color', false);
    settings.set_string('focused-indicator-color', '#E95420');
    settings.set_string('unfocused-indicator-color', '#E95420');
    settings.set_string('taskbar-highlight-style', TASKBAR_HIGHLIGHT_STYLE.CLASSIC);
    settings.set_boolean(CLASSIC_HIGHLIGHT_SETTINGS.hoverEnabled, true);
    settings.set_boolean(CLASSIC_HIGHLIGHT_SETTINGS.focusEnabled, false);
    settings.set_boolean('dock-panel-theme-follow-system', true);
    settings.set_boolean('dock-transparency-enabled', true);
    settings.set_int('dock-transparency-level', 25);
    settings.set_boolean('dock-custom-panel-color-enabled', false);
    settings.set_boolean('dock-custom-panel-gradient-enabled', false);
    settings.set_boolean('dock-panel-mode', true);
    settings.set_boolean('dock-floating', false);
    settings.set_boolean('dock-panel-mode-floating', false);
    settings.set_boolean('dock-autohide-enabled', false);
    settings.set_boolean('dock-dodge-windows-enabled', false);
    settings.set_string('dock-position', 'left');
    settings.set_boolean('dock-show-locations', true);
    settings.set_boolean('dock-show-trash', true);
    settings.set_boolean('dock-show-mounts', true);
    settings.set_boolean('dock-show-minimized-windows', false);
}

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
 * Apply Floating Island preset defaults: dynamic-width bottom floating pill
 * with full rounded corners and unified icon padding and spacing.
 *
 * @param {Gio.Settings} settings Extension settings object.
 */
export function applyFloatingIslandDefaults(settings) {
    settings.set_string('panel-position', 'bottom');
    settings.set_boolean('taskbar-dynamic', true);
    settings.set_boolean('taskbar-dynamic-floating', true);
    settings.set_boolean('taskbar-floating', true);
    settings.set_int('taskbar-floating-gap', 8);
    settings.set_int('taskbar-corner-radius', 32);
    settings.set_int('panel-button-corner-radius', 16);
    settings.set_boolean('panel-buttons-follow-app-highlight', true);
    settings.set_int('icon-size', 46);
    settings.set_int('icon-spacing', 4);
    settings.set_int('icon-edge-padding', 5);
    settings.set_int('taskbar-side-padding', 4);
    settings.set_int('taskbar-dynamic-panel-button-padding', 4);
    settings.set_int('taskbar-highlight-edge-gap', 2);
    settings.set_int('start-button-padding', 0);
    settings.set_string('start-button-custom-icon', 'builtin:circle-grid');
    settings.set_string('clock-style', 'gnome');
    settings.set_boolean('panel-height-follow-icon-size', false);
    settings.set_int('panel-height', 56);
    settings.set_boolean('activities-button-visible', false);
    settings.set_boolean('windows-start-menu-enabled', false);
    settings.set_boolean('gnome-start-button-visible', true);
    settings.set_boolean('show-desktop-button-visible', false);
    settings.set_boolean('use-pinned-apps-as-launchers', false);
    settings.set_boolean('show-pinned-app-separator', true);
    settings.set_boolean('focused-app-visible', false);
    settings.set_boolean('spotlight-enabled', true);
    settings.set_string('combine-app-buttons-mode', 'always');
    settings.set_string('window-minimize-effect', WINDOW_MINIMIZE_EFFECT.GNOME_DEFAULT);
    settings.set_string('animate-appicon-hover-animation-type', APP_ICON_HOVER_ANIMATION.SIMPLE);
    settings.set_string('application-click-animation', APPLICATION_CLICK_ANIMATION.BOUNCE);
    settings.set_string('application-hover-action', HOVER_ACTION.SHOW_TOOLTIP);
    settings.set_string('running-indicator-style', 'dots');
    settings.set_string('running-indicator-position', 'bottom');
    settings.set_int('running-indicator-size', 4);
    settings.set_string('taskbar-highlight-style', TASKBAR_HIGHLIGHT_STYLE.GLASS);
    settings.set_boolean(CLASSIC_HIGHLIGHT_SETTINGS.hoverEnabled, false);
    settings.set_boolean(CLASSIC_HIGHLIGHT_SETTINGS.focusEnabled, false);
    settings.set_boolean('panel-theme-follow-system', true);
    settings.set_boolean('transparency-enabled', true);
    settings.set_int('transparency-level', 25);
}

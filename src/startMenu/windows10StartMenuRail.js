// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import AccountsService from 'gi://AccountsService';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as UserWidget from 'resource:///org/gnome/shell/ui/userWidget.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {LocationsController} from '../locations/locationsController.js';
import {clickCameFromKeyboard, isPrimaryPressOrTouch} from '../inputUtils.js';
import {SETTINGS_APP_ID} from '../shared/systemApps.js';
import {openSettingsPanel} from '../shared/systemApps.js';

const RAIL_COLLAPSED_WIDTH = 48;
const RAIL_EXPANDED_WIDTH = 212;
const RAIL_EXPAND_DURATION = 160;
const RAIL_COLLAPSE_DURATION = 130;

export class Windows10StartMenuRail {
    constructor({
        appSystem,
        powerController,
        powerGIcon,
        settings,
        settingsGIcon,
        closeMenu,
        enableNavigation,
        syncButtonClasses,
    }) {
        this._appSystem = appSystem;
        this._powerController = powerController;
        this._settings = settings;
        this._closeMenu = closeMenu;
        this._enableNavigation = enableNavigation;
        this._syncButtonClasses = syncButtonClasses;
        this._expanded = false;
        this._labels = [];
        this._locationButtons = [];

        this._locationController = new LocationsController({
            settings,
            scope: 'start-menu',
            onChanged: () => this._syncLocationButtons(),
        });

        this.actor = new St.BoxLayout({
            style_class: 'simple-taskbar-win10-rail',
            orientation: Clutter.Orientation.VERTICAL,
            y_expand: true,
            clip_to_allocation: true,
            width: RAIL_COLLAPSED_WIDTH,
        });

        const expandButton = this._createRailButton({
            icon: new St.Icon({
                icon_name: 'open-menu-symbolic',
                icon_size: 16,
            }),
            labelText: _('START'),
            accessibleName: _('Expand'),
            styleClass: 'simple-taskbar-win10-rail-button simple-taskbar-win10-rail-expand',
            onClick: () => this.setExpanded(!this._expanded),
        });
        this.actor.add_child(expandButton);

        this.actor.add_child(new St.Widget({y_expand: true}));

        this._bottomBox = new St.BoxLayout({
            style_class: 'simple-taskbar-win10-rail-bottom',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        this.actor.add_child(this._bottomBox);

        this._defaultUserIcon = new St.Icon({
            icon_name: 'avatar-default-symbolic',
            icon_size: 20,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._user = AccountsService.UserManager
            .get_default()
            .get_user(GLib.get_user_name());
        this._userAvatar = new UserWidget.Avatar(this._user, {
            styleClass: 'simple-taskbar-windows-start-user-avatar',
            iconSize: 20,
        });
        this._userAvatar.y_align = Clutter.ActorAlign.CENTER;
        const userIconStack = new St.BoxLayout({
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        userIconStack.add_child(this._defaultUserIcon);
        userIconStack.add_child(this._userAvatar);

        const userButton = this._createRailButton({
            icon: userIconStack,
            labelText: '',
            accessibleName: _('User Account'),
            onClick: () => {
                this._closeMenu();
                openSettingsPanel('system', ['users']);
            },
        });
        this._userNameLabel = userButton._railLabel;
        this._user.connectObject(
            'notify::is-loaded', () => this._syncUserDetails(),
            'changed', () => this._syncUserDetails(),
            this._userAvatar
        );
        this._syncUserDetails();
        this.syncUserAvatar();
        this._bottomBox.add_child(userButton);

        this._locationsBox = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        this._bottomBox.add_child(this._locationsBox);
        this._syncLocationButtons();

        const settingsButton = this._createRailButton({
            icon: new St.Icon({
                gicon: settingsGIcon,
                icon_size: 16,
            }),
            labelText: _('Settings'),
            accessibleName: _('Settings'),
            onClick: () => {
                this._closeMenu();
                this._appSystem.lookup_app(SETTINGS_APP_ID)?.activate();
            },
        });
        this._bottomBox.add_child(settingsButton);

        this._powerButton = this._createRailButton({
            icon: new St.Icon({
                gicon: powerGIcon,
                style_class: 'simple-taskbar-windows-start-power-icon',
                icon_size: 16,
            }),
            labelText: _('Power'),
            accessibleName: _('Power Options'),
            activateOnPress: true,
            onClick: () => this._powerController.toggle(),
        });
        this._bottomBox.add_child(this._powerButton);
        this.setExpanded(false, false);
    }

    get powerButton() {
        return this._powerButton;
    }

    setExpanded(expanded, animate = true) {
        const nextExpanded = Boolean(expanded);
        this._expanded = nextExpanded;
        this.actor.remove_all_transitions();

        const targetWidth = nextExpanded
            ? RAIL_EXPANDED_WIDTH
            : RAIL_COLLAPSED_WIDTH;

        if (nextExpanded) {
            this.actor.add_style_class_name('simple-taskbar-win10-rail-expanded');
            for (const label of this._labels)
                label.visible = true;
        }

        if (!animate) {
            this.actor.width = targetWidth;
            if (!nextExpanded) {
                this.actor.remove_style_class_name('simple-taskbar-win10-rail-expanded');
                for (const label of this._labels)
                    label.visible = false;
            }
            return;
        }

        this.actor.ease({
            width: targetWidth,
            duration: nextExpanded
                ? RAIL_EXPAND_DURATION
                : RAIL_COLLAPSE_DURATION,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (!this._expanded && this.actor) {
                    this.actor.remove_style_class_name(
                        'simple-taskbar-win10-rail-expanded'
                    );
                    for (const label of this._labels)
                        label.visible = false;
                }
            },
        });
    }

    syncUserAvatar() {
        const showProfilePicture = this._settings.get_boolean(
            'start-menu-show-profile-picture'
        );
        this._userAvatar.visible = showProfilePicture;
        this._defaultUserIcon.visible = !showProfilePicture;
    }

    destroy() {
        this._user?.disconnectObject(this._userAvatar);
        this._locationController?.destroy();
        this._locationController = null;
        this.actor?.destroy();
        this.actor = null;
        this._bottomBox = null;
        this._locationsBox = null;
        this._locationButtons = null;
        this._labels = null;
        this._powerButton = null;
        this._userAvatar = null;
        this._defaultUserIcon = null;
        this._userNameLabel = null;
        this._user = null;
        this._syncButtonClasses = null;
        this._enableNavigation = null;
        this._closeMenu = null;
        this._settings = null;
        this._powerController = null;
        this._appSystem = null;
    }

    _syncUserDetails() {
        this._userAvatar.update();
        const realName = this._user.get_real_name();
        this._userNameLabel.text = realName || GLib.get_user_name();
    }

    _syncLocationButtons() {
        for (const button of this._locationButtons) {
            const labelIdx = this._labels.indexOf(button._railLabel);
            if (labelIdx >= 0)
                this._labels.splice(labelIdx, 1);
            button.destroy();
        }
        this._locationButtons = [];

        for (const entry of this._locationController.getFolderEntries()) {
            const location = entry.app;
            const button = this._createRailButton({
                icon: new St.Icon({
                    gicon: location.icon,
                    icon_size: 16,
                }),
                labelText: location.get_name(),
                accessibleName: location.get_name(),
                onClick: () => {
                    this._closeMenu();
                    location.open_new_window();
                },
            });
            this._locationsBox.add_child(button);
            this._locationButtons.push(button);
        }
    }

    _createRailButton({
        icon,
        labelText,
        accessibleName,
        styleClass = 'simple-taskbar-win10-rail-button',
        activateOnPress = false,
        onClick,
    }) {
        const iconSlot = new St.Bin({
            style_class: 'simple-taskbar-win10-rail-icon',
            width: RAIL_COLLAPSED_WIDTH,
            height: 40,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            child: icon,
        });
        const label = new St.Label({
            style_class: 'simple-taskbar-win10-rail-label',
            text: labelText,
            visible: this._expanded,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        this._labels.push(label);

        const content = new St.BoxLayout({
            style_class: 'simple-taskbar-win10-rail-content',
            x_expand: true,
        });
        content.add_child(iconSlot);
        content.add_child(label);

        const button = new St.Button({
            style_class: styleClass,
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            accessible_name: accessibleName,
            child: content,
        });
        button._railLabel = label;
        this._enableNavigation(button);
        if (activateOnPress) {
            button.connect('captured-event', (_actor, event) => {
                if (isPrimaryPressOrTouch(event))
                    onClick();
                return Clutter.EVENT_PROPAGATE;
            });
            button.connect('clicked', () => {
                if (clickCameFromKeyboard())
                    onClick();
            });
        } else {
            button.connect('clicked', onClick);
        }
        this._syncButtonClasses(button);
        return button;
    }
}

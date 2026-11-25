// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Weather from 'resource:///org/gnome/shell/misc/weather.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {panelIsVertical} from '../shared/panelPositionUtils.js';

const GNOME_WEATHER_APP_ID = 'org.gnome.Weather.desktop';

export class PanelWeatherController {
    constructor(settings) {
        this._settings = settings;
        this._appSystem = Shell.AppSystem.get_default();
        this._weatherClient = null;
        try {
            this._weatherClient = new Weather.WeatherClient();
        } catch (_error) {
            this._weatherClient = null;
        }

        this._icon = new St.Icon({
            style_class: 'simple-taskbar-win11-weather-icon',
            icon_name: 'weather-clear-symbolic',
            icon_size: 20,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._tempLabel = new St.Label({
            style_class: 'simple-taskbar-win11-weather-temp',
            text: '',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._skyLabel = new St.Label({
            style_class: 'simple-taskbar-win11-weather-sky',
            text: _('Weather'),
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._skyLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;

        const labels = new St.BoxLayout({
            style_class: 'simple-taskbar-win11-weather-labels',
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
        });
        labels.add_child(this._tempLabel);
        labels.add_child(this._skyLabel);

        const content = new St.BoxLayout({
            style_class: 'simple-taskbar-win11-weather-content',
            y_align: Clutter.ActorAlign.CENTER,
        });
        content.add_child(this._icon);
        content.add_child(labels);

        this.actor = new St.Button({
            style_class: 'panel-button simple-taskbar-win11-weather-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            y_align: Clutter.ActorAlign.CENTER,
            accessible_name: _('Weather'),
            child: content,
        });
        this.actor.connect('clicked', () => this._activateWeatherApp());
    }

    enable() {
        this._weatherClient?.connectObject(
            'changed',
            () => this._updateWeather(),
            this
        );
        this._appSystem.connectObject(
            'installed-changed',
            () => this.sync(),
            this
        );
        for (const key of [
            'windows-11-theme-enabled',
            'windows-11-weather-visible',
            'panel-position',
        ]) {
            this._settings.connectObject(
                `changed::${key}`,
                () => this.sync(),
                this
            );
        }
        this._updateWeather();
        this.sync();
    }

    sync() {
        if (!this.actor)
            return;

        const visible = this._shouldShow();
        const leftBox = Main.panel._leftBox;
        if (visible) {
            if (this.actor.get_parent() !== leftBox) {
                this.actor.get_parent()?.remove_child(this.actor);
                leftBox.insert_child_at_index(this.actor, 0);
            } else if (leftBox.get_child_at_index(0) !== this.actor) {
                leftBox.set_child_at_index(this.actor, 0);
            }
            this.actor.show();
            this._updateWeather();
        } else {
            this.actor.hide();
            this.actor.get_parent()?.remove_child(this.actor);
        }
    }

    destroy() {
        this._weatherClient?.disconnectObject(this);
        this._weatherClient = null;
        this._appSystem?.disconnectObject(this);
        this._appSystem = null;
        this._settings?.disconnectObject(this);
        this._settings = null;
        this.actor?.get_parent()?.remove_child(this.actor);
        this.actor?.destroy();
        this.actor = null;
        this._icon = null;
        this._tempLabel = null;
        this._skyLabel = null;
    }

    _shouldShow() {
        return !panelIsVertical(this._settings) &&
            this._settings.get_boolean('windows-11-theme-enabled') &&
            this._settings.get_boolean('windows-11-weather-visible') &&
            Boolean(this._weatherApp() || this._weatherClient?.available);
    }

    _weatherApp() {
        return this._appSystem.lookup_app(GNOME_WEATHER_APP_ID);
    }

    _activateWeatherApp() {
        if (this._weatherClient?.available) {
            this._weatherClient.activateApp();
            return;
        }
        this._weatherApp()?.activate();
    }

    _updateWeather() {
        if (!this._weatherClient)
            return;

        const info = this._weatherClient.info;
        if (!this._weatherClient.hasLocation || !info || !info.is_valid()) {
            this._icon.icon_name = 'weather-clear-symbolic';
            this._tempLabel.text = '';
            this._tempLabel.visible = false;
            this._skyLabel.text = _('Weather');
            return;
        }

        const iconName = info.get_symbolic_icon_name() || 'weather-clear-symbolic';
        const temp = info.get_temp_summary()?.trim() ?? '';
        const sky = info.get_sky()?.trim() ?? '';
        this._icon.icon_name = iconName;
        this._tempLabel.text = temp;
        this._tempLabel.visible = Boolean(temp);
        this._skyLabel.text = sky || _('Weather');
    }
}

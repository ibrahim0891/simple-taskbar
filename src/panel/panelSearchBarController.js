// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as ShellEntry from 'resource:///org/gnome/shell/ui/shellEntry.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import {showScreenshotUI} from 'resource:///org/gnome/shell/ui/screenshot.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {panelArrowSide, syncMenuArrowSide} from './panelMenuPositioner.js';
import {closePopupMenu, openPopupMenu} from '../popupMenuUtils.js';
import {panelIsVertical} from '../shared/panelPositionUtils.js';
import {panelUsesLightTheme} from '../themeUtils.js';
import {appShouldShow} from '../startMenu/startMenuAppModel.js';
import {StartMenuSearchController} from '../startMenu/startMenuSearchController.js';
import {GoogleWebSearch, openGoogleSearch} from '../startMenu/googleWebSearch.js';

const PANEL_WIDTH = 440;
const PANEL_HEIGHT = 440;
const TOP_APPS_COLUMNS = 4;
const MAX_TOP_APPS = 8;

export class PanelSearchBarController {
    constructor(settings) {
        this._settings = settings;
        this._searchController = new StartMenuSearchController();
        this._googleSearch = new GoogleWebSearch();
        this._menuManager = null;
        this._firstLocalResult = null;

        const pillContent = new St.BoxLayout({
            style_class: 'simple-taskbar-win11-search-pill-content',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
        });
        pillContent.add_child(new St.Icon({
            style_class: 'simple-taskbar-win11-search-pill-icon',
            icon_name: 'system-search-symbolic',
            icon_size: 15,
            y_align: Clutter.ActorAlign.CENTER,
        }));
        pillContent.add_child(new St.Label({
            style_class: 'simple-taskbar-win11-search-pill-label',
            text: _('Search'),
            y_align: Clutter.ActorAlign.CENTER,
        }));

        this.actor = new St.Button({
            style_class: 'simple-taskbar-win11-search-pill',
            reactive: true,
            can_focus: true,
            track_hover: true,
            y_align: Clutter.ActorAlign.CENTER,
            accessible_name: _('Search'),
            child: pillContent,
        });
        this.actor.connect('clicked', () => this.toggle());

        this._createMenu();
    }

    enable() {
        for (const key of [
            'windows-10-theme-enabled',
            'windows-11-theme-enabled',
            'windows-xp-theme-enabled',
            'windows-11-search-bar-visible',
            'panel-position',
        ]) {
            this._settings.connectObject(
                `changed::${key}`,
                () => this.sync(),
                this
            );
        }
        for (const key of [
            'start-menu-theme',
            'start-menu-follow-panel-theme',
            'panel-theme-follow-system',
            'panel-theme',
            'windows-10-theme-enabled',
            'windows-11-theme-enabled',
        ]) {
            this._settings.connectObject(
                `changed::${key}`,
                () => this.syncTheme(),
                this
            );
        }
        Main.panel.connectObject(
            'notify::style-class',
            () => this.syncTheme(),
            this
        );
        St.ThemeContext.get_for_stage(global.stage).connectObject(
            'changed',
            () => this.syncTheme(),
            this
        );
        St.Settings.get().connectObject(
            'notify::color-scheme',
            () => this.syncTheme(),
            this
        );
        this.syncTheme();
        this.sync();
    }

    sync() {
        if (!this.actor)
            return;

        const win10 = this._settings.get_boolean('windows-10-theme-enabled');
        const win11 = this._settings.get_boolean('windows-11-theme-enabled');
        const winXp = this._settings.get_boolean('windows-xp-theme-enabled');
        const visible = !panelIsVertical(this._settings) &&
            !winXp &&
            (win10 || win11) &&
            this._settings.get_boolean('windows-11-search-bar-visible');
        this.actor.visible = visible;

        if (win10) {
            this.actor.add_style_class_name('simple-taskbar-win10-search-box');
            this._menu?.actor.add_style_class_name('simple-taskbar-win10-layout');
        } else {
            this.actor.remove_style_class_name('simple-taskbar-win10-search-box');
            this._menu?.actor.remove_style_class_name('simple-taskbar-win10-layout');
        }

        if (!visible)
            this.close(false);
    }

    syncTheme() {
        if (!this._menu)
            return;

        const panelLight = panelUsesLightTheme(this._settings);
        if (panelLight) {
            this.actor.add_style_class_name('simple-taskbar-win11-search-pill-light');
            this.actor.remove_style_class_name('simple-taskbar-win11-search-pill-dark');
        } else {
            this.actor.add_style_class_name('simple-taskbar-win11-search-pill-dark');
            this.actor.remove_style_class_name('simple-taskbar-win11-search-pill-light');
        }

        const theme = this._effectiveTheme();
        const actor = this._menu.actor;
        actor.remove_style_class_name('simple-taskbar-windows-start-dark');
        actor.remove_style_class_name('simple-taskbar-windows-start-light');
        actor.remove_style_class_name('simple-taskbar-windows-start-shell');
        if (theme === 'dark')
            actor.add_style_class_name('simple-taskbar-windows-start-dark');
        else if (theme === 'light')
            actor.add_style_class_name('simple-taskbar-windows-start-light');
        else
            actor.add_style_class_name('simple-taskbar-windows-start-shell');

        const entryStyle = theme === 'light'
            ? 'color: #18191b;'
            : theme === 'dark'
                ? 'color: #f6f6f6;'
                : null;
        this._entry?.set_style(entryStyle);
    }

    toggle() {
        if (this._menu.isOpen)
            this.close();
        else
            this.open();
    }

    open() {
        this._entry.set_text('');
        this._showIdleView();
        this._updateSize();
        syncMenuArrowSide(this._menu, this._settings);
        this._syncPositionSource();
        openPopupMenu(this._menu);
        this._syncPositionSource();
        if (this._menu.isOpen)
            this._entry.grab_key_focus();
    }

    _syncPositionSource() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor || !this._menu)
            return;

        const win10 = this._settings.get_boolean('windows-10-theme-enabled');
        const panelBox = Main.layoutManager.panelBox;
        const panelY = panelBox?.y ?? monitor.y;
        const panelHeight = Math.max(1, Math.round(Main.panel.height));
        const sourceX = win10
            ? monitor.x
            : Math.round(monitor.x + monitor.width / 2);
        const alignment = win10 ? 0.0 : 0.5;

        Main.layoutManager.setDummyCursorGeometry(
            sourceX,
            Math.round(panelY),
            1,
            panelHeight
        );
        const dummy = Main.layoutManager.dummyCursor;
        this._menu.sourceActor = dummy;
        this._menu.focusActor = dummy;
        this._menu._arrowAlignment = alignment;
        this._menu._boxPointer.setSourceAlignment(alignment);
        this._menu._boxPointer.setPosition(dummy, alignment);
    }

    close(animate = true) {
        this._searchController.cancel();
        this._googleSearch.cancel();
        if (this._menu?.isOpen)
            closePopupMenu(this._menu, animate);
    }

    destroy() {
        this.close(false);
        Main.panel.disconnectObject(this);
        St.ThemeContext.get_for_stage(global.stage).disconnectObject(this);
        St.Settings.get().disconnectObject(this);
        this._settings?.disconnectObject(this);
        this._settings = null;
        this._searchController?.destroy();
        this._searchController = null;
        this._googleSearch?.destroy();
        this._googleSearch = null;
        this._menu?.destroy();
        this._menu = null;
        this._menuManager = null;
        this.actor?.get_parent()?.remove_child(this.actor);
        this.actor?.destroy();
        this.actor = null;
        this._root = null;
        this._entry = null;
        this._localColumn = null;
        this._localScroll = null;
        this._webColumn = null;
        this._webScroll = null;
        this._idleView = null;
        this._columnsView = null;
        this._firstLocalResult = null;
    }

    _effectiveTheme() {
        if (!this._settings.get_boolean('start-menu-follow-panel-theme'))
            return this._settings.get_string('start-menu-theme');

        return panelUsesLightTheme(this._settings) ? 'light' : 'dark';
    }

    _createMenu() {
        this._menu = new PopupMenu.PopupMenu(
            this.actor,
            0.5,
            panelArrowSide(this._settings)
        );
        this._menu.actor.add_style_class_name(
            'simple-taskbar-windows-start-menu simple-taskbar-win11-search-panel'
        );
        this._menu.actor.hide();
        Main.uiGroup.add_child(this._menu.actor);
        this._menuManager = new PopupMenu.PopupMenuManager(this.actor);
        this._menuManager.addMenu(this._menu);

        const section = new PopupMenu.PopupMenuSection();
        this._menu.addMenuItem(section);

        this._root = new St.BoxLayout({
            style_class: 'simple-taskbar-win11-search-root',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_expand: true,
        });
        section.actor.add_child(this._root);

        this._entry = new St.Entry({
            style_class: 'simple-taskbar-windows-start-search',
            hint_text: _('Type here to search apps, files, or Google'),
            can_focus: true,
            track_hover: true,
            x_expand: true,
        });
        ShellEntry.addContextMenu(this._entry);
        this._entry.set_primary_icon(new St.Icon({
            icon_name: 'system-search-symbolic',
            style_class: 'simple-taskbar-windows-start-search-icon',
        }));
        const clearIcon = new St.Icon({
            icon_name: 'edit-clear-symbolic',
            style_class: 'simple-taskbar-windows-start-search-icon',
        });
        this._entry.clutter_text.connect('text-changed', () => {
            const text = this._entry.get_text();
            this._entry.set_secondary_icon(text ? clearIcon : null);
            this._onQueryChanged(text);
        });
        this._entry.connect('secondary-icon-clicked', () => {
            this._entry.set_text('');
            this._entry.grab_key_focus();
        });
        this._entry.clutter_text.connect('activate', () => {
            if (this._firstLocalResult) {
                this._activateLocalResult(this._firstLocalResult);
                return;
            }
            const query = this._entry.get_text().trim();
            if (query) {
                this.close();
                openGoogleSearch(query);
            }
        });
        this._entry.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                this.close();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._root.add_child(this._entry);

        this._idleView = new St.BoxLayout({
            style_class: 'simple-taskbar-win11-search-idle',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_expand: true,
        });
        this._root.add_child(this._idleView);

        this._columnsView = new St.BoxLayout({
            style_class: 'simple-taskbar-win11-search-columns',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            visible: false,
        });

        this._localScroll = new St.ScrollView({
            style_class: 'simple-taskbar-win11-search-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        this._localColumn = new St.BoxLayout({
            style_class: 'simple-taskbar-win11-search-column',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        this._localScroll.add_child(this._localColumn);

        this._webScroll = new St.ScrollView({
            style_class: 'simple-taskbar-win11-search-scroll simple-taskbar-win11-search-web-scroll',
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            overlay_scrollbars: true,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        this._webColumn = new St.BoxLayout({
            style_class: 'simple-taskbar-win11-search-column',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
        });
        this._webScroll.add_child(this._webColumn);

        this._columnsView.add_child(this._localScroll);
        this._columnsView.add_child(this._webScroll);
        this._root.add_child(this._columnsView);
    }

    _updateSize() {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        const width = Math.min(PANEL_WIDTH, monitor.width - 32);
        const height = Math.min(PANEL_HEIGHT, monitor.height - 96);
        this._root.set_style(`width: ${width}px; height: ${height}px;`);
    }

    _showIdleView() {
        this._searchController.cancel();
        this._googleSearch.cancel();
        this._firstLocalResult = null;
        this._columnsView.hide();
        this._idleView.show();

        for (const child of this._idleView.get_children())
            child.destroy();

        this._idleView.add_child(new St.Label({
            style_class: 'simple-taskbar-windows-start-section-heading',
            text: _('Top apps'),
        }));

        const topApps = Shell.AppUsage.get_default()
            .get_most_used()
            .filter(appShouldShow)
            .slice(0, MAX_TOP_APPS);

        const grid = new St.BoxLayout({
            style_class: 'simple-taskbar-win11-search-top-apps',
            orientation: Clutter.Orientation.VERTICAL,
        });
        for (let index = 0; index < topApps.length; index += TOP_APPS_COLUMNS) {
            const row = new St.BoxLayout({
                style_class: 'simple-taskbar-win11-search-top-apps-row',
            });
            for (const app of topApps.slice(index, index + TOP_APPS_COLUMNS)) {
                const content = new St.BoxLayout({
                    style_class: 'simple-taskbar-win11-search-top-app-content',
                    orientation: Clutter.Orientation.VERTICAL,
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                });
                content.add_child(new St.Bin({
                    child: app.create_icon_texture(32),
                    height: 38,
                    x_align: Clutter.ActorAlign.CENTER,
                    y_align: Clutter.ActorAlign.CENTER,
                }));
                const label = new St.Label({
                    style_class: 'simple-taskbar-win11-search-top-app-label',
                    text: app.get_name(),
                    width: 80,
                    x_align: Clutter.ActorAlign.CENTER,
                });
                label.clutter_text.set({
                    ellipsize: Pango.EllipsizeMode.END,
                    line_wrap: true,
                    line_wrap_mode: Pango.WrapMode.WORD_CHAR,
                });
                content.add_child(label);
                const btn = new St.Button({
                    style_class: 'simple-taskbar-win11-search-top-app-btn',
                    reactive: true,
                    can_focus: true,
                    track_hover: true,
                    width: 96,
                    height: 88,
                    accessible_name: app.get_name(),
                    child: content,
                });
                btn.connect('clicked', () => {
                    this.close();
                    app.open_new_window(-1);
                });
                row.add_child(btn);
            }
            grid.add_child(row);
        }
        this._idleView.add_child(grid);

        this._idleView.add_child(new St.Label({
            style_class: 'simple-taskbar-win11-search-hint',
            text: _('Start typing to search your apps, files, and Google'),
        }));
    }

    _onQueryChanged(query) {
        const trimmed = query.trim();
        if (!trimmed) {
            this._showIdleView();
            return;
        }

        this._idleView.hide();
        this._columnsView.show();
        this._localScroll.show();
        this._webScroll.hide();
        this._webScroll.add_style_class_name('simple-taskbar-win11-search-web-full');
        this._firstLocalResult = null;
        this._googleSearch.cancel();

        this._searchController.search(trimmed, (groups, complete) => {
            this._renderLocalResults(trimmed, groups, complete);
        });
    }

    _renderLocalResults(query, groups, complete) {
        for (const child of this._localColumn.get_children())
            child.destroy();

        this._firstLocalResult = null;
        for (const group of groups) {
            if (group.results.length === 0)
                continue;
            this._localColumn.add_child(new St.Label({
                style_class: 'simple-taskbar-windows-start-section-heading',
                text: group.name,
                x_align: Clutter.ActorAlign.START,
            }));
            for (const result of group.results) {
                if (!this._firstLocalResult)
                    this._firstLocalResult = result;
                this._localColumn.add_child(this._createLocalResultButton(result));
            }
        }

        const noLocalResults = complete && !this._firstLocalResult;
        if (noLocalResults) {
            this._localScroll.hide();
            this._webScroll.show();
            this._googleSearch.search(query, (suggestions, loading, instantAnswer = null) => {
                this._renderGoogleResults(query, suggestions, loading, instantAnswer);
            });
        } else {
            this._localScroll.show();
            this._webScroll.hide();
        }
    }

    _createLocalResultButton(result) {
        const icon = result.meta.createIcon(24) ?? new St.Icon({
            icon_name: 'system-search-symbolic',
            icon_size: 24,
        });
        const label = new St.Label({
            text: result.name,
            y_align: Clutter.ActorAlign.CENTER,
        });
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const box = new St.BoxLayout({
            style_class: 'simple-taskbar-win11-search-result-row',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        box.add_child(icon);
        box.add_child(label);
        const btn = new St.Button({
            style_class: 'simple-taskbar-windows-start-app-list-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            child: box,
        });
        btn.connect('clicked', () => this._activateLocalResult(result));
        return btn;
    }

    _activateLocalResult(result) {
        const isScreenshot = result.id === 'open-screenshot-ui';
        const isSystemAction = result.provider.id === 'applications' &&
            !result.id.endsWith('.desktop');
        this.close(!isScreenshot);
        if (isScreenshot) {
            showScreenshotUI();
        } else if (isSystemAction) {
            SystemActions.getDefault().activateAction(result.id);
        } else if (result.provider.appInfo) {
            result.provider.activateResult(result.id, result.terms);
        } else if (result.app) {
            result.app.open_new_window(-1);
        }
    }

    _renderGoogleResults(query, suggestions, loading, instantAnswer = null) {
        for (const child of this._webColumn.get_children())
            child.destroy();

        this._webColumn.add_child(new St.Label({
            style_class: 'simple-taskbar-windows-start-section-heading',
            text: _('Search Google'),
            x_align: Clutter.ActorAlign.START,
        }));

        if (instantAnswer) {
            const cardBox = new St.BoxLayout({
                style_class: 'simple-taskbar-win11-search-answer-card-content',
                orientation: Clutter.Orientation.VERTICAL,
                x_expand: true,
            });
            cardBox.add_child(new St.Label({
                style_class: 'simple-taskbar-win11-search-answer-title',
                text: instantAnswer.heading,
                x_align: Clutter.ActorAlign.START,
            }));
            const bodyLabel = new St.Label({
                style_class: 'simple-taskbar-win11-search-answer-body',
                text: instantAnswer.text,
                x_expand: true,
            });
            bodyLabel.clutter_text.set({
                line_wrap: true,
                line_wrap_mode: Pango.WrapMode.WORD_CHAR,
                ellipsize: Pango.EllipsizeMode.END,
            });
            cardBox.add_child(bodyLabel);
            const cardBtn = new St.Button({
                style_class: 'simple-taskbar-win11-search-answer-card',
                reactive: true,
                can_focus: true,
                track_hover: true,
                x_expand: true,
                x_align: Clutter.ActorAlign.FILL,
                child: cardBox,
            });
            cardBtn.connect('clicked', () => {
                this.close();
                Gio.AppInfo.launch_default_for_uri(instantAnswer.url, null);
            });
            this._webColumn.add_child(cardBtn);
        }

        this._webColumn.add_child(
            this._createWebResultButton(
                _('Search Google for “%s”').format(query),
                query,
                true
            )
        );

        if (loading) {
            this._webColumn.add_child(new St.Label({
                style_class: 'simple-taskbar-win11-search-hint',
                text: _('Loading Google suggestions…'),
            }));
            return;
        }

        for (const suggestion of suggestions) {
            if (suggestion.toLowerCase() === query.toLowerCase())
                continue;
            this._webColumn.add_child(
                this._createWebResultButton(suggestion, suggestion, false)
            );
        }
    }

    _createWebResultButton(title, searchQuery, primary) {
        const icon = new St.Icon({
            icon_name: primary ? 'web-browser-symbolic' : 'system-search-symbolic',
            icon_size: 18,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const label = new St.Label({
            text: title,
            y_align: Clutter.ActorAlign.CENTER,
        });
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const box = new St.BoxLayout({
            style_class: 'simple-taskbar-win11-search-result-row',
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        box.add_child(icon);
        box.add_child(label);
        const btn = new St.Button({
            style_class: 'simple-taskbar-windows-start-app-list-button',
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            child: box,
        });
        btn.connect('clicked', () => {
            this.close();
            openGoogleSearch(searchQuery);
        });
        return btn;
    }
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {createAppLabel} from './startMenuListView.js';

const TILE_GAP = 4;
const SMALL_TILE_SIZE = 47;
const MEDIUM_TILE_SIZE = 98;
const WIDE_TILE_WIDTH = 200;
const WIDE_TILE_HEIGHT = 98;
const LARGE_TILE_SIZE = 200;
const ROW_SLOT_CAPACITY = 3;

export class Windows10StartMenuTilesBuilder {
    constructor(settings, params) {
        this._settings = settings;
        this._pinnedModel = params.pinnedModel;
        this._navigationController = params.navigationController;
        this._tooltipController = params.tooltipController;
        this._contextMenuController = params.contextMenuController;
        this._pinnedDragController = params.pinnedDragController;
        this._createRunningIndicator = params.createRunningIndicator;
        this._launchApp = params.launchApp;
        this._openFolderApps = params.openFolderApps;
        this._syncButtonClasses = params.syncButtonClasses;
    }

    createTilesPane(pinnedItems) {
        const container = new St.BoxLayout({
            style_class: 'simple-taskbar-win10-tiles-pane',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });

        const topApps = pinnedItems
            .filter(item => item.type === 'app')
            .map(item => item.app);
        const folders = pinnedItems.filter(item => item.type === 'folder');

        if (topApps.length === 0 && folders.length === 0) {
            container.add_child(new St.Label({
                style_class: 'simple-taskbar-windows-start-empty-pinned',
                text: _('Right-click any app to pin it to Start'),
                x_align: Clutter.ActorAlign.CENTER,
            }));
            return container;
        }

        if (topApps.length > 0) {
            container.add_child(this._createGroupSection({
                title: _('Pinned'),
                apps: topApps,
                folderId: null,
            }));
        }

        for (const folder of folders) {
            container.add_child(this._createGroupSection({
                title: folder.name,
                apps: folder.apps,
                folderId: folder.id,
            }));
        }

        return container;
    }

    destroy() {
        this._syncButtonClasses = null;
        this._openFolderApps = null;
        this._launchApp = null;
        this._createRunningIndicator = null;
        this._pinnedDragController = null;
        this._contextMenuController = null;
        this._tooltipController = null;
        this._navigationController = null;
        this._pinnedModel = null;
        this._settings = null;
    }

    _createGroupSection({title, apps, folderId}) {
        const section = new St.BoxLayout({
            style_class: 'simple-taskbar-win10-tile-group',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });

        if (folderId) {
            const headerButton = new St.Button({
                style_class: 'simple-taskbar-win10-group-header-button',
                button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO,
                reactive: true,
                can_focus: true,
                track_hover: true,
                x_align: Clutter.ActorAlign.START,
                accessible_name: title,
                child: new St.Label({
                    style_class: 'simple-taskbar-win10-group-header',
                    text: title,
                    y_align: Clutter.ActorAlign.CENTER,
                }),
            });
            this._navigationController.enable(headerButton);
            this._contextMenuController.addFolderHandler(headerButton, folderId);
            headerButton.connect('clicked', (_button, clickedButton) => {
                if (clickedButton === Clutter.BUTTON_MIDDLE)
                    this._openFolderApps(folderId, headerButton);
                else
                    this._contextMenuController.openFolder(headerButton, folderId);
            });
            this._syncButtonClasses(headerButton);
            section.add_child(headerButton);
        } else {
            section.add_child(new St.Label({
                style_class: 'simple-taskbar-win10-group-header',
                text: title,
                x_align: Clutter.ActorAlign.START,
            }));
        }

        const grid = new St.BoxLayout({
            style_class: 'simple-taskbar-win10-tile-grid',
            orientation: Clutter.Orientation.VERTICAL,
        });
        this._pinnedDragController.attachGrid(grid, folderId);

        const blocks = this._packIntoBlocks(apps);
        let row = this._createTileRow();
        let slotsUsed = 0;

        for (const block of blocks) {
            if (slotsUsed + block.slots > ROW_SLOT_CAPACITY && slotsUsed > 0) {
                grid.add_child(row);
                row = this._createTileRow();
                slotsUsed = 0;
            }
            row.add_child(this._buildBlockActor(block, grid, folderId));
            slotsUsed += block.slots;
        }
        if (row.get_n_children() > 0)
            grid.add_child(row);

        section.add_child(grid);
        return section;
    }

    _createTileRow() {
        return new St.BoxLayout({
            style_class: 'simple-taskbar-win10-tile-row',
            x_align: Clutter.ActorAlign.START,
        });
    }

    _packIntoBlocks(apps) {
        const blocks = [];
        let smallBuffer = [];

        const flushSmall = () => {
            if (smallBuffer.length === 0)
                return;
            blocks.push({type: 'small-cluster', apps: smallBuffer, slots: 1});
            smallBuffer = [];
        };

        for (const app of apps) {
            const size = this._pinnedModel.getTileSize(app.get_id());
            if (size === 'small') {
                smallBuffer.push(app);
                if (smallBuffer.length === 4)
                    flushSmall();
            } else {
                flushSmall();
                blocks.push({
                    type: size,
                    app,
                    slots: size === 'wide' || size === 'large' ? 2 : 1,
                });
            }
        }
        flushSmall();
        return blocks;
    }

    _buildBlockActor(block, grid, folderId) {
        if (block.type === 'small-cluster') {
            const cluster = new St.BoxLayout({
                style_class: 'simple-taskbar-win10-small-cluster',
                orientation: Clutter.Orientation.VERTICAL,
                width: MEDIUM_TILE_SIZE,
                height: MEDIUM_TILE_SIZE,
            });
            for (let rowIndex = 0; rowIndex < 2; rowIndex++) {
                const subRow = new St.BoxLayout({
                    style_class: 'simple-taskbar-win10-small-cluster-row',
                });
                for (let colIndex = 0; colIndex < 2; colIndex++) {
                    const app = block.apps[rowIndex * 2 + colIndex];
                    if (app) {
                        subRow.add_child(
                            this._createMetroTile(app, 'small', grid, folderId)
                        );
                    } else {
                        subRow.add_child(new St.Widget({
                            width: SMALL_TILE_SIZE,
                            height: SMALL_TILE_SIZE,
                        }));
                    }
                }
                cluster.add_child(subRow);
            }
            return cluster;
        }

        return this._createMetroTile(block.app, block.type, grid, folderId);
    }

    _createMetroTile(app, size, grid, folderId) {
        const hideTitle = this._settings.get_boolean(
            'start-menu-hide-pinned-app-titles'
        );
        const isSmall = size === 'small';
        const isWide = size === 'wide';
        const isLarge = size === 'large';
        const width = isSmall
            ? SMALL_TILE_SIZE
            : isWide || isLarge
                ? WIDE_TILE_WIDTH
                : MEDIUM_TILE_SIZE;
        const height = isSmall
            ? SMALL_TILE_SIZE
            : isLarge
                ? LARGE_TILE_SIZE
                : MEDIUM_TILE_SIZE;
        const iconSize = isSmall ? 24 : isLarge ? 48 : 36;
        const icon = app.create_icon_texture(iconSize);
        const iconWithIndicator = this._createRunningIndicator(app, icon);

        let inner;
        let label = null;
        if (isSmall) {
            inner = new St.Bin({
                style_class: 'simple-taskbar-win10-tile-inner-small',
                x_expand: true,
                y_expand: true,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                child: iconWithIndicator,
            });
        } else if (isWide) {
            inner = new St.BoxLayout({
                style_class: 'simple-taskbar-win10-tile-inner-wide',
                x_expand: true,
                y_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            inner.add_child(new St.Bin({
                width: 48,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                child: iconWithIndicator,
            }));
            label = createAppLabel(app.get_name(), WIDE_TILE_WIDTH - 68);
            label.add_style_class_name('simple-taskbar-win10-tile-label-wide');
            label.visible = !hideTitle;
            label.clutter_text.set({
                ellipsize: Pango.EllipsizeMode.END,
                line_wrap: true,
                line_wrap_mode: Pango.WrapMode.WORD_CHAR,
            });
            inner.add_child(label);
        } else {
            inner = new St.BoxLayout({
                style_class: 'simple-taskbar-win10-tile-inner-medium',
                orientation: Clutter.Orientation.VERTICAL,
                x_expand: true,
                y_expand: true,
            });
            inner.add_child(new St.Bin({
                x_expand: true,
                y_expand: true,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
                child: iconWithIndicator,
            }));
            label = createAppLabel(app.get_name(), (isLarge ? LARGE_TILE_SIZE : MEDIUM_TILE_SIZE) - 14);
            label.add_style_class_name('simple-taskbar-win10-tile-label');
            label.visible = !hideTitle;
            label.x_align = Clutter.ActorAlign.START;
            label.clutter_text.set({
                ellipsize: Pango.EllipsizeMode.END,
            });
            inner.add_child(label);
        }

        const button = new St.Button({
            style_class: `simple-taskbar-win10-tile simple-taskbar-win10-tile-${size}`,
            reactive: true,
            can_focus: true,
            track_hover: true,
            width,
            height,
            accessible_name: app.get_name(),
            child: inner,
        });
        this._navigationController.enable(button);
        this._tooltipController.add(
            button,
            app,
            label,
            false,
            isSmall || hideTitle
        );
        button._startMenuAppId = app.get_id();
        button._startMenuAppIcon = icon;
        button.connect('clicked', () => this._launchApp(app, icon));
        this._contextMenuController.addHandler(button, app, folderId);
        if (grid) {
            this._pinnedDragController.makeDraggable(
                button,
                icon,
                app,
                grid
            );
        }
        this._syncButtonClasses(button);
        return button;
    }
}

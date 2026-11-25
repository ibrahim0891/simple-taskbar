// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {extensionIsActive} from '../integration/extensionState.js';
import {isWindows10StartMenuStyle} from '../shared/windows10Theme.js';
import {TaskbarAppMenu} from '../taskbar/taskbarAppMenu.js';

const DESKTOP_ICON_EXTENSIONS = [
    'ding@rastersoft.com',
    'gtk4-ding@smedius.gitlab.com',
    'desktopicons-neo@darkdemon',
];

function queryInfoAsync(file, attributes, cancellable = null) {
    return new Promise((resolve, reject) => {
        file.query_info_async(
            attributes,
            Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_DEFAULT,
            cancellable,
            (source, result) => {
                try {
                    resolve(source.query_info_finish(result));
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

function copyFileAsync(source, destination) {
    return new Promise((resolve, reject) => {
        source.copy_async(
            destination,
            Gio.FileCopyFlags.OVERWRITE,
            GLib.PRIORITY_DEFAULT,
            null,
            null,
            (file, result) => {
                try {
                    resolve(file.copy_finish(result));
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

function deleteFileAsync(file) {
    return new Promise((resolve, reject) => {
        file.delete_async(
            GLib.PRIORITY_DEFAULT,
            null,
            (source, result) => {
                try {
                    resolve(source.delete_finish(result));
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

function setFileAttributesAsync(file, info) {
    return new Promise((resolve, reject) => {
        file.set_attributes_async(
            info,
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            GLib.PRIORITY_DEFAULT,
            null,
            (source, result) => {
                try {
                    resolve(source.set_attributes_finish(result));
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

export class StartMenuAppMenu extends TaskbarAppMenu {
    constructor(sourceActor, side, settings, params) {
        super(sourceActor, side, {
            favoritesSection: true,
            isDock: settings.isDock,
            showSingleWindows: true,
            closeApp: params.closeApp,
            getInterestingWindows: params.getInterestingWindows,
        });

        this._settings = settings;
        this._onStartPinsChanged = params.onStartPinsChanged;
        this._onAppAction = params.onAppAction;
        this._folderId = params.folderId ?? null;
        this._pinnedModel = params.pinnedModel;
        this._connectedActionItems = new WeakSet();
        this._shortcutQueryCancellable = null;

        this._toggleStartItem = new PopupMenu.PopupMenuItem('');
        this._toggleStartItem.connect('activate', () =>
            this._toggleStartFavorite());
        this.addMenuItem(this._toggleStartItem, 8);

        this._moveOutOfFolderItem = null;
        if (this._folderId) {
            this._moveOutOfFolderItem = new PopupMenu.PopupMenuItem(
                _('Move out of folder')
            );
            this._moveOutOfFolderItem.connect('activate', () =>
                this._moveOutOfFolder());
            this.addMenuItem(this._moveOutOfFolderItem, 9);
        }

        this._tileSizeSubmenu = new PopupMenu.PopupSubMenuMenuItem(
            _('Resize tile')
        );
        this._tileSizeItems = new Map();
        for (const [size, label] of [
            ['small', _('Small')],
            ['medium', _('Medium')],
            ['wide', _('Wide')],
            ['large', _('Large')],
        ]) {
            const item = new PopupMenu.PopupMenuItem(label);
            item.connect('activate', () => this._setTileSize(size));
            this._tileSizeSubmenu.menu.addMenuItem(item);
            this._tileSizeItems.set(size, item);
        }
        this.addMenuItem(this._tileSizeSubmenu, this._folderId ? 10 : 9);

        this._toggleTileLabelsItem = new PopupMenu.PopupMenuItem('');
        this._toggleTileLabelsItem.connect('activate', () => {
            const hidden = this._settings.get_boolean(
                'start-menu-hide-pinned-app-titles'
            );
            this._settings.set_boolean(
                'start-menu-hide-pinned-app-titles',
                !hidden
            );
        });
        this.addMenuItem(this._toggleTileLabelsItem, this._folderId ? 11 : 10);

        this._desktopShortcutItem = new PopupMenu.PopupMenuItem(
            _('Create Desktop Shortcut')
        );
        this._desktopShortcutItem.connect('activate', () => {
            void this._toggleDesktopShortcut();
        });
        this.addMenuItem(this._desktopShortcutItem, this._folderId ? 12 : 11);

        this._connectAppAction(this._newWindowItem);
        this._connectAppAction(this._onGpuMenuItem);
        this._connectAppAction(this._detailsItem);
        this._connectAppAction(this._quitItem);
    }

    setApp(app) {
        super.setApp(app);
        for (const actor of this._actionSection.box.get_children())
            this._connectAppAction(actor._delegate);

        this._updateStartFavoriteItem();
        void this._updateDesktopShortcutItem();
    }

    open(animate) {
        this._updateStartFavoriteItem();
        void this._updateDesktopShortcutItem();
        super.open(animate);
    }

    destroy() {
        this._shortcutQueryCancellable?.cancel();
        this._shortcutQueryCancellable = null;
        this._toggleStartItem = null;
        this._moveOutOfFolderItem = null;
        this._tileSizeSubmenu = null;
        this._tileSizeItems?.clear();
        this._tileSizeItems = null;
        this._toggleTileLabelsItem = null;
        this._desktopShortcutItem = null;
        this._pinnedModel = null;
        this._folderId = null;
        this._settings = null;
        this._onStartPinsChanged = null;
        this._onAppAction = null;
        this._connectedActionItems = null;
        super.destroy();
    }

    _updateWindowsSection() {
        super._updateWindowsSection();
        if (!this._connectedActionItems)
            return;

        for (const actor of this._windowSection.box.get_children())
            this._connectAppAction(actor._delegate);
    }

    _connectAppAction(item) {
        if (!item || this._connectedActionItems.has(item))
            return;

        this._connectedActionItems.add(item);
        item.connect('activate', () => this._onAppAction());
    }

    _toggleStartFavorite() {
        if (!this._app)
            return;

        const appId = this._app.get_id();
        const wasPinned = this._pinnedModel.isPinned(appId);
        let remainingAppId = null;
        if (this._folderId) {
            const folder = this._pinnedModel.getFolder(this._folderId);
            if (folder.appIds.length === 2)
                remainingAppId = folder.appIds.find(id => id !== appId);
        }
        const changed = wasPinned
            ? this._pinnedModel.unpinApp(appId)
            : this._pinnedModel.pinApp(appId);
        if (changed) {
            this._onStartPinsChanged({
                type: wasPinned ? 'unpin' : 'pin',
                appId,
                folderId: this._folderId,
                folderCollapsed: Boolean(remainingAppId),
            });
        }
    }

    _updateStartFavoriteItem() {
        if (!this._toggleStartItem)
            return;

        const appId = this._app?.get_id();
        this._toggleStartItem.visible = Boolean(appId);
        if (!appId)
            return;

        const isPinned = this._pinnedModel.isPinned(appId);
        this._toggleStartItem.label.text = isPinned
            ? _('Unpin from Start')
            : _('Pin to Start');
        this._updateTileSizeSubmenu(appId, isPinned);
    }

    _updateTileSizeSubmenu(appId, isPinned) {
        if (!this._tileSizeSubmenu || !this._tileSizeItems)
            return;

        const win10Style = isWindows10StartMenuStyle(this._settings);
        const visible = Boolean(appId && isPinned && win10Style);
        this._tileSizeSubmenu.visible = visible;
        if (this._toggleTileLabelsItem) {
            this._toggleTileLabelsItem.visible = visible;
            if (visible) {
                const hidden = this._settings.get_boolean(
                    'start-menu-hide-pinned-app-titles'
                );
                this._toggleTileLabelsItem.label.text = hidden
                    ? _('Show tile labels')
                    : _('Hide tile labels');
            }
        }
        if (!visible)
            return;

        const currentSize = this._pinnedModel.getTileSize(appId);
        for (const [size, item] of this._tileSizeItems.entries()) {
            item.setOrnament(size === currentSize
                ? PopupMenu.Ornament.DOT
                : PopupMenu.Ornament.NONE);
        }
    }

    _setTileSize(size) {
        if (!this._app)
            return;

        const appId = this._app.get_id();
        if (this._pinnedModel.setTileSize(appId, size)) {
            this._onStartPinsChanged({
                type: 'tile-size',
                appId,
                folderId: this._folderId,
            });
        }
    }

    _moveOutOfFolder() {
        if (!this._app || !this._folderId)
            return;

        const appId = this._app.get_id();
        const folder = this._pinnedModel.getFolder(this._folderId);
        const remainingAppId = folder.appIds.length === 2
            ? folder.appIds.find(id => id !== appId)
            : null;
        if (this._pinnedModel.moveAppOutOfFolder(appId, this._folderId)) {
            this._onStartPinsChanged({
                type: 'move-out',
                appId,
                folderId: this._folderId,
                folderCollapsed: Boolean(remainingAppId),
            });
        }
    }

    _desktopShortcutFiles() {
        const desktopPath = GLib.get_user_special_dir(
            GLib.UserDirectory.DIRECTORY_DESKTOP
        );
        const sourcePath = this._app?.get_app_info()?.get_filename();
        if (!desktopPath || !sourcePath)
            return null;

        const source = Gio.File.new_for_path(sourcePath);
        const destination = Gio.File.new_for_path(GLib.build_filenamev([
            desktopPath,
            source.get_basename(),
        ]));
        return {source, destination};
    }

    _desktopIconsActive() {
        return DESKTOP_ICON_EXTENSIONS.some(extensionIsActive);
    }

    async _fileExists(file, cancellable = null) {
        try {
            await queryInfoAsync(
                file,
                Gio.FILE_ATTRIBUTE_STANDARD_TYPE,
                cancellable
            );
            return true;
        } catch (error) {
            if (error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                return false;
            throw error;
        }
    }

    async _updateDesktopShortcutItem() {
        const item = this._desktopShortcutItem;
        const files = this._desktopShortcutFiles();
        const visible = Boolean(files && this._desktopIconsActive());
        if (!item)
            return;

        item.visible = visible;
        if (!visible)
            return;

        this._shortcutQueryCancellable?.cancel();
        const cancellable = new Gio.Cancellable();
        this._shortcutQueryCancellable = cancellable;
        try {
            const exists = await this._fileExists(
                files.destination,
                cancellable
            );
            if (cancellable.is_cancelled() ||
                this._shortcutQueryCancellable !== cancellable)
                return;

            item.label.text = exists
                ? _('Delete Desktop Shortcut')
                : _('Create Desktop Shortcut');
        } catch (error) {
            if (!error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                console.error(`Failed to inspect desktop shortcut: ${error}`);
        } finally {
            if (this._shortcutQueryCancellable === cancellable)
                this._shortcutQueryCancellable = null;
        }
    }

    async _toggleDesktopShortcut() {
        const files = this._desktopShortcutFiles();
        if (!files)
            return;

        try {
            if (await this._fileExists(files.destination)) {
                await deleteFileAsync(files.destination);
                return;
            }

            await copyFileAsync(files.source, files.destination);
            const modeInfo = new Gio.FileInfo();
            modeInfo.set_attribute_uint32(
                Gio.FILE_ATTRIBUTE_UNIX_MODE,
                0o0755
            );
            await setFileAttributesAsync(files.destination, modeInfo);

            const trustInfo = new Gio.FileInfo();
            trustInfo.set_attribute_string('metadata::trusted', 'true');
            try {
                await setFileAttributesAsync(files.destination, trustInfo);
            } catch (error) {
                console.warn(
                    `Failed to mark desktop shortcut trusted: ${error}`
                );
            }
        } catch (error) {
            console.error(`Failed to update desktop shortcut: ${error}`);
        }
    }
}

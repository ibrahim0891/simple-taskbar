// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

const SETTINGS_ROUTES = Object.freeze([
    {schema: 'dock', prefix: 'dock-', keys: ['active-dock-axis', 'blur-my-shell-dock-mode']},
    {schema: 'default-panel', prefix: 'default-panel-', keys: []},
]);

function moveLegacyValues(legacySettings, routedSettings) {
    for (const key of legacySettings.settings_schema.list_keys()) {
        const value = legacySettings.get_user_value(key);
        if (!value)
            continue;

        if (routedSettings.get_user_value(key) === null)
            routedSettings.set_value(key, value);
        legacySettings.reset(key);
    }
}

export function createRoutedSettings(mainSettings, legacySettings, options = {}) {
    const routes = SETTINGS_ROUTES.map(route => ({
        ...route,
        settings: mainSettings.get_child(route.schema),
    }));
    const routedSettings = new RoutedSettings(mainSettings, routes, options);
    moveLegacyValues(legacySettings, routedSettings);
    return routedSettings;
}

class RoutedSettings {
    constructor(mainSettings, routes, {deferSignalsDuringTransition = false} = {}) {
        this.mainSettings = mainSettings;
        this._routes = routes;
        this._allSettings = [mainSettings, ...routes.map(route => route.settings)];
        this._connections = new Map();
        this._nextConnectionId = 1;
        this._deferDuringTransition = deferSignalsDuringTransition;
        this._transitionActive = deferSignalsDuringTransition &&
            mainSettings.get_boolean('panel-profile-transition');
        this._suppressedChange = false;
        this._onTransitionEnd = null;
        this._transitionSignalId = deferSignalsDuringTransition
            ? mainSettings.connect('changed::panel-profile-transition', () => {
                const active = mainSettings.get_boolean('panel-profile-transition');
                if (active) {
                    this._transitionActive = true;
                    return;
                }

                const hadSuppressed = this._suppressedChange;
                this._transitionActive = false;
                this._suppressedChange = false;
                if (hadSuppressed)
                    this._onTransitionEnd?.();
            })
            : 0;
        this.settings_schema = {
            list_keys: () => this._allSettings.flatMap(settings =>
                settings.settings_schema.list_keys()),
            has_key: key => this._target(key).settings_schema.has_key(key),
            get_key: key => this._target(key).settings_schema.get_key(key),
        };
    }

    setTransitionEndHandler(handler) {
        this._onTransitionEnd = handler;
    }

    destroy() {
        if (this._transitionSignalId) {
            this.mainSettings.disconnect(this._transitionSignalId);
            this._transitionSignalId = 0;
        }
        this._onTransitionEnd = null;
        this._suppressedChange = false;
        this._transitionActive = false;
    }

    _wrapSignalHandler(signal, handler) {
        if (!this._deferDuringTransition ||
            !signal.startsWith('changed::') ||
            signal === 'changed::panel-profile-transition')
            return handler;

        return (...args) => {
            if (this._transitionActive) {
                this._suppressedChange = true;
                return;
            }
            return handler(...args);
        };
    }

    get schema_id() {
        return this.mainSettings.schema_id;
    }

    _target(key) {
        const route = this._routes.find(candidate =>
            key.startsWith(candidate.prefix) || candidate.keys.includes(key));
        return route ? route.settings : this.mainSettings;
    }

    _signalTargets(signal) {
        return signal.startsWith('changed::')
            ? [this._target(signal.slice('changed::'.length))]
            : this._allSettings;
    }

    get_boolean(key) {
        return this._target(key).get_boolean(key);
    }

    get_string(key) {
        return this._target(key).get_string(key);
    }

    get_int(key) {
        return this._target(key).get_int(key);
    }

    get_strv(key) {
        return this._target(key).get_strv(key);
    }

    get_value(key) {
        return this._target(key).get_value(key);
    }

    get_default_value(key) {
        return this._target(key).get_default_value(key);
    }

    get_user_value(key) {
        return this._target(key).get_user_value(key);
    }

    set_boolean(key, value) {
        return this._target(key).set_boolean(key, value);
    }

    set_string(key, value) {
        return this._target(key).set_string(key, value);
    }

    set_int(key, value) {
        return this._target(key).set_int(key, value);
    }

    set_strv(key, value) {
        return this._target(key).set_strv(key, value);
    }

    set_value(key, value) {
        return this._target(key).set_value(key, value);
    }

    is_writable(key) {
        return this._target(key).is_writable(key);
    }

    reset(key) {
        this._target(key).reset(key);
    }

    bind(key, object, property, flags) {
        this._target(key).bind(key, object, property, flags);
    }

    delay() {
        for (const settings of this._allSettings)
            settings.delay();
    }

    apply() {
        for (const settings of this._allSettings)
            settings.apply();
    }

    connect(signal, handler) {
        const id = this._nextConnectionId++;
        const wrapped = this._wrapSignalHandler(signal, handler);
        this._connections.set(id, this._signalTargets(signal).map(settings =>
            [settings, settings.connect(signal, wrapped)]));
        return id;
    }

    disconnect(id) {
        for (const [settings, handlerId] of this._connections.get(id))
            settings.disconnect(handlerId);
        this._connections.delete(id);
    }

    connectObject(...args) {
        const owner = args.pop();
        for (let index = 0; index < args.length; index += 2) {
            const signal = args[index];
            const handler = this._wrapSignalHandler(signal, args[index + 1]);
            for (const settings of this._signalTargets(signal))
                settings.connectObject(signal, handler, owner);
        }
    }

    disconnectObject(owner) {
        for (const settings of this._allSettings)
            settings.disconnectObject(owner);
    }
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 sultech

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

const SUGGEST_DELAY_MS = 200;
const MAX_SUGGESTIONS = 8;
const SUGGEST_ENDPOINT = 'https://suggestqueries.google.com/complete/search';
const INSTANT_ANSWER_ENDPOINT = 'https://api.duckduckgo.com/';

export function googleSearchUrl(query) {
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function openGoogleSearch(query) {
    const trimmed = query.trim();
    if (!trimmed)
        return;
    Gio.AppInfo.launch_default_for_uri(googleSearchUrl(trimmed), null);
}

export class GoogleWebSearch {
    constructor() {
        this._session = new Soup.Session({timeout: 5});
        this._cancellable = null;
        this._timeoutId = 0;
        this._generation = 0;
    }

    search(query, onResults) {
        this.cancel();
        const trimmed = query.trim();
        if (!trimmed) {
            onResults([], false);
            return;
        }

        const generation = this._generation;
        const cancellable = new Gio.Cancellable();
        this._cancellable = cancellable;
        onResults([], true);

        this._timeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            SUGGEST_DELAY_MS,
            () => {
                this._timeoutId = 0;
                void this._fetchSuggestions(
                    trimmed,
                    generation,
                    cancellable,
                    onResults
                );
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    cancel() {
        this._generation += 1;
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = 0;
        }
        this._cancellable?.cancel();
        this._cancellable = null;
    }

    destroy() {
        this.cancel();
        this._session?.abort();
        this._session = null;
    }

    async _fetchSuggestions(query, generation, cancellable, onResults) {
        if (!this._session || generation !== this._generation)
            return;

        const suggestUri = `${SUGGEST_ENDPOINT}?client=firefox&q=${encodeURIComponent(query)}`;
        const answerUri = `${INSTANT_ANSWER_ENDPOINT}?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

        const [suggestions, instantAnswer] = await Promise.all([
            this._readJson(suggestUri, cancellable)
                .then(parsed => {
                    const raw = Array.isArray(parsed?.[1]) ? parsed[1] : [];
                    return raw
                        .filter(item => typeof item === 'string' && item.trim())
                        .slice(0, MAX_SUGGESTIONS);
                })
                .catch(() => []),
            this._readJson(answerUri, cancellable)
                .then(parsed => {
                    const text = parsed?.AbstractText?.trim() ||
                        parsed?.Answer?.trim() ||
                        '';
                    if (!text)
                        return null;
                    return {
                        heading: parsed?.Heading?.trim() || query,
                        text,
                        url: parsed?.AbstractURL?.trim() || googleSearchUrl(query),
                    };
                })
                .catch(() => null),
        ]);

        if (generation === this._generation && !cancellable.is_cancelled())
            onResults(suggestions, false, instantAnswer);
    }

    async _readJson(uri, cancellable) {
        const message = Soup.Message.new('GET', uri);
        const bytes = await new Promise((resolve, reject) => {
            this._session.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                cancellable,
                (session, result) => {
                    try {
                        resolve(session.send_and_read_finish(result));
                    } catch (error) {
                        reject(error);
                    }
                }
            );
        });
        const text = new TextDecoder('utf-8').decode(bytes.get_data());
        return JSON.parse(text);
    }
}

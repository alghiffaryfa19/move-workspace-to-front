import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class AutoReorderWorkspace extends Extension {
    enable() {
        this._wm = global.workspace_manager;
        this._display = global.display;
        this._mutterSettings = this.getSettings('org.gnome.mutter');

        this._reordering = false;

        this._moveTimeoutId = 0;
        this._lateMoveTimeoutId = 0;
        this._overviewHiddenId = 0;
        this._windowCreatedDelayId = 0;

        this._activeWorkspaceSignal = this._wm.connect(
            'active-workspace-changed',
            () => {
                this._scheduleMoveToFront();
            }
        );

        /*
         * Kalau user masuk ke workspace dynamic kosong,
         * lalu baru membuka window di sana,
         * active-workspace-changed tidak terpanggil lagi.
         *
         * Maka kita dengarkan event window-created.
         */
        this._windowCreatedSignal = this._display.connect(
            'window-created',
            (_display, win) => {
                if (this._windowCreatedDelayId) {
                    GLib.Source.remove(this._windowCreatedDelayId);
                    this._windowCreatedDelayId = 0;
                }

                this._windowCreatedDelayId = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT,
                    300,
                    () => {
                        this._windowCreatedDelayId = 0;

                        if (!this._wm)
                            return GLib.SOURCE_REMOVE;

                        const activeWs = this._wm.get_active_workspace();

                        try {
                            if (
                                win &&
                                typeof win.get_workspace === 'function' &&
                                win.get_workspace() === activeWs
                            ) {
                                this._scheduleMoveToFront();
                            }
                        } catch (e) {
                            logError(e, 'AutoReorderWorkspace: window-created check failed');
                        }

                        return GLib.SOURCE_REMOVE;
                    }
                );
            }
        );
    }

    disable() {
        if (this._activeWorkspaceSignal) {
            this._wm.disconnect(this._activeWorkspaceSignal);
            this._activeWorkspaceSignal = null;
        }

        if (this._windowCreatedSignal) {
            this._display.disconnect(this._windowCreatedSignal);
            this._windowCreatedSignal = null;
        }

        if (this._overviewHiddenId) {
            Main.overview.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = 0;
        }

        if (this._moveTimeoutId) {
            GLib.Source.remove(this._moveTimeoutId);
            this._moveTimeoutId = 0;
        }

        if (this._lateMoveTimeoutId) {
            GLib.Source.remove(this._lateMoveTimeoutId);
            this._lateMoveTimeoutId = 0;
        }

        if (this._windowCreatedDelayId) {
            GLib.Source.remove(this._windowCreatedDelayId);
            this._windowCreatedDelayId = 0;
        }

        this._mutterSettings = null;
        this._display = null;
        this._wm = null;
        this._reordering = false;
    }

    _scheduleMoveToFront() {
        if (this._reordering)
            return;

        this._clearMoveTimers();

        const schedule = () => {
            /*
             * Reorder pertama.
             * Ini cukup untuk pindah workspace normal / dari overview.
             */
            this._moveTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                250,
                () => {
                    this._moveTimeoutId = 0;
                    this._moveToFront('early');
                    return GLib.SOURCE_REMOVE;
                }
            );

            /*
             * Reorder kedua.
             * Ini untuk kasus extension gesture 3 jari.
             *
             * Beberapa gesture extension masih punya animasi/state sendiri
             * setelah active-workspace-changed terpanggil.
             */
            this._lateMoveTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                900,
                () => {
                    this._lateMoveTimeoutId = 0;
                    this._moveToFront('late');
                    return GLib.SOURCE_REMOVE;
                }
            );
        };

        /*
         * Kalau pindah dari Overview, tunggu Overview ditutup dulu.
         */
        if (Main.overview.visible) {
            if (this._overviewHiddenId)
                return;

            this._overviewHiddenId = Main.overview.connect('hidden', () => {
                Main.overview.disconnect(this._overviewHiddenId);
                this._overviewHiddenId = 0;

                schedule();
            });

            return;
        }

        schedule();
    }

    _clearMoveTimers() {
        if (this._moveTimeoutId) {
            GLib.Source.remove(this._moveTimeoutId);
            this._moveTimeoutId = 0;
        }

        if (this._lateMoveTimeoutId) {
            GLib.Source.remove(this._lateMoveTimeoutId);
            this._lateMoveTimeoutId = 0;
        }
    }

    _moveToFront(reason = 'manual') {
        if (this._reordering)
            return;

        if (!this._wm)
            return;

        const activeWs = this._wm.get_active_workspace();

        if (!activeWs)
            return;

        const currentIndex = activeWs.index();

        // Sudah paling kiri
        if (currentIndex === 0)
            return;

        // Jangan pindahkan workspace dynamic kosong terakhir
        if (this._isEmptyDynamic(activeWs))
            return;

        try {
            this._reordering = true;

            this._wm.reorder_workspace(activeWs, 0);

            /*
             * Debug log.
             * Bisa dihapus kalau sudah stabil.
             */
            log(
                `AutoReorderWorkspace: ${reason}, moved workspace from ${currentIndex} to ${activeWs.index()}`
            );
        } catch (e) {
            logError(e, 'AutoReorderWorkspace: reorder failed');
        } finally {
            this._reordering = false;
        }
    }

    _isEmptyDynamic(workspace) {
        if (!this._mutterSettings || !this._wm)
            return false;

        const isDynamic = this._mutterSettings.get_boolean('dynamic-workspaces');

        if (!isDynamic)
            return false;

        const lastIndex = this._wm.get_n_workspaces() - 1;

        if (workspace.index() !== lastIndex)
            return false;

        /*
         * list_windows() bisa berisi window yang tampil di semua workspace.
         * Window seperti itu jangan dianggap sebagai isi workspace.
         */
        const realWindows = workspace.list_windows().filter(win => {
            if (!win)
                return false;

            if (this._isWindowOnAllWorkspaces(win))
                return false;

            return true;
        });

        return realWindows.length === 0;
    }

    _isWindowOnAllWorkspaces(win) {
        if (!win)
            return false;

        if (typeof win.is_on_all_workspaces === 'function')
            return win.is_on_all_workspaces();

        return !!win.on_all_workspaces;
    }
}

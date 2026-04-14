import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class AutoReorderWorkspace extends Extension {
    enable() {
        this._wm = global.workspace_manager;

        this._signal = this._wm.connect('active-workspace-changed', () => {
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
                // 🚫 Jika masih di overview → jangan reorder
                if (Main.overview.visible)
                    return GLib.SOURCE_REMOVE;

                this._moveToFront();
                return GLib.SOURCE_REMOVE;
            });
        });

        this._reordering = false;
    }

    disable() {
        if (this._signal) {
            this._wm.disconnect(this._signal);
            this._signal = null;
        }
    }

    _moveToFront() {
        if (this._reordering)
            return;

        const activeWs = this._wm.get_active_workspace();
        const currentIndex = activeWs.index();

        if (currentIndex === 0)
            return;

        if (this._isEmptyDynamic(activeWs))
            return;

        try {
            this._reordering = true;
            this._wm.reorder_workspace(activeWs, 0);
        } catch (e) {
            log(`Reorder failed: ${e}`);
        } finally {
            this._reordering = false;
        }
    }

    _isEmptyDynamic(workspace) {
        // Cek dynamic workspace aktif
        const settings = this.getSettings('org.gnome.mutter');
        const isDynamic = settings.get_boolean('dynamic-workspaces');

        if (!isDynamic)
            return false;

        const lastIndex = this._wm.get_n_workspaces() - 1;

        return workspace.index() === lastIndex &&
            workspace.list_windows().length === 0;
    }
}
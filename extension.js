import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class AutoReorderWorkspace extends Extension {
    enable() {
        this._wm = global.workspace_manager;

        this._signal = this._wm.connect('active-workspace-changed', () => {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._moveToFront();
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    disable() {
        if (this._signal) {
            this._wm.disconnect(this._signal);
            this._signal = null;
        }
    }

    _moveToFront() {
        const activeWs = this._wm.get_active_workspace();
        const currentIndex = activeWs.index();

        // Sudah di depan → skip
        if (currentIndex === 0)
            return;

        // Hindari workspace kosong terakhir (dynamic workspace GNOME)
        if (this._isEmptyDynamic(activeWs))
            return;

        try {
            // 🔥 REORDER ASLI
            this._wm.reorder_workspace(activeWs, 0);
        } catch (e) {
            log(`Reorder failed: ${e}`);
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
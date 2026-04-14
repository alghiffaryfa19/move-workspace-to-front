import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';

let signalId = null;

function moveWorkspaceToFront(activeIndex) {
    const wm = global.workspace_manager;
    const n = wm.n_workspaces;

    if (activeIndex === 0 || activeIndex >= n)
        return;

    let activeWs = wm.get_workspace_by_index(activeIndex);
    let firstWs = wm.get_workspace_by_index(0);

    // Ambil semua window di workspace aktif
    let windows = global.get_window_actors()
        .map(actor => actor.meta_window)
        .filter(w => w.get_workspace() === activeWs);

    // Pindahkan semua window ke workspace pertama
    windows.forEach(win => {
        win.change_workspace(firstWs);
    });

    // Optional: kosongkan workspace lama
    // (biar terasa seperti "dipindah")
}

export default class Extension {
    enable() {
        const wm = global.workspace_manager;

        signalId = wm.connect('active-workspace-changed', () => {
            let activeIndex = wm.get_active_workspace_index();

            // Delay sedikit biar GNOME selesai transisi
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                moveWorkspaceToFront(activeIndex);
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    disable() {
        if (signalId) {
            global.workspace_manager.disconnect(signalId);
            signalId = null;
        }
    }
}
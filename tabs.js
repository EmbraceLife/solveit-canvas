// Tab strip UI, multi-canvas state management, dirty tracking, save/load
(function () {
    const ICONS = window.DRAWING_ICONS;
    const DC = window.DrawingCanvas;
    const DB = window.DrawingDB;
    const S = window._drawState;

    const tabState = {};  // id -> { meta, canvasJSON, dirty }
    let activeId = null;
    let strip = null;
    let addBtn = null;
    let addWrap = null;
    let untitledCounter = 0;


    const sessionKey = () => 'solveit-drawing-session:' + S.dialogName;
    function saveSession() {
        const openIds = Object.keys(tabState);
        localStorage.setItem(sessionKey(), JSON.stringify({ openIds, activeId }));
    }
    function loadSession() {
        try { return JSON.parse(localStorage.getItem(sessionKey())); } catch { return null; }
    }

    function tabEl(id) { return strip?.querySelector(`[data-tab-id="${id}"]`); }

    function renderTab(id) {
        const te = tabEl(id);
        if (!te) return;
        const t = tabState[id];
        te.querySelector('.tab-name').textContent = t.meta.name + (t.dirty ? ' *' : '');
        te.style.background = id === activeId ? 'white' : '#f0f0f0';
        te.style.borderBottom = id === activeId ? '1px solid white' : '1px solid #ccc';
    }

    function captureActive() {
        if (!activeId || !S.fc) return;
        const t = tabState[activeId];
        if (t) t.canvasJSON = S.fc.toJSON();
    }

    async function loadTab(id) {
        const t = tabState[id];
        if (!S.fc || !t) return;
        // Lazy load from DB if not in memory
        if (t.canvasJSON === null) t.canvasJSON = await DB.loadData(id);
        // Clear undo/redo on tab switch
        S.undoStack.length = 0;
        S.redoStack.length = 0;
        if (t.canvasJSON) {
            await S.fc.loadFromJSON(t.canvasJSON);
            S.fc.renderAll();
        } else {
            S.fc.clear();
            S.fc.backgroundColor = 'white';
            S.fc.renderAll();
        }
    }

    function makeTabEl(id) {
        const t = tabState[id];
        const div = document.createElement('div');
        div.dataset.tabId = id;
        div.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:3px 10px;cursor:pointer;font-size:12px;border:1px solid #ccc;border-radius:4px 4px 0 0;background:#f0f0f0;user-select:none;white-space:nowrap;position:relative;bottom:-1px;max-width:150px';

        const name = document.createElement('span');
        name.className = 'tab-name';
        name.textContent = t.meta.name;
        name.style.cssText = 'overflow:hidden;text-overflow:ellipsis';

        // Double-click to rename
        name.addEventListener('dblclick', e => {
            e.stopPropagation();
            const input = document.createElement('input');
            input.value = t.meta.name;
            input.style.cssText = 'width:80px;font-size:11px;border:1px solid #2563eb;border-radius:2px;padding:0 2px;outline:none';
            let finished = false;
            const finish = () => {
                if (finished) return;
                finished = true;
                const v = input.value.trim() || t.meta.name;
                t.meta.name = v;
                t.dirty = true;
                input.replaceWith(name);
                renderTab(id);
            };
            input.addEventListener('blur', finish);
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); finish(); }
                if (e.key === 'Escape') { input.value = t.meta.name; finish(); }
            });
            name.replaceWith(input);
            input.focus(); input.select();
        });

        const close = document.createElement('span');
        close.textContent = '×';
        close.title = 'Close tab';
        close.style.cssText = 'cursor:pointer;font-size:13px;line-height:1;opacity:0.4';
        close.onmouseenter = () => close.style.opacity = '1';
        close.onmouseleave = () => close.style.opacity = '0.4';
        close.onclick = e => { e.stopPropagation(); window.DrawingTabs.closeTab(id); };

        div.append(name, close);
        div.onclick = () => window.DrawingTabs.switchTab(id);
        return div;
    }

    window.DrawingTabs = {
        async init(dialogName) {
            S.dialogName = dialogName;
            strip = document.createElement('div');
            strip.style.cssText = 'background:#fafafa;padding:4px 10px 0;display:flex;gap:2px;align-items:flex-end;border-top:1px solid #ddd;flex-shrink:0';

            let metas = await DB.getByDialog(dialogName);
            // Seed counter from existing "Untitled" names
            metas.forEach(m => {
                const match = m.name.match(/^Untitled(?: (\d+))?$/);
                if (match) untitledCounter = Math.max(untitledCounter, parseInt(match[1] || '1'));
            });
            if (metas.length === 0) {
                const m = DB.createMeta('Untitled', dialogName);
                await DB.save(m, null);
                untitledCounter = 1;
                metas = [m];
            }
// Restore session or open all
            const session = loadSession();
            const toOpen = session
                ? metas.filter(m => session.openIds.includes(m.id))
                : metas;
            if (toOpen.length === 0) toOpen.push(...metas.slice(0, 1));

            toOpen.forEach(m => {
                tabState[m.id] = { meta: m, canvasJSON: null, dirty: false };
                strip.appendChild(makeTabEl(m.id));
            });

addBtn = document.createElement('div');
            addBtn.textContent = '+';
            addBtn.title = 'New / open canvas';
            addBtn.style.cssText = 'padding:3px 10px;cursor:pointer;font-size:14px;font-weight:bold;color:#666;border:1px solid transparent;border-bottom:none;border-radius:4px 4px 0 0;user-select:none;position:relative;bottom:-1px';
            addBtn.onmouseenter = () => addBtn.style.background = '#e5e7eb';
            addBtn.onmouseleave = () => addBtn.style.background = 'transparent';

            // + dropdown menu
            const addMenu = document.createElement('div');
            addMenu.style.cssText = 'display:none;position:absolute;bottom:100%;left:0;background:white;border:1px solid #ccc;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:10;min-width:180px;margin-bottom:4px;max-height:350px;overflow-y:auto';

            function menuItem(text, opts = {}) {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:5px 12px;cursor:pointer;font-size:12px;white-space:nowrap' + (opts.bold ? ';font-weight:600' : '') + (opts.italic ? ';font-style:italic;color:#999' : '');
                const label = document.createElement('span');
                if (text.includes('<')) label.innerHTML = text; else label.textContent = text;
                label.style.cssText = 'overflow:hidden;text-overflow:ellipsis';
                row.appendChild(label);
                if (opts.thumbnail) {
                    const img = document.createElement('img');
                    img.src = opts.thumbnail;
                    img.style.cssText = 'width:28px;height:20px;object-fit:contain;border:1px solid #ddd;border-radius:2px;margin-left:8px;flex-shrink:0';
                    row.appendChild(img);
                }
                if (opts.onDelete) {
                    const trash = document.createElement('span');
                    trash.textContent = '🗑';
                    trash.title = 'Delete permanently';
                    trash.style.cssText = 'margin-left:8px;font-size:11px;opacity:0.4;cursor:pointer;flex-shrink:0';
                    trash.onmouseenter = () => trash.style.opacity = '1';
                    trash.onmouseleave = () => trash.style.opacity = '0.4';
                    trash.onclick = e => { e.stopPropagation(); opts.onDelete(row); };
                    row.appendChild(trash);
                }
                row.onmouseenter = () => row.style.background = '#f0f0f0';
                row.onmouseleave = () => row.style.background = 'white';
                if (opts.onClick) row.onclick = () => { addMenu.style.display = 'none'; opts.onClick(); };
                return row;
            }

            function menuSep() {
                const s = document.createElement('div');
                s.style.cssText = 'border-top:1px solid #eee;margin:2px 0';
                return s;
            }

            async function rebuildMenu() {
                addMenu.innerHTML = '';
                // New blank
                addMenu.appendChild(menuItem('New blank', { bold: true, onClick: () => window.DrawingTabs.newTab() }));

                // Closed canvases for this dialog
                const allDialog = await DB.getByDialog(S.dialogName);
                const closed = allDialog.filter(m => !tabState[m.id]);
                if (closed.length > 0) {
                    addMenu.appendChild(menuSep());
                    const header = document.createElement('div');
                    header.textContent = 'Open';
                    header.style.cssText = 'padding:4px 12px 2px;font-size:10px;text-transform:uppercase;color:#999;font-weight:600';
                    addMenu.appendChild(header);
                    closed.forEach(m => {
                        addMenu.appendChild(menuItem(m.name, {
                            thumbnail: m.thumbnail,
                            onClick: () => window.DrawingTabs.openTab(m),
                            onDelete: async (row) => {
                                if (!confirm(`Permanently delete "${m.name}"?`)) return;
                                await DB.delete(m.id);
                                row.remove();
                            }
                        }));
                    });
                }

                // Import from other dialogs
                const all = await DB.getAll();
                const other = all.filter(m => m.dialogName !== S.dialogName);
                if (other.length > 0) {
                    addMenu.appendChild(menuSep());
                    const header = document.createElement('div');
                    header.textContent = 'Import from other dialogs';
                    header.style.cssText = 'padding:4px 12px 2px;font-size:10px;text-transform:uppercase;color:#999;font-weight:600';
                    addMenu.appendChild(header);
                    // Group by dialog
                    const grouped = {};
                    other.forEach(m => { (grouped[m.dialogName] = grouped[m.dialogName] || []).push(m); });
                    Object.entries(grouped).forEach(([dlg, metas]) => {
                        const dlgHeader = document.createElement('div');
                        dlgHeader.textContent = dlg || '(no dialog)';
                        dlgHeader.style.cssText = 'padding:3px 12px 1px;font-size:10px;color:#666;font-style:italic';
                        addMenu.appendChild(dlgHeader);
                        metas.forEach(m => {
                            addMenu.appendChild(menuItem(ICONS.import + ' ' + m.name, {
                                thumbnail: m.thumbnail,
                                onClick: () => window.DrawingTabs.importCanvas(m),
                            }));
                        });
                    });
                }

            }

            addBtn.onclick = async (e) => {
                e.stopPropagation();
                if (addMenu.style.display !== 'none') { addMenu.style.display = 'none'; return; }
                await rebuildMenu();
                addMenu.style.display = 'block';
            };
            document.addEventListener('click', () => addMenu.style.display = 'none');

            addWrap = document.createElement('div');
            addWrap.style.cssText = 'position:relative';
            addWrap.append(addBtn, addMenu);
            strip.appendChild(addWrap);

activeId = (session?.activeId && tabState[session.activeId]) ? session.activeId : toOpen[0].id;
            Object.keys(tabState).forEach(renderTab);
            return strip;
        },

        async loadActive() {
            if (activeId) await loadTab(activeId);
        },

        async switchTab(id) {
            if (id === activeId || !tabState[id]) return;
            captureActive();
            activeId = id;
            Object.keys(tabState).forEach(renderTab);
            await loadTab(id);
            DC.setMode(S.mode);
            saveSession();
        },

        async newTab(name) {
            if (!name) { untitledCounter++; name = untitledCounter === 1 ? 'Untitled' : 'Untitled ' + untitledCounter; }
            const m = DB.createMeta(name, S.dialogName);
            await DB.save(m, null);
            tabState[m.id] = { meta: m, canvasJSON: null, dirty: false };
            strip.insertBefore(makeTabEl(m.id), addWrap);
            await window.DrawingTabs.switchTab(m.id);
            saveSession();
        },

async closeTab(id) {
            const t = tabState[id];
            if (!t) return;
            if (t.dirty && !confirm(`Close "${t.meta.name}" with unsaved changes?`)) return;

            const ids = Object.keys(tabState);
            if (id === activeId) {
                if (ids.length <= 1) {
                    // Last tab — just close it and create fresh blank
                    delete tabState[id];
                    tabEl(id)?.remove();
                    activeId = null;
                    await window.DrawingTabs.newTab();
                    return;
                }
                const idx = ids.indexOf(id);
                await window.DrawingTabs.switchTab(ids[idx === 0 ? 1 : idx - 1]);
            }

            delete tabState[id];
            tabEl(id)?.remove();
            saveSession();
        },

        async openTab(meta) {
            // Re-open a closed canvas from DB
            if (tabState[meta.id]) { await window.DrawingTabs.switchTab(meta.id); return; }
            tabState[meta.id] = { meta, canvasJSON: null, dirty: false };
            strip.insertBefore(makeTabEl(meta.id), addWrap);
            await window.DrawingTabs.switchTab(meta.id);
        },

        async importCanvas(sourceMeta) {
            // Copy canvas from another dialog into current dialog
            const canvasJSON = await DB.loadData(sourceMeta.id);
            const m = DB.createMeta(sourceMeta.name + ' (imported)', S.dialogName);
            m.thumbnail = sourceMeta.thumbnail;
            await DB.save(m, canvasJSON);
            tabState[m.id] = { meta: m, canvasJSON, dirty: false };
            strip.insertBefore(makeTabEl(m.id), addWrap);
            await window.DrawingTabs.switchTab(m.id);
        },

        markDirty() {
            if (!activeId) return;
            const t = tabState[activeId];
            if (t && !t.dirty) { t.dirty = true; renderTab(activeId); }
        },

        async save() {
            if (!activeId || !S.fc) return;
            const t = tabState[activeId];
            if (!t) return;
            const canvasJSON = S.fc.toJSON();
            t.canvasJSON = canvasJSON;
            t.meta.thumbnail = await DC.exportThumbnail();
            await DB.save(t.meta, canvasJSON);
            t.dirty = false;
            renderTab(activeId);
        },

        isAnyDirty() { return Object.values(tabState).some(t => t.dirty); },
        getActiveId() { return activeId; },
    };

    // Warn on page unload if any tab has unsaved changes
    window.addEventListener('beforeunload', e => {
        if (window.DrawingTabs?.isAnyDirty()) { e.preventDefault(); e.returnValue = ''; }
    });
})();

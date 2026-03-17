// IndexedDB storage for multi-tab canvas persistence
// Two stores: 'meta' for lightweight metadata, 'data' for heavy canvasJSON (lazy loaded)
(function () {
    const DB_NAME = 'solveit-drawing';
    const DB_VERSION = 1;
    const META = 'meta';
    const DATA = 'data';

    let dbPromise = null;

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                for (const name of db.objectStoreNames) db.deleteObjectStore(name);
                const meta = db.createObjectStore(META, { keyPath: 'id' });
                meta.createIndex('dialogName', 'dialogName', { unique: false });
                meta.createIndex('updatedAt', 'updatedAt');
                db.createObjectStore(DATA, { keyPath: 'id' });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return dbPromise;
    }

    window.DrawingDB = {
        /** Save metadata + optionally canvas data in a single transaction */
        async save(meta, canvasJSON) {
            const db = await openDB();
            meta.updatedAt = Date.now();
            if (!meta.createdAt) meta.createdAt = meta.updatedAt;
            return new Promise((resolve, reject) => {
                const t = db.transaction([META, DATA], 'readwrite');
                t.objectStore(META).put(meta);
                if (canvasJSON !== undefined) t.objectStore(DATA).put({ id: meta.id, canvasJSON });
                t.oncomplete = () => resolve();
                t.onerror = () => reject(t.error);
            });
        },

        /** Load canvas JSON for a given ID (lazy load) */
        async loadData(id) {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const req = db.transaction(DATA).objectStore(DATA).get(id);
                req.onsuccess = () => resolve(req.result?.canvasJSON || null);
                req.onerror = () => reject(req.error);
            });
        },

        /** Get all metadata for a dialog, sorted by updatedAt desc */
        async getByDialog(dialogName) {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const idx = db.transaction(META).objectStore(META).index('dialogName');
                const req = idx.getAll(dialogName);
                req.onsuccess = () => {
                    const records = req.result || [];
                    records.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                    resolve(records);
                };
                req.onerror = () => reject(req.error);
            });
        },

        /** Get all metadata, sorted by updatedAt desc */
        async getAll() {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const req = db.transaction(META).objectStore(META).getAll();
                req.onsuccess = () => {
                    const records = req.result || [];
                    records.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                    resolve(records);
                };
                req.onerror = () => reject(req.error);
            });
        },

        /** Delete a canvas (both meta + data) */
        async delete(id) {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const t = db.transaction([META, DATA], 'readwrite');
                t.objectStore(META).delete(id);
                t.objectStore(DATA).delete(id);
                t.oncomplete = () => resolve();
                t.onerror = () => reject(t.error);
            });
        },

        /** Get serialized byte size of every canvas data entry — { id: bytes }
         *  Design: cursor walk over DATA store, stringify each canvasJSON to measure real size.
         *  Why stringify? IndexedDB stores structured clones, but JSON.stringify length is the
         *  closest proxy for what the user actually "paid" in storage for embedded data URLs. */
        async getAllDataSizes() {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const sizes = {};
                const req = db.transaction(DATA).objectStore(DATA).openCursor();
                req.onsuccess = e => {
                    const cursor = e.target.result;
                    if (cursor) {
                        sizes[cursor.key] = JSON.stringify(cursor.value?.canvasJSON || '').length;
                        cursor.continue();
                    } else {
                        console.log('[DrawingDB] getAllDataSizes:', Object.keys(sizes).length, 'entries, total', Object.values(sizes).reduce((a, b) => a + b, 0), 'bytes');
                        resolve(sizes);
                    }
                };
                req.onerror = () => reject(req.error);
            });
        },

        /** Bulk-delete all canvases for a dialog — removes both meta and data entries.
         *  Design: single transaction for atomicity — either all delete or none do. */
        async deleteByDialog(dialogName) {
            const metas = await this.getByDialog(dialogName);
            if (metas.length === 0) return 0;
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const t = db.transaction([META, DATA], 'readwrite');
                for (const m of metas) { t.objectStore(META).delete(m.id); t.objectStore(DATA).delete(m.id); }
                t.oncomplete = () => {
                    console.log('[DrawingDB] deleteByDialog:', dialogName, '→ removed', metas.length, 'canvases');
                    resolve(metas.length);
                };
                t.onerror = () => reject(t.error);
            });
        },

        /** Create a new metadata record (does NOT save to DB — caller must call save()) */
        createMeta(name, dialogName) {
            const now = Date.now();
            return {
                id: crypto.randomUUID(),
                name: name || 'Untitled',
                dialogName: dialogName || null,
                thumbnail: null,
                createdAt: now,
                updatedAt: now,
            };
        },
    };
})();

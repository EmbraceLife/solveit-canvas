// IndexedDB storage for multi-tab canvas persistence
// Three stores: 'meta' for lightweight metadata, 'data' for heavy canvasJSON (lazy loaded),
// 'images' for pasted image blobs (referenced from canvas JSON via idb:// URLs)
(function () {
    const DB_NAME = 'solveit-drawing';
    const DB_VERSION = 2;
    const META = 'meta';
    const DATA = 'data';
    const IMAGES = 'images';
    const IDB_PREFIX = 'idb://';

    let dbPromise = null;

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(META)) {
                    const meta = db.createObjectStore(META, { keyPath: 'id' });
                    meta.createIndex('dialogName', 'dialogName', { unique: false });
                    meta.createIndex('updatedAt', 'updatedAt');
                }
                if (!db.objectStoreNames.contains(DATA)) {
                    db.createObjectStore(DATA, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(IMAGES)) {
                    db.createObjectStore(IMAGES, { keyPath: 'id' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return dbPromise;
    }

    window.DrawingDB = {
        IDB_PREFIX,

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

        // --- Image blob store ---

        /** Save an image blob, returns its ID */
        async saveImage(blob) {
            const db = await openDB();
            const id = crypto.randomUUID();
            return new Promise((resolve, reject) => {
                const t = db.transaction(IMAGES, 'readwrite');
                t.objectStore(IMAGES).put({ id, blob, type: blob.type });
                t.oncomplete = () => resolve(id);
                t.onerror = () => reject(t.error);
            });
        },

        /** Load an image blob by ID, returns { blob, type } or null */
        async loadImage(id) {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const req = db.transaction(IMAGES).objectStore(IMAGES).get(id);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
        },

        /** Delete an image by ID */
        async deleteImage(id) {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const t = db.transaction(IMAGES, 'readwrite');
                t.objectStore(IMAGES).delete(id);
                t.oncomplete = () => resolve();
                t.onerror = () => reject(t.error);
            });
        },

        /** Get all image IDs currently in the store */
        async getAllImageIds() {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const req = db.transaction(IMAGES).objectStore(IMAGES).getAllKeys();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            });
        },

        /** Convert a blob to a temporary object URL for fabric to render */
        blobToObjectURL(blob) {
            return URL.createObjectURL(blob);
        },

        /** Resolve all idb:// src references in a canvasJSON to object URLs.
         *  Returns a cleanup function that revokes all created URLs. */
        async resolveImageRefs(canvasJSON) {
            if (!canvasJSON?.objects) return () => {};
            const urlMap = {};  // imageId -> objectURL
            const toResolve = [];

            for (const obj of canvasJSON.objects) {
                const src = obj.src;
                if (src && src.startsWith(IDB_PREFIX)) {
                    const imgId = src.slice(IDB_PREFIX.length);
                    if (!urlMap[imgId]) toResolve.push(imgId);
                }
            }

            // Load all needed images in parallel
            const results = await Promise.all(toResolve.map(id => DrawingDB.loadImage(id)));
            toResolve.forEach((id, i) => {
                if (results[i]?.blob) urlMap[id] = URL.createObjectURL(results[i].blob);
            });

            // Rewrite src fields
            for (const obj of canvasJSON.objects) {
                const src = obj.src;
                if (src && src.startsWith(IDB_PREFIX)) {
                    const imgId = src.slice(IDB_PREFIX.length);
                    if (urlMap[imgId]) obj.src = urlMap[imgId];
                    else console.warn('[DrawingDB] Missing image for', imgId);
                }
            }

            // Return cleanup function
            return () => Object.values(urlMap).forEach(u => URL.revokeObjectURL(u));
        },

        /** Rewrite temporary object URLs back to idb:// refs in canvasJSON.
         *  Uses the urlToIdb map maintained by the canvas module. */
        rewriteToIdbRefs(canvasJSON, urlToIdb) {
            if (!canvasJSON?.objects) return;
            for (const obj of canvasJSON.objects) {
                if (obj.src && urlToIdb.has(obj.src)) {
                    obj.src = IDB_PREFIX + urlToIdb.get(obj.src);
                }
            }
        },
    };
})();

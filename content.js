// Loader — runs in ISOLATED world, injects modules into MAIN world
(async function () {
    const DEBUG = false;
    const log = (...args) => DEBUG && console.log('[Solveit Drawing]', ...args);
    let injected = false;

    log('content script running, url:', location.href);

    const alive = () => !!chrome.runtime?.id;

    function loadScript(path) {
        return new Promise((resolve, reject) => {
            if (!alive()) return reject(new Error('Extension context invalidated'));
            const s = document.createElement('script');
            s.src = chrome.runtime.getURL(path);
            s.onload = () => { s.remove(); resolve(); };
            (document.head || document.documentElement).appendChild(s);
        });
    }

    async function inject() {
        await loadScript('fabric.min.js');
        await loadScript('icons.js');
        await loadScript('db.js');
        await loadScript('canvas.js');
        await loadScript('tabs.js');
        await loadScript('toolbar.js');
        await loadScript('send.js');
        log('all modules injected');
    }

    async function tryInit() {
        if (!document.getElementById('dialog-container')) {
            log('no dialog-container, skipping');
            return;
        }
        if (injected) {
            log('already loaded, re-injecting nav button');
            window.postMessage({ type: 'solveit-drawing-reinit' }, '*');
        } else {
            await inject();
            injected = true;
        }
    }

    await tryInit();
    document.body.addEventListener('htmx:afterSettle', () => {
        if (!alive()) return;
        log('htmx:afterSettle fired');
        tryInit();
    });
})();

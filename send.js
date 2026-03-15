// Send button, overlay assembly, and nav button injection
(function () {
    const ICONS = window.DRAWING_ICONS;
    const DC = window.DrawingCanvas;
    const S = window._drawState;
    const smallBtn = window.DrawingToolbar.smallBtn;

    function post(url, fields) {
        const fd = new FormData();
        for (const [k, v] of Object.entries(fields)) fd.append(k, v);
        return fetch(url, { method: 'POST', body: fd });
    }

    // Anchor state — which message to insert before
    S.anchorId = null;
    S.anchorSelecting = false;

    let sendBtn, updateSendLabel, anchorBtn, anchorLabel;

    window.DrawingSend = {
        createSendGroup() {
            const sendGroup = document.createElement('div');
            sendGroup.style.cssText = 'display:flex;position:relative';

            sendBtn = document.createElement('button');
            updateSendLabel = () => {
                const color = S.sendMode === 'note' ? '#22dd66' : '#ff5555';
                const isFilled = S.sendMode !== 'prompt';
                sendBtn.innerHTML = ICONS.sendPlay(color, isFilled);
                sendBtn.title = S.sendMode === 'prompt_run' ? 'Send drawing as prompt & run'
                              : S.sendMode === 'prompt' ? 'Send drawing as prompt'
                              : 'Send drawing as a note message';
            };
            sendBtn.style.cssText = smallBtn + ';background:#f3f4f6;border:1px solid #d1d5db;color:#333;font-weight:600;border-radius:4px 0 0 4px;border-right:none';
            updateSendLabel();

            const dropBtn = document.createElement('button');
            dropBtn.innerHTML = ICONS.dropArrow; dropBtn.title = 'Switch send mode';
            dropBtn.style.cssText = smallBtn + ';background:#f3f4f6;border:1px solid #d1d5db;color:#555;border-radius:0 4px 4px 0;padding:4px 6px;font-size:15px;line-height:1';

            const dropMenu = document.createElement('div');
            dropMenu.style.cssText = 'display:none;position:absolute;top:100%;right:0;background:white;border:1px solid #ccc;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:10;min-width:120px;margin-top:2px';
            window.DrawingToolbar.openMenus.push(dropMenu);
            [{label:'Send to Prompt & Run', mode:'prompt_run'},{label:'Send to Prompt', mode:'prompt'},{label:'Send to Note', mode:'note'}].forEach(({label, mode}) => {
                const item = document.createElement('div');
                item.textContent = label;
                item.style.cssText = 'padding:6px 12px;cursor:pointer;font-size:13px;white-space:nowrap';
                item.onmouseenter = () => item.style.background = '#f0f0f0';
                item.onmouseleave = () => item.style.background = 'white';
                item.onclick = () => { S.sendMode = mode; updateSendLabel(); dropMenu.style.display = 'none'; };
                dropMenu.appendChild(item);
            });
            dropBtn.onclick = e => { e.stopPropagation(); dropMenu.style.display = dropMenu.style.display === 'none' ? 'block' : 'none'; };

            sendBtn.onclick = () => window.DrawingSend.send();
            sendGroup.append(sendBtn, dropBtn, dropMenu);
            return sendGroup;
        },

        createAnchorGroup() {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;align-items:center;gap:4px;margin-left:6px';

            // Toggle button: click to enter selection mode
            anchorBtn = document.createElement('button');
            anchorBtn.textContent = '📌';
            anchorBtn.title = 'Set anchor message (drawing will be inserted before it)';
            anchorBtn.style.cssText = smallBtn + ';font-size:14px;opacity:0.5';

            // Label: shows selected message ID
            anchorLabel = document.createElement('span');
            anchorLabel.style.cssText = 'font-size:10px;font-family:monospace;color:#666;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

            function updateAnchorUI() {
                if (S.anchorSelecting) {
                    anchorBtn.style.opacity = '1';
                    anchorBtn.style.background = '#fef3c7';
                    anchorBtn.style.borderColor = '#f59e0b';
                    anchorLabel.textContent = 'click a msg…';
                    anchorLabel.style.color = '#f59e0b';
                } else if (S.anchorId) {
                    anchorBtn.style.opacity = '1';
                    anchorBtn.style.background = '#dcfce7';
                    anchorBtn.style.borderColor = '#22c55e';
                    anchorLabel.textContent = S.anchorId;
                    anchorLabel.style.color = '#22c55e';
                } else {
                    anchorBtn.style.opacity = '0.5';
                    anchorBtn.style.background = 'white';
                    anchorBtn.style.borderColor = '#ccc';
                    anchorLabel.textContent = '';
                    anchorLabel.style.color = '#666';
                }
            }

            anchorBtn.onclick = () => {
                if (S.anchorSelecting) {
                    // Cancel selection mode
                    S.anchorSelecting = false;
                } else if (S.anchorId) {
                    // Clear existing anchor
                    S.anchorId = null;
                    S.anchorSelecting = false;
                } else {
                    // Enter selection mode
                    S.anchorSelecting = true;
                }
                updateAnchorUI();
            };

            // Document click listener — captures message ID from [data-sm]
            document.addEventListener('click', e => {
                if (!S.anchorSelecting) return;
                // Walk up from click target to find the message wrapper
                const msgEl = e.target.closest('[data-sm]');
                console.log('[Canvas Anchor] clicked element:', e.target.tagName, 'closest [data-sm]:', msgEl?.tagName, 'dataset:', msgEl?.dataset);
                if (!msgEl) return;
                const msgId = msgEl.id;
                console.log('[Canvas Anchor] captured msgId:', msgId);
                if (!msgId) return;
                e.preventDefault();
                e.stopPropagation();
                S.anchorId = msgId;
                S.anchorSelecting = false;
                updateAnchorUI();
            }, true);  // useCapture to intercept before other handlers

            updateAnchorUI();
            wrap.append(anchorBtn, anchorLabel);
            return wrap;
        },

        async send() {
            if (!S.fc) return;
            const overlayDiv = document.getElementById('fabric-canvas-overlay');
            sendBtn.disabled = true;
            sendBtn.textContent = '⏳';
            try {
                const blob = await DC.exportBlob();
                const imageid = crypto.randomUUID();
                const filename = 'pasted_image_' + imageid + '.png';
                const dlg = _edVar('dlg_name');
                const msgType = S.sendMode === 'note' ? 'note' : 'prompt';
                console.log('[Canvas Send] dlg:', dlg, 'msgType:', msgType, 'anchorId:', S.anchorId, 'sendMode:', S.sendMode, 'blob size:', blob?.size);

                let msgId;
                if (S.anchorId) {
                    // Create message at anchor position first, then attach image
                    const createParams = {
                        dlg_name: dlg, msg_type: msgType, content: '',
                        placement: 'add_before', id_: S.anchorId
                    };
                    console.log('[Canvas Send] creating at anchor with params:', createParams);
                    const rawResp = await fetch('/add_relative_', { method: 'POST', body: new URLSearchParams(createParams) });
                    console.log('[Canvas Send] add_relative_ response status:', rawResp.status);
                    const resp = await rawResp.json();
                    console.log('[Canvas Send] add_relative_ response:', resp);
                    msgId = resp.id;
                    // Attach image to existing message
                    await post('/upload_attachment_', {
                        id_: msgId, msg_type: msgType, dlg_name: dlg,
                        file: new File([blob], filename, { type: blob.type })
                    });
                } else {
                    // No anchor — create via upload (appends at end)
                    const j1 = await (await post('/upload_attachment_', {
                        id_: '', msg_type: msgType, dlg_name: dlg,
                        file: new File([blob], filename, { type: blob.type })
                    })).json();
                    msgId = j1.id;
                }

                await post('/update_msg_', {
                    id_: msgId, dlg_name: dlg,
                    content: S.sendMode !== 'note'
                        ? `![${filename}](attachment:${imageid})\n\n${S.promptText}`
                        : `![${filename}](attachment:${imageid})`
                });

                if (S.sendMode === 'prompt_run') await post('/add_runq_', { ids: msgId, dlg_name: dlg });

                if (overlayDiv) overlayDiv.style.display = 'none';
                sendBtn.textContent = '✅';
                setTimeout(() => { updateSendLabel(); sendBtn.disabled = false; }, 2000);
            } catch (e) {
                sendBtn.textContent = '❌';
                console.error('Send error:', e);
                setTimeout(() => { updateSendLabel(); sendBtn.disabled = false; }, 3000);
            }
        },
    };

    // === Overlay assembly ===
    window.toggleCanvasOverlay = async function () {
        const existing = document.getElementById('fabric-canvas-overlay');
        if (existing) {
            const show = existing.style.display === 'none';
            existing.style.display = show ? 'flex' : 'none';
            if (show) existing.focus();
            return;
        }

        const w = Math.round(window.innerWidth * 0.7);
        const h = Math.round(window.innerHeight * 0.8);

        const div = document.createElement('div');
        div.id = 'fabric-canvas-overlay';
        div.style.cssText = `position:fixed;width:${w}px;height:${h}px;top:${(window.innerHeight - h) / 2}px;left:${(window.innerWidth - w) / 2}px;background:white;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:9999;display:flex;flex-direction:column;overflow:hidden;outline:none`;
        div.setAttribute('tabindex', '-1');

        // Title bar
        const titleBar = document.createElement('div');
        titleBar.style.cssText = 'background:#f0f0f0;padding:8px 12px;cursor:move;user-select:none;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #ddd;flex-shrink:0';
        titleBar.innerHTML = `<span style="font-weight:600;font-size:14px;display:flex;align-items:center;gap:6px">${ICONS.sparkles} Drawing Overlay</span>`;
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:16px;padding:0 4px';
        closeBtn.onclick = () => div.style.display = 'none';
        titleBar.appendChild(closeBtn);

        // Double-click title bar to snap to viewport
        titleBar.addEventListener('dblclick', () => {
            const m = 50;
            div.style.left = m + 'px'; div.style.top = m + 'px';
            div.style.width = (window.innerWidth - 2 * m) + 'px';
            div.style.height = (window.innerHeight - 2 * m) + 'px';
            if (S.fc) S.fc.setDimensions({ width: canvasContainer.offsetWidth, height: canvasContainer.offsetHeight });
        });

        // Toolbar + send group
        const toolbar = window.DrawingToolbar.create();
        const sendGroup = window.DrawingSend.createSendGroup();
        const anchorGroup = window.DrawingSend.createAnchorGroup();
        toolbar.appendChild(sendGroup);
        toolbar.appendChild(anchorGroup);

        // Canvas container
        const canvasContainer = document.createElement('div');
        canvasContainer.style.cssText = 'flex:1;position:relative;overflow:hidden';
        const canvasEl = document.createElement('canvas');
        canvasEl.id = 'fabric-drawing-canvas';
        canvasContainer.appendChild(canvasEl);

        // Resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.style.cssText = 'position:absolute;bottom:0;right:0;width:18px;height:18px;cursor:se-resize;z-index:10000;background:linear-gradient(135deg,transparent 50%,#999 50%)';

        // Tab strip (bottom, Excel-style)
        const tabStrip = await window.DrawingTabs.init(_edVar('dlg_name'));

        div.append(titleBar, toolbar, canvasContainer, tabStrip, resizeHandle);
        document.body.appendChild(div);
        div.focus();
        div.addEventListener('mousedown', () => div.focus());

        // Init canvas, then load the active tab
        DC.init(canvasEl, canvasContainer);
        DC.setupKeyboard(div);
        DC.setupPaste(div);
        // Wait for fabric to be ready, then load active tab
        const waitForCanvas = () => {
            if (!S.fc) { setTimeout(waitForCanvas, 50); return; }
            window.DrawingTabs.loadActive();
        };
        waitForCanvas();

        // Drag helper
        function makeDrag(handle, onStart, onMove) {
            handle.addEventListener('mousedown', e => {
                const s = onStart(e);
                const move = ev => onMove(ev.clientX - s.x, ev.clientY - s.y, s);
                const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
                document.addEventListener('mousemove', move);
                document.addEventListener('mouseup', up);
            });
        }
        makeDrag(titleBar,
            e => { const r = div.getBoundingClientRect(); div.style.left = r.left + 'px'; div.style.top = r.top + 'px'; return { x: e.clientX, y: e.clientY, left: r.left, top: r.top }; },
            (dx, dy, s) => { div.style.left = Math.max(0, Math.min(window.innerWidth - 50, s.left + dx)) + 'px'; div.style.top = Math.max(0, Math.min(window.innerHeight - 50, s.top + dy)) + 'px'; }
        );
        makeDrag(resizeHandle,
            e => { e.stopPropagation(); return { x: e.clientX, y: e.clientY, w: div.offsetWidth, h: div.offsetHeight }; },
            (dx, dy, s) => { div.style.width = Math.max(300, s.w + dx) + 'px'; div.style.height = Math.max(200, s.h + dy) + 'px'; if (S.fc) S.fc.setDimensions({ width: canvasContainer.offsetWidth, height: canvasContainer.offsetHeight }); }
        );
    };

    // Inject nav button
    function injectBtn() {
        const navtoolbar = document.querySelector('nav .flex.flex-wrap.justify-end');
        if (!navtoolbar) { setTimeout(injectBtn, 200); return; }
        document.getElementById('canvas-toggle-btn')?.remove();
        const btn = document.createElement('button');
        btn.innerHTML = ICONS.sparkles;
        btn.className = 'uk-btn uk-btn-icon uk-btn-sm text-lg uk-btn-default cursor-pointer';
        btn.setAttribute('uk-tooltip', 'Toggle drawing overlay');
        btn.id = 'canvas-toggle-btn';
        btn.onclick = window.toggleCanvasOverlay;
        navtoolbar.prepend(btn);
    }
    injectBtn();

    // Re-inject nav button on HTMX navigation
    window.addEventListener('message', e => {
        if (e.source === window && e.data?.type === 'solveit-drawing-reinit') injectBtn();
    });
})();

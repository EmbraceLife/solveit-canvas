// Canvas state, drawing modes, undo/redo, shapes, keyboard, paste, export
(function () {
    const ICONS = window.DRAWING_ICONS;

    // Shared drawing state — used by all modules
    const S = window._drawState = {
        fc: null,
        mode: 'draw',
        showDot: true,
        undoStack: [],
        redoStack: [],
        clipboard: [],
        opacity: 100,
        color: '#000000',
        thickness: 2,
        sendMode: 'prompt_run',
        promptText: 'Describe this drawing.',
        disposers: [],
        canvasContainer: null,
        modeButtons: {},
        btnStyles: {},
    };

    const dotCursor = `url("data:image/svg+xml;base64,${btoa(ICONS.dotCursorSvg)}") 4 4, crosshair`;

    function strokeColor() {
        const hex = S.color;
        const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${S.opacity / 100})`;
    }

    function viewportCenter() {
        const fc = S.fc, vpt = fc.viewportTransform;
        return { x: (fc.width / 2 - vpt[4]) / vpt[0], y: (fc.height / 2 - vpt[5]) / vpt[3] };
    }

    function addAndSelect(obj) {
        const fc = S.fc;
        fc.add(obj);
        DC.pushUndo({ type: 'add', objects: [obj] });
        fc.setActiveObject(obj);
        DC.setMode('select');
        fc.renderAll();
    }

    function fitAndAdd(obj) {
        const fc = S.fc;
        const { x: cx, y: cy } = viewportCenter();
        const scale = Math.min(1, fc.width * 0.6 / obj.width, fc.height * 0.6 / obj.height);
        obj.set({ left: cx - (obj.width * scale) / 2, top: cy - (obj.height * scale) / 2, scaleX: scale, scaleY: scale });
        addAndSelect(obj);
    }

    const DC = window.DrawingCanvas = {
        dotCursor,

        init(canvasEl, container) {
            S.canvasContainer = container;
            function waitForFabric(cb) {
                if (typeof fabric === 'undefined') { setTimeout(() => waitForFabric(cb), 100); return; }
                cb();
            }
            waitForFabric(() => {
                const fc = new fabric.Canvas(canvasEl.id, {
                    isDrawingMode: true,
                    includeDefaultValues: false,
                    width: container.offsetWidth,
                    height: container.offsetHeight,
                });
                fc.freeDrawingBrush = new fabric.PencilBrush(fc);
                fc.freeDrawingBrush.color = strokeColor();
                fc.freeDrawingBrush.width = S.thickness;
                fc.freeDrawingBrush.decimate = 1;
                fc.freeDrawingCursor = S.showDot ? dotCursor : 'none';
                S.fc = fc;
                window._fabricCanvas = fc;
                fc.on('path:created', e => DC.pushUndo({ type: 'add', objects: [e.path] }));
                fc.on('object:modified', e => {
                    const obj = e.target;
                    const orig = e.transform.original;
                    const props = ['left', 'top', 'scaleX', 'scaleY', 'angle', 'skewX', 'skewY', 'flipX', 'flipY'];
                    const before = {}, after = {};
                    props.forEach(p => { before[p] = orig[p]; after[p] = obj[p]; });
                    DC.pushUndo({ type: 'modify', transforms: [{ obj, before, after }] });
                });
                DC.setMode('draw');
                // Mousewheel zoom
                container.addEventListener('wheel', e => {
                    e.preventDefault();
                    let zoom = fc.getZoom() * 0.999 ** e.deltaY;
                    zoom = Math.min(Math.max(zoom, 0.1), 10);
                    fc.zoomToPoint(new fabric.Point(e.offsetX, e.offsetY), zoom);
                }, { passive: false });
            });
        },

        pushUndo(action) {
            S.undoStack.push(action);
            if (S.undoStack.length > 50) S.undoStack.shift();
            S.redoStack.length = 0;
            if (window.DrawingTabs) window.DrawingTabs.markDirty();
        },

        _runAction(action, reverse) {
            const fc = S.fc;
            if (action.type === 'modify') action.transforms.forEach(({ obj, before, after }) => { obj.set(reverse ? before : after); obj.setCoords(); });
            else action.objects.forEach(o => ((action.type === 'add') !== reverse) ? fc.add(o) : fc.remove(o));
            fc.discardActiveObject();
            fc.requestRenderAll();
        },

_swapStack(from, to, reverse) {
            if (!S.fc || from.length === 0) return;
            const action = from.pop();
            to.push(action);
            DC._runAction(action, reverse);
        },
        doUndo() { DC._swapStack(S.undoStack, S.redoStack, true); },
        doRedo() { DC._swapStack(S.redoStack, S.undoStack, false); },

        clearCanvas() {
            const fc = S.fc;
            if (!fc) return;
            const objects = fc.getObjects().slice();
            if (objects.length === 0) return;
            const action = { type: 'remove', objects };
            DC.pushUndo(action);
            DC._runAction(action, false);
        },

        applyBrushColor() {
            if (!S.fc || !S.fc.freeDrawingBrush) return;
            S.fc.freeDrawingBrush.color = strokeColor();
        },

        setMode(mode) {
            const fc = S.fc;
            if (!fc) return;
            S.mode = mode;
            S.disposers.forEach(d => d());
            S.disposers = [];
            fc.upperCanvasEl.style.pointerEvents = '';
            if (S.canvasContainer) {
                S.canvasContainer.style.cursor = '';
                if (S.canvasContainer._panHandlers) {
                    const h = S.canvasContainer._panHandlers;
                    S.canvasContainer.removeEventListener('pointerdown', h.down);
                    S.canvasContainer.removeEventListener('pointermove', h.move);
                    S.canvasContainer.removeEventListener('pointerup', h.up);
                    S.canvasContainer._panHandlers = null;
                }
            }
            const { active, inactive } = S.btnStyles;
            Object.values(S.modeButtons).forEach(b => {
                if (b) b.style.cssText = b.dataset.base + (inactive || '');
            });
            fc.isDrawingMode = false;
            fc.selection = false;
            if (mode === 'draw') {
                fc.isDrawingMode = true;
                fc.freeDrawingCursor = S.showDot ? dotCursor : 'none';
                S.disposers.push(fc.on('mouse:down', () => { fc.freeDrawingCursor = 'none'; fc.setCursor('none'); }));
                S.disposers.push(fc.on('mouse:up', () => { const c = S.showDot ? dotCursor : 'none'; fc.freeDrawingCursor = c; fc.setCursor(c); }));
            } else if (mode === 'select') {
                fc.selection = true;
                fc.defaultCursor = 'default';
            } else {
                fc.upperCanvasEl.style.pointerEvents = 'none';
                S.canvasContainer.style.cursor = 'grab';
                let panning = false, lastX, lastY;
                const handlers = {
                    down: e => { panning = true; lastX = e.clientX; lastY = e.clientY; S.canvasContainer.style.cursor = 'grabbing'; e.target.setPointerCapture(e.pointerId); },
                    move: e => { if (!panning) return; fc.relativePan(new fabric.Point(e.clientX - lastX, e.clientY - lastY)); lastX = e.clientX; lastY = e.clientY; },
                    up: e => { panning = false; S.canvasContainer.style.cursor = 'grab'; e.target.releasePointerCapture(e.pointerId); }
                };
                S.canvasContainer.addEventListener('pointerdown', handlers.down);
                S.canvasContainer.addEventListener('pointermove', handlers.move);
                S.canvasContainer.addEventListener('pointerup', handlers.up);
                S.canvasContainer._panHandlers = handlers;
            }
            const mb = S.modeButtons[mode];
            if (mb) mb.style.cssText = mb.dataset.base + (active || '');
        },

        addShape(type) {
            const fc = S.fc;
            if (!fc) return;
            const sc = strokeColor(), sw = S.thickness;
            const { x: cx, y: cy } = viewportCenter();
            let obj;
            if (type === 'rect') obj = new fabric.Rect({ left: cx - 50, top: cy - 35, width: 100, height: 70, fill: 'transparent', stroke: sc, strokeWidth: sw });
            else if (type === 'circle') obj = new fabric.Circle({ left: cx - 40, top: cy - 40, radius: 40, fill: 'transparent', stroke: sc, strokeWidth: sw });
            else if (type === 'triangle') obj = new fabric.Triangle({ left: cx - 40, top: cy - 35, width: 80, height: 70, fill: 'transparent', stroke: sc, strokeWidth: sw });
            else if (type === 'line') obj = new fabric.Line([cx - 60, cy, cx + 60, cy], { stroke: sc, strokeWidth: sw });
            else if (type === 'arrow') {
                const line = new fabric.Line([cx - 60, cy, cx + 60, cy], { stroke: sc, strokeWidth: sw });
                const head = new fabric.Triangle({ left: cx + 60, top: cy, width: sw * 4 + 6, height: sw * 4 + 6, fill: sc, angle: 90, originX: 'center', originY: 'center' });
                obj = new fabric.Group([line, head]);
            } else if (type === 'text') obj = new fabric.Textbox('Text', { left: cx - 30, top: cy - 12, fontSize: 20, fill: sc, fontFamily: 'sans-serif', width: 150, editable: true });
            if (obj) addAndSelect(obj);
        },

        setupKeyboard(div) {
            div.addEventListener('keydown', e => {
                const fc = S.fc;
                if (!fc) return;
                if (fc.getActiveObject()?.isEditing) return;
                if ((e.key === 'Delete' || e.key === 'Backspace') && S.mode === 'select') {
                    const active = fc.getActiveObjects();
                    if (active.length === 0) return;
                    const action = { type: 'remove', objects: active.slice() }; DC.pushUndo(action); DC._runAction(action, false); e.stopPropagation(); e.preventDefault(); return;
                }
                const mod = e.ctrlKey || e.metaKey;
                if (mod || S.mode !== 'select') return;
                if (e.key === 'c' || e.key === 'x') {
                    const active = fc.getActiveObjects();
                    if (active.length === 0) return;
                    Promise.all(active.map(o => o.clone())).then(clones => {
                        S.clipboard = clones;
                        if (e.key === 'x') { const action = { type: 'remove', objects: active.slice() }; DC.pushUndo(action); DC._runAction(action, false); }
                    });
                    e.stopPropagation(); e.preventDefault(); return;
                }
                if (e.key === 'v' && S.clipboard.length > 0) {
                    Promise.all(S.clipboard.map(o => o.clone())).then(clones => {
                        clones.forEach(c => { c.set({ left: c.left + 15, top: c.top + 15 }); fc.add(c); });
                        DC.pushUndo({ type: 'add', objects: clones });
                        fc.discardActiveObject();
                        if (clones.length === 1) fc.setActiveObject(clones[0]);
                        else fc.setActiveObject(new fabric.ActiveSelection(clones, { canvas: fc }));
                        S.clipboard = clones; fc.renderAll();
                    });
                    e.stopPropagation(); e.preventDefault();
                }
            });
        },

        setupPaste(div) {
            div.addEventListener('paste', async e => {
                const fc = S.fc;
                if (!fc) return;
                // Don't intercept paste when typing in a text field (e.g. prompt textarea)
                const tag = document.activeElement?.tagName;
                if (tag === 'TEXTAREA' || tag === 'INPUT') return;
                e.preventDefault(); e.stopPropagation();
                const items = [...(e.clipboardData?.items || [])];
                const imgItem = items.find(i => i.type.startsWith('image/'));
                if (imgItem) {
                    const blob = imgItem.getAsFile();
                    const dataUrl = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                    const img = await fabric.FabricImage.fromURL(dataUrl);
                    fitAndAdd(img); return;
                }
                const text = (e.clipboardData?.getData('text/plain') || '').trim();
                if (/^<svg[\s\S]*<\/svg>$/i.test(text)) {
                    const result = await fabric.loadSVGFromString(text);
                    const group = fabric.util.groupSVGElements(result.objects, result.options);
                    fitAndAdd(group);
                }
            });
        },

async _withCroppedViewport(fn) {
            const fc = S.fc;
            if (!fc) return null;
            fc.discardActiveObject();
            const objects = fc.getObjects();
            if (objects.length === 0) return fn(fc, false);
            const savedVpt = fc.viewportTransform.slice();
            const savedW = fc.width, savedH = fc.height;
            // All sync — viewport manipulate, capture, restore — no frame painted
            fc.setViewportTransform([1, 0, 0, 1, 0, 0]);
            objects.forEach(o => o.setCoords());
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            objects.forEach(o => { const r = o.getBoundingRect(); minX = Math.min(minX, r.left); minY = Math.min(minY, r.top); maxX = Math.max(maxX, r.left + r.width); maxY = Math.max(maxY, r.top + r.height); });
            const m = 20;
            fc.setViewportTransform([1, 0, 0, 1, -minX + m, -minY + m]);
            fc.setDimensions({ width: maxX - minX + 2 * m, height: maxY - minY + 2 * m });
            const result = fn(fc, true);  // fn does sync capture (toDataURL), may return Promise
            // Restore immediately — still same synchronous block, browser hasn't painted
            fc.setDimensions({ width: savedW, height: savedH });
            fc.setViewportTransform(savedVpt);
            return await result;  // Only now yield — viewport already restored
        },

        async exportBlob() {
            return DC._withCroppedViewport(async (fc, hasContent) => {
                if (!hasContent) return new Promise(res => fc.lowerCanvasEl.toBlob(res, 'image/png'));
                const dataUrl = fc.toDataURL({ format: 'png', multiplier: window.devicePixelRatio || 2 });
                return (await fetch(dataUrl)).blob();
            });
        },

        async exportThumbnail() {
            return DC._withCroppedViewport((fc, hasContent) => {
                if (!hasContent) return null;
                return fc.toDataURL({ format: 'png', multiplier: 0.3 });
            });
        },
    };
})();

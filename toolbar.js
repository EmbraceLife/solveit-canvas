// Toolbar UI — mode buttons, shapes, thickness, color, opacity, undo/redo, dot toggle
(function () {
    const ICONS = window.DRAWING_ICONS;
    const DC = window.DrawingCanvas;
    const S = window._drawState;

    const btnCommon = 'height:28px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;border:1px solid #ccc;cursor:pointer;font-size:13px';
    const btnBase = btnCommon + ';padding:4px 12px;transition:all 0.15s;margin:0';
    const btnFirst = btnBase + ';border-radius:4px 0 0 4px;border-right:none';
    const btnMid   = btnBase + ';border-radius:0;border-right:none';
    const btnLast  = btnBase + ';border-radius:0 4px 4px 0';
    const activeClr = ';background:#2563eb;color:white;border-color:#2563eb';
    const inactiveClr = ';background:white;color:#333';
    const smallBtn = btnCommon + ';padding:3px 8px;border-radius:4px;background:white';

    S.btnStyles = { active: activeClr, inactive: inactiveClr };

    function makeToolBtn(label, title, pos) {
        const b = document.createElement('button');
        b.innerHTML = label; b.title = title;
        const base = pos === 'first' ? btnFirst : pos === 'mid' ? btnMid : btnLast;
        b.dataset.base = base;
        b.style.cssText = base + inactiveClr;
        return b;
    }

    function makeSep() {
        const s = document.createElement('div');
        s.style.cssText = 'width:1px;height:22px;background:#ccc;margin:0 4px';
        return s;
    }

    const colorDot = (hex, size = 14) => {
        const stroke = hex === '#ffffff' ? '#aaa' : hex;
        return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="${hex}" stroke="${stroke}" stroke-width="1"/></svg>`;
    };

    // --- Shared dropdown infrastructure ---
    const openMenus = [];
    document.addEventListener('click', () => openMenus.forEach(m => m.style.display = 'none'));

    function makeDropdown({ btnHTML, btnTitle, menuStyle, display, items }) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;display:inline-block';
        const btn = document.createElement('button');
        btn.innerHTML = btnHTML; btn.title = btnTitle; btn.style.cssText = smallBtn;
        const menu = document.createElement('div');
        const baseMenuStyle = 'display:none;position:absolute;top:100%;left:50%;transform:translateX(-50%);background:white;border:1px solid #ccc;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:10;margin-top:2px';
        menu.style.cssText = menuStyle ? baseMenuStyle + ';' + menuStyle : baseMenuStyle;
        openMenus.push(menu);
        items.forEach(({ html, title, style, onHover, onClick }) => {
            const item = document.createElement('div');
            if (html) item.innerHTML = html; else item.textContent = title || '';
            item.style.cssText = style || 'padding:5px 14px;cursor:pointer;font-size:13px;white-space:nowrap';
            const hoverOn = onHover?.[0] || '#f0f0f0', hoverOff = onHover?.[1] || 'white';
            item.onmouseenter = () => item.style.background = hoverOn;
            item.onmouseleave = () => item.style.background = hoverOff;
            item.onclick = () => { menu.style.display = 'none'; onClick(); };
            menu.appendChild(item);
        });
        btn.onclick = e => { e.stopPropagation(); menu.style.display = menu.style.display === 'none' ? (display || 'block') : 'none'; };
        wrap.append(btn, menu);
        return { wrap, btn, menu };
    }

    window.DrawingToolbar = {
        smallBtn,
        makeDropdown,
        openMenus,
        create() {
            const toolbar = document.createElement('div');
            toolbar.style.cssText = 'background:#fafafa;padding:6px 10px;display:flex;gap:6px;align-items:center;border-bottom:1px solid #ddd;flex-shrink:0';

            // Mode buttons
            const drawBtn   = makeToolBtn(ICONS.draw,   'Draw mode',   'first');
            const selectBtn = makeToolBtn(ICONS.select, 'Select mode', 'mid');
            const panBtn    = makeToolBtn(ICONS.pan,    'Pan mode',    'last');
            S.modeButtons = { draw: drawBtn, select: selectBtn, pan: panBtn };
            drawBtn.onclick   = () => DC.setMode('draw');
            selectBtn.onclick = () => DC.setMode('select');
            panBtn.onclick    = () => DC.setMode('pan');
            const btnGroup = document.createElement('div');
            btnGroup.style.cssText = 'display:flex';
            btnGroup.append(drawBtn, selectBtn, panBtn);
            toolbar.append(btnGroup, makeSep());

            // Shape dropdown
            const { wrap: shapeWrap } = makeDropdown({
                btnHTML: ICONS.shapeTool, btnTitle: 'Add shape',
                items: [['▭ Rect','rect'],['○ Circle','circle'],['△ Triangle','triangle'],['╱ Line','line'],['→ Arrow','arrow'],['T Text','text']]
                    .map(([label, type]) => ({ title: label, onClick: () => DC.addShape(type) }))
            });
            toolbar.append(shapeWrap, makeSep());

            // Thickness
            const thicknessSelect = document.createElement('select');
            thicknessSelect.title = 'Line thickness'; thicknessSelect.style.cssText = smallBtn + ';padding:3px 6px';
            [1, 2, 3, 5, 8, 12, 20, 30, 50].forEach(v => {
                const opt = document.createElement('option');
                opt.value = v; opt.textContent = v + 'px';
                if (v === 2) opt.selected = true;
                thicknessSelect.appendChild(opt);
            });
            thicknessSelect.onchange = () => {
                S.thickness = parseInt(thicknessSelect.value);
                if (S.fc && S.fc.freeDrawingBrush) S.fc.freeDrawingBrush.width = S.thickness;
            };
            toolbar.appendChild(thicknessSelect);

            // Color
            const colors = [
                ['Black','#000000'],['Dark Gray','#555555'],['Gray','#999999'],['White','#ffffff'],
                ['Red','#e53e3e'],['Orange','#ea580c'],['Yellow','#FFD60A'],['Lime','#8BC34A'],
                ['Green','#16a34a'],['Teal','#00A8A8'],['Cyan','#00bcd4'],['Blue','#2563eb'],
                ['Navy','#1e3a5f'],['Purple','#7c3aed'],['Pink','#ec4899'],['Brown','#8B572A']
            ];
            const { wrap: colorWrap, btn: colorBtn } = makeDropdown({
                btnHTML: colorDot('#000000'), btnTitle: 'Black', display: 'grid',
                menuStyle: 'border-radius:6px;padding:6px;grid-template-columns:repeat(4,1fr);gap:4px',
                items: colors.map(([name, hex]) => ({
                    html: colorDot(hex, 22), title: name,
                    style: 'cursor:pointer;border-radius:4px;padding:2px;display:flex;align-items:center;justify-content:center',
                    onHover: ['#e5e7eb', 'transparent'],
                    onClick: () => { S.color = hex; colorBtn.innerHTML = colorDot(hex); colorBtn.title = name; DC.applyBrushColor(); }
                }))
            });
            toolbar.append(colorWrap, makeSep());

            // Opacity
            const { wrap: opacityWrap, btn: opacityBtn } = makeDropdown({
                btnHTML: ICONS.opacityDrop(100), btnTitle: 'Opacity: 100%',
                menuStyle: 'max-height:200px;overflow-y:auto',
                items: [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 5].map(v => ({
                    title: v + '%',
                    style: 'padding:4px 14px;cursor:pointer;font-size:13px;text-align:center;white-space:nowrap',
                    onClick: () => { S.opacity = v; opacityBtn.innerHTML = ICONS.opacityDrop(v); opacityBtn.title = 'Opacity: ' + v + '%'; DC.applyBrushColor(); }
                }))
            });
            toolbar.append(opacityWrap, makeSep());

            // Undo / Redo / Clear
            function makeBtn(icon, title, fn) {
                const b = document.createElement('button');
                b.innerHTML = icon; b.title = title; b.style.cssText = smallBtn; b.onclick = fn;
                return b;
            }
            toolbar.append(
                makeBtn(ICONS.undo, 'Undo', () => DC.doUndo()),
                makeBtn(ICONS.redo, 'Redo', () => DC.doRedo()),
                makeBtn(ICONS.clear, 'Clear canvas', () => DC.clearCanvas()),
                makeBtn(ICONS.save, 'Save (to browser)', () => window.DrawingTabs?.save()),
            );

            // Dot toggle
            const dotToggle = document.createElement('button');
            dotToggle.textContent = ICONS.dotToggle; dotToggle.title = 'Toggle draw cursor dot';
            dotToggle.style.cssText = smallBtn + ';font-size:15px';
            dotToggle.onclick = () => { S.showDot = !S.showDot; dotToggle.style.opacity = S.showDot ? '1' : '0.4'; if (S.mode === 'draw') DC.setMode('draw'); };
toolbar.append(dotToggle, makeSep());

            // Prompt text split button (editor + preset dropdown)
            const PRESETS = [
                'Describe this drawing.',
                '',
                'What does this diagram represent?',
                'Suggest improvements.',
                "What's missing?",
                'List the steps shown.',
                'Solve this.',
                'Explain the math shown here.',
                'Convert to text/LaTeX.',
                'Label this diagram.',
                'Continue this.',
                'Recreate this as a clean diagram.',
            ];
            const promptWrap = document.createElement('div');
            promptWrap.style.cssText = 'position:relative;display:inline-flex';

            // Main button — opens textarea editor
            const promptBtn = document.createElement('button');
            promptBtn.innerHTML = ICONS.promptText; promptBtn.title = 'Edit prompt text';
            promptBtn.style.cssText = smallBtn + ';border-radius:4px 0 0 4px;border-right:none';

            // Textarea popup
            const promptPopup = document.createElement('div');
            promptPopup.style.cssText = 'display:none;position:absolute;top:100%;left:50%;transform:translateX(-50%);background:white;border:1px solid #ccc;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:10;margin-top:2px;padding:8px;width:280px';
            const promptInput = document.createElement('textarea');
            promptInput.style.cssText = 'width:100%;height:60px;border:1px solid #ccc;border-radius:3px;padding:4px 6px;font-size:12px;resize:vertical;font-family:inherit';
            promptInput.value = S.promptText;
            promptInput.oninput = () => { S.promptText = promptInput.value; };
            promptPopup.appendChild(promptInput);
            openMenus.push(promptPopup);
            promptPopup.onclick = e => e.stopPropagation();
            promptBtn.onclick = e => { e.stopPropagation(); const show = promptPopup.style.display === 'none'; openMenus.forEach(m => m.style.display = 'none'); if (show) { promptPopup.style.display = 'block'; promptInput.focus(); } };

            // Dropdown arrow — preset list
            const promptDropBtn = document.createElement('button');
            promptDropBtn.innerHTML = ICONS.dropArrow; promptDropBtn.title = 'Preset prompts';
            promptDropBtn.style.cssText = smallBtn + ';border-radius:0 4px 4px 0;padding:3px 5px';

            const presetMenu = document.createElement('div');
            presetMenu.style.cssText = 'display:none;position:absolute;top:100%;right:0;background:white;border:1px solid #ccc;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:10;min-width:220px;margin-top:2px;max-height:260px;overflow-y:auto';
            openMenus.push(presetMenu);

            PRESETS.forEach(text => {
                const item = document.createElement('div');
                item.textContent = text || '(blank — no text)';
                if (!text) item.style.cssText = 'padding:5px 12px;cursor:pointer;font-size:12px;white-space:nowrap;color:#999;font-style:italic';
                else item.style.cssText = 'padding:5px 12px;cursor:pointer;font-size:12px;white-space:nowrap';
                item.onmouseenter = () => item.style.background = '#f0f0f0';
                item.onmouseleave = () => item.style.background = 'white';
                item.onclick = () => { S.promptText = text; promptInput.value = text; presetMenu.style.display = 'none'; };
                presetMenu.appendChild(item);
            });

            // "Custom…" entry at bottom
            const customSep = document.createElement('div');
            customSep.style.cssText = 'border-top:1px solid #eee;margin:2px 0';
            presetMenu.appendChild(customSep);
            const customItem = document.createElement('div');
            customItem.textContent = 'Custom…';
            customItem.style.cssText = 'padding:5px 12px;cursor:pointer;font-size:12px;white-space:nowrap;font-weight:600';
            customItem.onmouseenter = () => customItem.style.background = '#f0f0f0';
            customItem.onmouseleave = () => customItem.style.background = 'white';
            customItem.onclick = (e) => { e.stopPropagation(); presetMenu.style.display = 'none'; S.promptText = ''; promptInput.value = ''; openMenus.forEach(m => m.style.display = 'none'); promptPopup.style.display = 'block'; promptInput.focus(); };
            presetMenu.appendChild(customItem);

            promptDropBtn.onclick = e => { e.stopPropagation(); openMenus.forEach(m => m.style.display = 'none'); presetMenu.style.display = presetMenu.style.display === 'none' ? 'block' : 'none'; };

            promptWrap.append(promptBtn, promptDropBtn, promptPopup, presetMenu);
            toolbar.append(promptWrap, makeSep());

            // Placement dropdown (📍)
            const placementLabels = { end: 'At end', beginning: 'At beginning', after_selected: 'After selected', after_id: 'After message ID…' };
            const placementWrap = document.createElement('div');
            placementWrap.style.cssText = 'position:relative;display:inline-block';
            const placementBtn = document.createElement('button');
            placementBtn.textContent = '📍';
            placementBtn.title = 'Placement: At end';
            placementBtn.style.cssText = smallBtn + ';font-size:14px';

            const placementMenu = document.createElement('div');
            placementMenu.style.cssText = 'display:none;position:absolute;top:100%;right:0;background:white;border:1px solid #ccc;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:10;min-width:180px;margin-top:2px';
            openMenus.push(placementMenu);

            // ID input popup (for after_id mode)
            const idPopup = document.createElement('div');
            idPopup.style.cssText = 'display:none;position:absolute;top:100%;right:0;background:white;border:1px solid #ccc;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:10;margin-top:2px;padding:8px;width:220px';
            const idLabel = document.createElement('div');
            idLabel.textContent = 'Message ID:';
            idLabel.style.cssText = 'font-size:11px;color:#666;margin-bottom:4px';
            const idInput = document.createElement('input');
            idInput.type = 'text';
            idInput.placeholder = '_abc12345';
            idInput.value = S.anchorId;
            idInput.style.cssText = 'width:100%;border:1px solid #ccc;border-radius:3px;padding:4px 6px;font-size:12px;font-family:monospace';
            idInput.oninput = () => { S.anchorId = idInput.value.trim(); };
            idPopup.append(idLabel, idInput);
            idPopup.onclick = e => e.stopPropagation();
            openMenus.push(idPopup);

            const placementItems = {};
            function setPlacement(mode) {
                S.placement = mode;
                placementBtn.title = 'Placement: ' + placementLabels[mode];
                Object.entries(placementItems).forEach(([m, el]) => {
                    el.textContent = (m === mode ? '✓ ' : '   ') + placementLabels[m];
                });
            }

            ['end', 'beginning', 'after_selected', 'after_id'].forEach(mode => {
                const item = document.createElement('div');
                item.textContent = (mode === S.placement ? '✓ ' : '   ') + placementLabels[mode];
                item.style.cssText = 'padding:5px 12px;cursor:pointer;font-size:12px;white-space:nowrap';
                placementItems[mode] = item;
                item.onmouseenter = () => item.style.background = '#f0f0f0';
                item.onmouseleave = () => item.style.background = 'white';
                item.onclick = (e) => {
                    placementMenu.style.display = 'none';
                    if (mode === 'after_id') {
                        e.stopPropagation();
                        setPlacement(mode);
                        openMenus.forEach(m => m.style.display = 'none');
                        idPopup.style.display = 'block';
                        idInput.focus();
                    } else {
                        setPlacement(mode);
                    }
                };
                placementMenu.appendChild(item);
            });

            placementBtn.onclick = e => { e.stopPropagation(); openMenus.forEach(m => m.style.display = 'none'); placementMenu.style.display = placementMenu.style.display === 'none' ? 'block' : 'none'; };
            placementWrap.append(placementBtn, placementMenu, idPopup);
            toolbar.append(placementWrap, makeSep());

            return toolbar;
        }
    };
})();

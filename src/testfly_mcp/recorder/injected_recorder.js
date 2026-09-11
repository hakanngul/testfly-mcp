/**
 * TestFly Injected Recorder
 * Injected into Google Chrome via CDP (Page.addScriptToEvaluateOnNewDocument).
 * Captures user interactions, computes accessibility-first TestFly locators,
 * displays a Playwright-style hover highlight box, and sends events to the recorder server.
 */

(function () {
    if (window.__TESTFLY_RECORDER_INITIALIZED__) return;
    window.__TESTFLY_RECORDER_INITIALIZED__ = true;

    const SERVER_URL = 'http://127.0.0.1:8765';
    let currentMode = 'record'; // 'record' | 'pause' | 'assert_visible' | 'assert_text' | 'pick_locator'
    let hoverOverlay = null;
    let badgeEl = null;
    let lastTarget = null;
    let inputTimeout = null;

    // Helper to detect TestFly injected UI elements (overlays, modals, badges)
    function isTestFlyUI(target) {
        if (!target) return false;
        if (target === hoverOverlay || target === badgeEl) return true;
        if (typeof target.closest === 'function') {
            if (target.closest('#__testfly_assert_text_modal__') ||
                target.closest('#__testfly_modal_backdrop__') ||
                target.closest('#__testfly_hover_box__') ||
                target.closest('#__testfly_locator_badge__') ||
                target.closest('#__testfly_inspect_box__')) {
                return true;
            }
        }
        return false;
    }

    // Switches recorder back to normal record mode after assertion/picker
    function switchBackToRecord() {
        currentMode = 'record';
        updateOverlay(null);
        currentResolvedTarget = null;

        const serverUrl = window.__TESTFLY_SERVER_URL__ || SERVER_URL;
        fetch(`${serverUrl}/api/mode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'record' }),
            mode: 'cors'
        }).catch(() => {});

        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'testfly_mode', mode: 'record' }, '*');
            window.parent.postMessage({ type: 'testfly_set_mode', mode: 'record' }, '*');
        }
    }

    // 1. Create Playwright-style Hover Highlight Box
    function createOverlay() {
        if (hoverOverlay) return;

        hoverOverlay = document.createElement('div');
        hoverOverlay.id = '__testfly_hover_box__';
        hoverOverlay.style.position = 'fixed';
        hoverOverlay.style.pointerEvents = 'none';
        hoverOverlay.style.zIndex = '2147483647';
        hoverOverlay.style.border = '2px solid #8b5cf6'; // Violet border like Playwright
        hoverOverlay.style.backgroundColor = 'rgba(139, 92, 246, 0.15)';
        hoverOverlay.style.borderRadius = '3px';
        hoverOverlay.style.display = 'none';
        hoverOverlay.style.transition = 'all 0.05s ease-out';
        hoverOverlay.style.boxSizing = 'border-box';

        badgeEl = document.createElement('div');
        badgeEl.id = '__testfly_locator_badge__';
        badgeEl.style.position = 'absolute';
        badgeEl.style.top = '-24px';
        badgeEl.style.left = '0';
        badgeEl.style.backgroundColor = '#1e1b4b';
        badgeEl.style.color = '#c7d2fe';
        badgeEl.style.padding = '2px 8px';
        badgeEl.style.borderRadius = '4px';
        badgeEl.style.fontSize = '11px';
        badgeEl.style.fontFamily = 'ui-monospace, monospace';
        badgeEl.style.fontWeight = '600';
        badgeEl.style.whiteSpace = 'nowrap';
        badgeEl.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';

        hoverOverlay.appendChild(badgeEl);
        document.documentElement.appendChild(hoverOverlay);
    }

    function updateOverlay(targetInfo) {
        if (!targetInfo || !targetInfo.rect) {
            if (hoverOverlay) hoverOverlay.style.display = 'none';
            return;
        }

        createOverlay();
        const rect = targetInfo.rect;
        if (!rect || rect.width === 0 || rect.height === 0) {
            hoverOverlay.style.display = 'none';
            return;
        }

        hoverOverlay.style.display = 'block';
        hoverOverlay.style.top = `${rect.top}px`;
        hoverOverlay.style.left = `${rect.left}px`;
        hoverOverlay.style.width = `${rect.width}px`;
        hoverOverlay.style.height = `${rect.height}px`;

        // Style overlay according to mode
        if (currentMode === 'assert_enabled') {
            const el = targetInfo.element;
            const isDisabled = el && (el.disabled || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled'));
            hoverOverlay.style.borderColor = isDisabled ? '#f59e0b' : '#10b981';
            hoverOverlay.style.backgroundColor = isDisabled ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)';
            badgeEl.style.backgroundColor = isDisabled ? '#78350f' : '#064e3b';
            badgeEl.style.color = isDisabled ? '#fde68a' : '#a7f3d0';
            const locDisp = targetInfo.info ? targetInfo.info.display : '';
            badgeEl.textContent = isDisabled ? `assert(${locDisp}).isDisabled()` : `assert(${locDisp}).isEnabled()`;
        } else if (currentMode.startsWith('assert')) {
            hoverOverlay.style.borderColor = '#10b981'; // Green for assertion
            hoverOverlay.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
            badgeEl.style.backgroundColor = '#064e3b';
            badgeEl.style.color = '#a7f3d0';
            badgeEl.textContent = targetInfo.info ? targetInfo.info.display : '';
        } else if (currentMode === 'pick_locator') {
            hoverOverlay.style.borderColor = '#f59e0b'; // Amber for locator picker
            hoverOverlay.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
            badgeEl.style.backgroundColor = '#78350f';
            badgeEl.style.color = '#fde68a';
            badgeEl.textContent = targetInfo.info ? targetInfo.info.display : '';
        } else {
            hoverOverlay.style.borderColor = '#8b5cf6'; // Violet for record
            hoverOverlay.style.backgroundColor = 'rgba(139, 92, 246, 0.15)';
            badgeEl.style.backgroundColor = '#1e1b4b';
            badgeEl.style.color = '#c7d2fe';
            badgeEl.textContent = targetInfo.info ? targetInfo.info.display : '';
        }
    }

    // Resolves deep element under cursor, supporting nested headings and direct text nodes
    function resolveTargetAt(clientX, clientY, rootEl) {
        let el = rootEl || document.elementFromPoint(clientX, clientY);
        if (!el || el === hoverOverlay || el === badgeEl || el === document.documentElement || el === document.body || isTestFlyUI(el)) {
            return null;
        }

        // 1. If el has child elements, check if cursor is directly within one of them (e.g. <h4>)
        for (const child of Array.from(el.children)) {
            if (isTestFlyUI(child)) continue;
            const r = child.getBoundingClientRect();
            if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
                el = child;
                break;
            }
        }
        if (isTestFlyUI(el)) return null;

        // 2. Check if cursor is directly over any text node child (e.g. standard_user, locked_out_user)
        for (let i = 0; i < el.childNodes.length; i++) {
            const n = el.childNodes[i];
            if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) {
                const text = n.textContent.trim();
                const range = document.createRange();
                range.selectNodeContents(n);
                const r = range.getBoundingClientRect();
                if (r.width > 0 && r.height > 0 &&
                    clientX >= r.left - 6 && clientX <= r.right + 6 &&
                    clientY >= r.top - 2 && clientY <= r.bottom + 2) {

                    const safeText = text.replace(/"/g, '\\"');
                    const xpath = `//*[contains(text(), "${safeText}")]`;
                    return {
                        element: el,
                        textNode: n,
                        text: text,
                        rect: r,
                        info: {
                            type: 'text',
                            by: 'text',
                            selector: text,
                            xpath: xpath,
                            code: `getByText("${safeText}")`,
                            display: `getByText("${safeText}")`
                        }
                    };
                }
            }
        }

        // 3. Fallback to the element itself
        const info = computeTestFlyLocator(el);
        return {
            element: el,
            textNode: null,
            text: (el.innerText || el.textContent || '').trim(),
            rect: el.getBoundingClientRect(),
            info: info
        };
    }

    // Helper: Find nearest ancestor container with an ID or data-test attribute
    function findNearestContainer(el) {
        let curr = el.parentElement;
        while (curr && curr !== document.body && curr !== document.documentElement) {
            for (const attr of ['data-testid', 'data-test', 'data-qa', 'data-cy']) {
                const val = curr.getAttribute(attr);
                if (val) return { type: 'testid', attr, val, element: curr };
            }
            const id = curr.getAttribute('id');
            if (id && !id.match(/\d{5,}/)) {
                return { type: 'id', val: id, element: curr };
            }
            curr = curr.parentElement;
        }
        return null;
    }

    function isUniqueCSS(sel) {
        try {
            return document.querySelectorAll(sel).length === 1;
        } catch (e) {
            return false;
        }
    }

    function isUniqueXPath(xpath) {
        try {
            const res = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            return res.snapshotLength === 1;
        } catch (e) {
            return false;
        }
    }

    function generateSmartXPath(el) {
        const tag = el.tagName.toLowerCase();
        let text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
        if (text.length > 40) text = text.substring(0, 40);
        const safeText = text.replace(/'/g, "\\'");

        // 1. Unique text-anchored XPath
        if (text && text.length > 1) {
            const xpathText = `//${tag}[normalize-space()='${safeText}']`;
            if (isUniqueXPath(xpathText)) return xpathText;
            const xpathContains = `//${tag}[contains(text(),'${safeText.substring(0, 25)}')]`;
            if (isUniqueXPath(xpathContains)) return xpathContains;
        }

        // 2. Container-anchored Scoped XPath
        const container = findNearestContainer(el);
        if (container) {
            let containerXPath = '';
            if (container.type === 'id') {
                containerXPath = `//*[@id='${container.val}']`;
            } else if (container.type === 'testid') {
                containerXPath = `//*[@${container.attr}='${container.val}']`;
            }
            if (containerXPath) {
                const scopedTag = `${containerXPath}//${tag}`;
                if (isUniqueXPath(scopedTag)) return scopedTag;
                if (text && text.length > 1) {
                    const scopedText = `${containerXPath}//${tag}[normalize-space()='${safeText}']`;
                    if (isUniqueXPath(scopedText)) return scopedText;
                }
            }
        }

        // 3. Hierarchical relative XPath from nearest ancestor with ID or data-test
        let path = '';
        let curr = el;
        while (curr && curr.nodeType === Node.ELEMENT_NODE && curr !== document.documentElement) {
            const cTag = curr.tagName.toLowerCase();
            const cId = curr.getAttribute('id');
            if (cId && !cId.match(/\d{5,}/) && isUniqueCSS(`#${CSS.escape(cId)}`)) {
                path = `//*[@id='${cId}']` + (path ? `/${path}` : '');
                if (isUniqueXPath(path)) return path;
                break;
            }
            let idx = 1;
            let sib = curr.previousElementSibling;
            while (sib) {
                if (sib.tagName.toLowerCase() === cTag) idx++;
                sib = sib.previousElementSibling;
            }
            let hasSameTagSib = false;
            let nextSib = curr.nextElementSibling;
            while (nextSib) {
                if (nextSib.tagName.toLowerCase() === cTag) { hasSameTagSib = true; break; }
                nextSib = nextSib.nextElementSibling;
            }
            const step = (idx > 1 || hasSameTagSib) ? `${cTag}[${idx}]` : cTag;
            path = path ? `${step}/${path}` : step;
            curr = curr.parentElement;
        }
        return path ? `//${path}` : `//${tag}`;
    }

    function getElementVisibleText(el) {
        if (!el) return '';
        const tag = (el.tagName || '').toLowerCase();
        if (tag === 'input') {
            const type = (el.type || 'text').toLowerCase();
            if (['submit', 'button', 'reset'].includes(type)) {
                return (el.value || '').trim();
            }
            return (el.value || el.placeholder || '').trim();
        }
        if (tag === 'textarea') {
            return (el.value || el.placeholder || '').trim();
        }
        if (tag === 'select') {
            return (el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex].text : el.value || '').trim();
        }
        return (el.innerText || el.textContent || '').trim();
    }

    function getElementAttrs(el) {
        if (!el || !el.getAttribute) return {};
        const tag = (el.tagName || '').toLowerCase();
        let labelText = '';
        try {
            if (el.id) {
                const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
                if (l) labelText = l.innerText.trim();
            }
            if (!labelText && el.closest) {
                const l = el.closest('label');
                if (l) labelText = l.innerText.trim();
            }
        } catch(e) {}

        const container = findNearestContainer(el);

        return {
            tag: tag,
            type: (el.getAttribute('type') || '').toLowerCase(),
            testid: el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-qa') || el.getAttribute('data-cy') || '',
            role: el.getAttribute('role') || '',
            ariaLabel: el.getAttribute('aria-label') || '',
            label: labelText,
            placeholder: el.getAttribute('placeholder') || '',
            alt: el.getAttribute('alt') || '',
            title: el.getAttribute('title') || '',
            idAttr: el.getAttribute('id') || '',
            nameAttr: el.getAttribute('name') || '',
            text: getElementVisibleText(el).slice(0, 80),
            containerId: container && container.type === 'id' ? container.val : '',
            containerTestId: container && container.type === 'testid' ? container.val : ''
        };
    }

    // 2. Compute Accessibility-First TestFly Locators
    function computeTestFlyLocator(el) {
        const tag = el.tagName.toLowerCase();
        let text = getElementVisibleText(el).replace(/\s+/g, ' ');
        if (text.length > 30) text = text.substring(0, 30) + '...';

        const smartXPath = generateSmartXPath(el);
        const container = findNearestContainer(el);

        // A. TestID
        for (const attr of ['data-testid', 'data-test', 'data-qa', 'data-cy']) {
            const val = el.getAttribute(attr);
            if (val) {
                return {
                    type: 'testid',
                    by: 'testid',
                    selector: val,
                    xpath: smartXPath,
                    code: `getByTestId("${val}")`,
                    display: `getByTestId("${val}")`
                };
            }
        }

        // B. Form Label (input, select, textarea)
        if (['input', 'select', 'textarea'].includes(tag)) {
            const id = el.getAttribute('id');
            if (id) {
                const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
                if (label && label.innerText.trim()) {
                    const lText = label.innerText.trim();
                    return {
                        type: 'label',
                        by: 'label',
                        selector: lText,
                        xpath: smartXPath,
                        code: `getByLabel("${lText}")`,
                        display: `getByLabel("${lText}")`
                    };
                }
            }
            const parentLabel = el.closest('label');
            if (parentLabel && parentLabel.innerText.trim()) {
                const lText = parentLabel.innerText.trim();
                return {
                    type: 'label',
                    by: 'label',
                    selector: lText,
                    xpath: smartXPath,
                    code: `getByLabel("${lText}")`,
                    display: `getByLabel("${lText}")`
                };
            }
        }

        // C. Placeholder
        const ph = el.getAttribute('placeholder');
        if (ph) {
            return {
                type: 'placeholder',
                by: 'placeholder',
                selector: ph,
                xpath: smartXPath,
                code: `getByPlaceholder("${ph}")`,
                display: `getByPlaceholder("${ph}")`
            };
        }

        // D. Unique ID
        const elId = el.getAttribute('id');
        if (elId && !elId.match(/\d{4,}/)) { // Ignore random/generated IDs like id-18492049
            if (isUniqueCSS(`#${CSS.escape(elId)}`)) {
                return {
                    type: 'id',
                    by: 'id',
                    selector: elId,
                    xpath: smartXPath,
                    code: `find(By.id("${elId}"))`,
                    display: `#${elId}`
                };
            }
        }

        // E. Accessibility Role & Accessible Name
        let role = el.getAttribute('role');
        if (!role) {
            if (tag === 'button' || (tag === 'input' && ['button', 'submit', 'reset'].includes(el.type))) role = 'button';
            else if (tag === 'a' && el.getAttribute('href')) role = 'link';
            else if (tag === 'input' && ['text', 'search', 'email', 'password', 'tel', 'url'].includes(el.type)) role = 'textbox';
            else if (tag === 'input' && el.type === 'checkbox') role = 'checkbox';
            else if (tag === 'input' && el.type === 'radio') role = 'radio';
            else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) role = 'heading';
        }

        if (role && text && text.length < 35) {
            const roleConst = role.toUpperCase();
            return {
                type: 'role',
                by: 'xpath',
                role: role,
                name: text,
                selector: smartXPath,
                xpath: smartXPath,
                code: `getByRole(Role.${roleConst}, "${text}")`,
                display: `getByRole(${roleConst}, "${text}")`
            };
        }

        // F. Container Anchoring (Scoped CSS / Scoped XPath) [NEW!]
        if (container) {
            if (container.type === 'id') {
                const scopedCss = `#${container.val} ${tag}`;
                if (isUniqueCSS(scopedCss)) {
                    return {
                        type: 'css',
                        by: 'css',
                        selector: scopedCss,
                        xpath: smartXPath,
                        code: `find("${scopedCss}")`,
                        display: scopedCss
                    };
                }
            } else if (container.type === 'testid') {
                const scopedCss = `[${container.attr}="${container.val}"] ${tag}`;
                if (isUniqueCSS(scopedCss)) {
                    return {
                        type: 'css',
                        by: 'css',
                        selector: scopedCss,
                        xpath: smartXPath,
                        code: `find("${scopedCss}")`,
                        display: scopedCss
                    };
                }
            }
        }

        // G. Name attribute
        const nameAttr = el.getAttribute('name');
        if (nameAttr && isUniqueCSS(`[name="${CSS.escape(nameAttr)}"]`)) {
            return {
                type: 'name',
                by: 'name',
                selector: nameAttr,
                xpath: smartXPath,
                code: `find(By.name("${nameAttr}"))`,
                display: `[name="${nameAttr}"]`
            };
        }

        // H. Unique Smart XPath
        if (smartXPath && isUniqueXPath(smartXPath)) {
            return {
                type: 'xpath',
                by: 'xpath',
                selector: smartXPath,
                xpath: smartXPath,
                code: `find(By.xpath("${smartXPath}"))`,
                display: smartXPath.length > 32 ? smartXPath.substring(0, 32) + '...' : smartXPath
            };
        }

        // I. Unique text
        if (text && text.length > 2 && text.length < 35) {
            return {
                type: 'text',
                by: 'xpath',
                selector: `//*[normalize-space()='${text}']`,
                xpath: smartXPath,
                code: `getByText("${text}")`,
                display: `text="${text}"`
            };
        }

        // J. CSS Selector Fallback
        let css = tag;
        if (el.className && typeof el.className === 'string') {
            const classes = el.className.trim().split(/\s+/).filter(c => !c.includes(':') && !c.includes('/'));
            if (classes.length > 0) css += `.${classes[0]}`;
        }
        if (container && container.type === 'id') {
            css = `#${container.val} ${css}`;
        }
        return {
            type: 'css',
            by: 'css',
            selector: css,
            xpath: smartXPath,
            code: `find("${css}")`,
            display: css
        };
    }

    // 3. Send Event to Recorder Server & Parent Window (PostMessage)
    function sendEvent(eventData) {
        // A. If embedded inside TestFly Studio iframe, relay immediately via postMessage
        if (window.parent && window.parent !== window) {
            try {
                window.parent.postMessage({
                    type: 'testfly_event',
                    event: eventData
                }, '*');
            } catch (e) {
                // Ignore cross-origin error if any
            }
        }

        // B. Also post to backend server
        const serverUrl = window.__TESTFLY_SERVER_URL__ || SERVER_URL;
        fetch(`${serverUrl}/api/event`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData),
            mode: 'cors'
        }).catch(() => {
            // Ignore network errors if server is closing or mixed content is blocked
        });
    }

    // 4. Toast notification in browser
    function showToast(msg, bg = '#10b981') {
        const toast = document.createElement('div');
        toast.textContent = msg;
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.backgroundColor = bg;
        toast.style.color = '#ffffff';
        toast.style.padding = '8px 16px';
        toast.style.borderRadius = '6px';
        toast.style.fontSize = '12px';
        toast.style.fontFamily = 'system-ui, sans-serif';
        toast.style.fontWeight = 'bold';
        toast.style.zIndex = '2147483647';
        toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        toast.style.pointerEvents = 'none';
        toast.style.transition = 'opacity 0.3s ease';

        document.documentElement.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 1800);
    }

    // Modal popup to confirm or edit expected text for Assert Text mode
    function showAssertTextModal(loc, attrs, defaultText, clientX, clientY) {
        const existingModal = document.getElementById('__testfly_assert_text_modal__');
        if (existingModal) existingModal.remove();
        const existingBackdrop = document.getElementById('__testfly_modal_backdrop__');
        if (existingBackdrop) existingBackdrop.remove();

        const backdrop = document.createElement('div');
        backdrop.id = '__testfly_modal_backdrop__';
        backdrop.style.position = 'fixed';
        backdrop.style.top = '0';
        backdrop.style.left = '0';
        backdrop.style.width = '100vw';
        backdrop.style.height = '100vh';
        backdrop.style.backgroundColor = 'rgba(15, 23, 42, 0.25)';
        backdrop.style.backdropFilter = 'blur(1px)';
        backdrop.style.zIndex = '2147483646';

        const modal = document.createElement('div');
        modal.id = '__testfly_assert_text_modal__';
        modal.style.position = 'fixed';
        modal.style.zIndex = '2147483647';
        modal.style.left = `${Math.min(Math.max(12, clientX - 150), window.innerWidth - 330)}px`;
        modal.style.top = `${Math.min(Math.max(12, clientY + 12), window.innerHeight - 190)}px`;
        modal.style.width = '310px';
        modal.style.backgroundColor = '#0f172a';
        modal.style.border = '1px solid #38bdf8';
        modal.style.borderRadius = '8px';
        modal.style.boxShadow = '0 12px 30px rgba(0,0,0,0.7)';
        modal.style.fontFamily = 'system-ui, -apple-system, sans-serif';
        modal.style.color = '#f8fafc';
        modal.style.padding = '12px 14px';
        modal.style.boxSizing = 'border-box';

        modal.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span style="font-size:12px;font-weight:700;color:#38bdf8;display:flex;align-items:center;gap:6px;">
                    <span>📝</span><span>Assert Text</span>
                </span>
                <button id="__tf_close_modal__" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px;line-height:1;padding:0 2px;">×</button>
            </div>
            <div style="font-size:11px;color:#94a3b8;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${loc.display || loc.code}
            </div>
            <input id="__tf_text_input__" type="text" value="${(defaultText || '').replace(/"/g, '&quot;')}" style="width:100%;box-sizing:border-box;background:#1e293b;border:1px solid #475569;border-radius:4px;color:#f8fafc;padding:6px 8px;font-size:12px;font-family:ui-monospace, monospace;outline:none;margin-bottom:8px;" />
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <label style="font-size:11px;color:#cbd5e1;cursor:pointer;display:flex;align-items:center;gap:6px;user-select:none;">
                    <input id="__tf_exact_check__" type="checkbox" checked style="cursor:pointer;" />
                    <span>Exact match (hasText)</span>
                </label>
            </div>
            <div style="display:flex;gap:6px;justify-content:flex-end;">
                <button id="__tf_cancel_btn__" style="background:#334155;color:#cbd5e1;border:none;border-radius:4px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;">Cancel</button>
                <button id="__tf_confirm_btn__" style="background:#10b981;color:#ffffff;border:none;border-radius:4px;padding:5px 12px;font-size:11px;font-weight:600;cursor:pointer;">Record Assertion</button>
            </div>
        `;

        document.documentElement.appendChild(backdrop);
        document.documentElement.appendChild(modal);

        const input = document.getElementById('__tf_text_input__');
        const exactCheck = document.getElementById('__tf_exact_check__');
        const confirmBtn = document.getElementById('__tf_confirm_btn__');
        const cancelBtn = document.getElementById('__tf_cancel_btn__');
        const closeBtn = document.getElementById('__tf_close_modal__');

        input.focus();
        input.select();

        function close(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            modal.remove();
            backdrop.remove();
            switchBackToRecord();
        }

        function confirm(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            const textVal = input.value;
            const isExact = exactCheck.checked;
            sendEvent({
                action: 'assert_text',
                selector: loc.selector,
                by: loc.by,
                xpath: loc.xpath,
                locator_type: loc.type,
                code: loc.code,
                expected: textVal,
                exact: isExact,
                target_desc: loc.display,
                attrs: attrs
            });
            showToast(`✓ Recorded text assertion: "${textVal}"`, '#10b981');
            modal.remove();
            backdrop.remove();
            switchBackToRecord();
        }

        backdrop.onclick = close;
        confirmBtn.onclick = confirm;
        cancelBtn.onclick = close;
        closeBtn.onclick = close;

        modal.addEventListener('click', (ev) => ev.stopPropagation());
        modal.addEventListener('mousedown', (ev) => ev.stopPropagation());

        input.onkeydown = (ev) => {
            ev.stopPropagation();
            if (ev.key === 'Enter') {
                ev.preventDefault();
                confirm(ev);
            } else if (ev.key === 'Escape') {
                ev.preventDefault();
                close(ev);
            }
        };
    }

    // Interactive Locator Inspection Overlay
    let inspectHighlightBox = null;
    let inspectCountBadge = null;

    function clearInspectHighlight() {
        if (inspectHighlightBox) {
            inspectHighlightBox.style.display = 'none';
        }
    }

    function highlightMatchingElements(query) {
        if (!query || !query.trim()) {
            clearInspectHighlight();
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'testfly_inspect_result', query: '', count: 0 }, '*');
            }
            return;
        }

        query = query.trim();
        let matchedElements = [];

        try {
            if (query.startsWith('//') || query.startsWith('(') || query.startsWith('./')) {
                // XPath evaluation
                const snapshot = document.evaluate(query, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                for (let i = 0; i < snapshot.snapshotLength; i++) {
                    matchedElements.push(snapshot.snapshotItem(i));
                }
            } else {
                // CSS evaluation
                matchedElements = Array.from(document.querySelectorAll(query));
            }
        } catch (e) {
            // Invalid selector syntax while typing
            matchedElements = [];
        }

        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'testfly_inspect_result',
                query: query,
                count: matchedElements.length
            }, '*');
        }

        if (matchedElements.length === 0) {
            clearInspectHighlight();
            return;
        }

        // Highlight first matched element
        const firstEl = matchedElements[0];
        if (!inspectHighlightBox) {
            inspectHighlightBox = document.createElement('div');
            inspectHighlightBox.id = '__testfly_inspect_box__';
            inspectHighlightBox.style.position = 'fixed';
            inspectHighlightBox.style.pointerEvents = 'none';
            inspectHighlightBox.style.zIndex = '2147483646';
            inspectHighlightBox.style.border = '2px dashed #f59e0b';
            inspectHighlightBox.style.backgroundColor = 'rgba(245, 158, 11, 0.2)';
            inspectHighlightBox.style.borderRadius = '4px';
            inspectHighlightBox.style.boxSizing = 'border-box';

            inspectCountBadge = document.createElement('div');
            inspectCountBadge.style.position = 'absolute';
            inspectCountBadge.style.bottom = '-22px';
            inspectCountBadge.style.right = '0';
            inspectCountBadge.style.backgroundColor = '#78350f';
            inspectCountBadge.style.color = '#fef3c7';
            inspectCountBadge.style.padding = '2px 6px';
            inspectCountBadge.style.borderRadius = '3px';
            inspectCountBadge.style.fontSize = '10px';
            inspectCountBadge.style.fontFamily = 'ui-monospace, monospace';
            inspectCountBadge.style.fontWeight = 'bold';

            inspectHighlightBox.appendChild(inspectCountBadge);
            document.documentElement.appendChild(inspectHighlightBox);
        }

        const rect = firstEl.getBoundingClientRect();
        inspectHighlightBox.style.display = 'block';
        inspectHighlightBox.style.top = `${rect.top}px`;
        inspectHighlightBox.style.left = `${rect.left}px`;
        inspectHighlightBox.style.width = `${rect.width}px`;
        inspectHighlightBox.style.height = `${rect.height}px`;
        inspectCountBadge.textContent = `${matchedElements.length} match${matchedElements.length > 1 ? 'es' : ''}`;

        firstEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // 5. Global Event Listeners with Deep Sub-Target & Text Node Precision
    let lastMoveTime = 0;
    let currentResolvedTarget = null;

    document.addEventListener('mousemove', (e) => {
        if (currentMode === 'pause') return;
        if (isTestFlyUI(e.target)) {
            updateOverlay(null);
            currentResolvedTarget = null;
            return;
        }
        const now = Date.now();
        if (now - lastMoveTime < 35) return; // ~30fps throttle
        lastMoveTime = now;

        currentResolvedTarget = resolveTargetAt(e.clientX, e.clientY, e.target);
        updateOverlay(currentResolvedTarget);
    }, true);

    document.addEventListener('mouseout', (e) => {
        if (isTestFlyUI(e.target)) return;
        if (currentResolvedTarget && e.target === currentResolvedTarget.element) {
            updateOverlay(null);
            currentResolvedTarget = null;
        }
    }, true);

    document.addEventListener('click', (e) => {
        if (currentMode === 'pause') return;
        if (isTestFlyUI(e.target)) return;

        try {
            const resolved = resolveTargetAt(e.clientX, e.clientY, e.target) || currentResolvedTarget;
            const target = resolved ? resolved.element : (e.target.closest('a, button, input, select, textarea, [role="button"]') || e.target);
            const loc = resolved ? resolved.info : computeTestFlyLocator(target);
            const attrs = getElementAttrs(target);
            if (resolved && resolved.text) {
                attrs.text = resolved.text;
            }

            // A. Pick Locator Mode
            if (currentMode === 'pick_locator') {
                e.preventDefault();
                e.stopPropagation();
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(loc.code);
                }
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'testfly_picked_locator',
                        code: loc.code,
                        display: loc.display,
                        selector: loc.selector,
                        xpath: loc.xpath
                    }, '*');
                }
                showToast(`📋 Copied: ${loc.code}`, '#f59e0b');
                switchBackToRecord();
                return;
            }

            // B. Assert Visible Mode
            if (currentMode === 'assert_visible') {
                e.preventDefault();
                e.stopPropagation();
                sendEvent({
                    action: 'assert_visible',
                    selector: loc.selector,
                    by: loc.by,
                    xpath: loc.xpath,
                    locator_type: loc.type,
                    code: loc.code,
                    target_desc: loc.display,
                    attrs: attrs
                });
                showToast(`✓ Recorded assertion: ${loc.display} is visible`, '#10b981');
                switchBackToRecord();
                return;
            }

            // C. Assert Text Mode
            if (currentMode === 'assert_text') {
                e.preventDefault();
                e.stopPropagation();
                const textVal = (resolved && resolved.text) ? resolved.text : getElementVisibleText(target);
                showAssertTextModal(loc, attrs, textVal, e.clientX, e.clientY);
                return;
            }

            // D. Assert Enabled / Disabled Mode
            if (currentMode === 'assert_enabled') {
                e.preventDefault();
                e.stopPropagation();
                const isDisabled = target && (target.disabled || target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true' || target.classList.contains('disabled'));
                const actionName = isDisabled ? 'assert_disabled' : 'assert_enabled';
                sendEvent({
                    action: actionName,
                    selector: loc.selector,
                    by: loc.by,
                    xpath: loc.xpath,
                    locator_type: loc.type,
                    code: loc.code,
                    target_desc: loc.display,
                    attrs: attrs
                });
                showToast(isDisabled ? `✓ Recorded assertion: ${loc.display} is disabled` : `✓ Recorded assertion: ${loc.display} is enabled`, isDisabled ? '#f59e0b' : '#10b981');
                switchBackToRecord();
                return;
            }

            // E. Link navigation in embedded mode
            const link = target.closest('a');
            if (link && link.href && !link.href.startsWith('javascript:') && !link.href.startsWith('#')) {
                if (window.parent && window.parent !== window) {
                    e.preventDefault();
                    e.stopPropagation();
                    sendEvent({
                        action: 'click',
                        selector: loc.selector,
                        by: loc.by,
                        xpath: loc.xpath,
                        locator_type: loc.type,
                        code: loc.code,
                        target_desc: loc.display,
                        attrs: attrs
                    });
                    window.parent.postMessage({
                        type: 'testfly_navigate',
                        url: link.href
                    }, '*');
                    return;
                }
            }

            // E. Normal Recording: Click
            sendEvent({
                action: 'click',
                selector: loc.selector,
                by: loc.by,
                xpath: loc.xpath,
                locator_type: loc.type,
                code: loc.code,
                target_desc: loc.display,
                attrs: attrs
            });
        } catch (err) {
            console.error('[TestFly] Error recording click:', err);
        }
    }, true);

    // Input / Change listener (debounced & coalesced)
    document.addEventListener('input', (e) => {
        if (currentMode !== 'record') return;
        if (isTestFlyUI(e.target)) return;
        try {
            const target = e.target;
            if (!['input', 'textarea'].includes(target.tagName.toLowerCase())) return;
            const loc = computeTestFlyLocator(target);
            const attrs = getElementAttrs(target);
            const val = target.value;

            if (inputTimeout) clearTimeout(inputTimeout);
            inputTimeout = setTimeout(() => {
                sendEvent({
                    action: 'type_text',
                    selector: loc.selector,
                    by: loc.by,
                    xpath: loc.xpath,
                    locator_type: loc.type,
                    code: loc.code,
                    text: val,
                    target_desc: loc.display,
                    attrs: attrs
                });
            }, 450);
        } catch (err) {
            console.error('[TestFly] Error recording input:', err);
        }
    }, true);

    document.addEventListener('change', (e) => {
        if (currentMode !== 'record') return;
        if (isTestFlyUI(e.target)) return;
        try {
            const target = e.target;
            const tag = target.tagName.toLowerCase();
            if (['input', 'textarea'].includes(tag)) {
                if (inputTimeout) clearTimeout(inputTimeout);
                const loc = computeTestFlyLocator(target);
                const attrs = getElementAttrs(target);
                sendEvent({
                    action: 'type_text',
                    selector: loc.selector,
                    by: loc.by,
                    xpath: loc.xpath,
                    locator_type: loc.type,
                    code: loc.code,
                    text: target.value,
                    target_desc: loc.display,
                    attrs: attrs
                });
            }
        } catch (err) {
            console.error('[TestFly] Error recording change:', err);
        }
    }, true);

    // Select change listener
    document.addEventListener('change', (e) => {
        if (currentMode !== 'record') return;
        if (isTestFlyUI(e.target)) return;
        const target = e.target;
        if (target.tagName.toLowerCase() === 'select') {
            const loc = computeTestFlyLocator(target);
            const attrs = getElementAttrs(target);
            const selectedText = target.options[target.selectedIndex]?.text || target.value;
            sendEvent({
                action: 'select_option',
                selector: loc.selector,
                by: loc.by,
                xpath: loc.xpath,
                locator_type: loc.type,
                code: loc.code,
                text: selectedText,
                target_desc: loc.display,
                attrs: attrs
            });
        }
    }, true);

    // Initial page load navigation event
    const initialUrl = window.__TESTFLY_ORIGINAL_URL__ || window.location.href;
    if (initialUrl && !initialUrl.startsWith('chrome://') && !initialUrl.includes('/proxy?url=')) {
        sendEvent({
            action: 'navigate',
            url: initialUrl
        });
    }

    // 6. Listen for instant mode updates and inspector queries from parent window (Embedded Mode)
    window.addEventListener('message', (e) => {
        if (!e.data || typeof e.data !== 'object') return;
        if (e.data.type === 'testfly_set_mode') {
            currentMode = e.data.mode;
            if (lastTarget) updateOverlay(lastTarget);
            if (currentMode === 'pause') updateOverlay(null);
        }
        if (e.data.type === 'testfly_inspect_locator') {
            highlightMatchingElements(e.data.locator);
        }
    });

    // 7. Polling for Recorder Mode changes from server (External Browser Mode)
    const pollServerUrl = window.__TESTFLY_SERVER_URL__ || SERVER_URL;
    setInterval(() => {
        fetch(`${pollServerUrl}/api/mode`)
            .then(res => res.json())
            .then(data => {
                if (data.mode && data.mode !== currentMode) {
                    currentMode = data.mode;
                    if (lastTarget) updateOverlay(lastTarget);
                    if (currentMode === 'pause') updateOverlay(null);
                }
            })
            .catch(() => {});
    }, 500);

    console.log('✈️ TestFly Injected Recorder active.');
})();

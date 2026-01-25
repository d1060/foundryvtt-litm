export default class V2 {
    static async updateHeader(doc, scale) {
		const { header, close } = doc.window;

        const documentIdLink = header.querySelector("button.fa-passport.icon");
        if (documentIdLink) {
            if (!documentIdLink.classList.contains("document-id-link"))
                documentIdLink.classList.add("document-id-link");
        }

		if (header.querySelector(".litm--sheet-scale-button")) return;

		const resize = document.createElement("a");
		resize.classList.add("header-button");
		resize.classList.add("control");
		resize.classList.add("litm--sheet-scale-button");
		resize.dataset.tooltip = game.i18n.localize('Litm.ui.header-resize');
		resize.innerHTML = `<i class="fas fa-arrows-alt-h"></i>`;
        if (scale) {
            resize.innerHTML = `<i class="fas fa-arrows-alt-h" data-scale="${scale}"></i>`;
        }

		header.insertBefore(resize, close);
	}

	static activateListeners(doc, html) {
        const button = html.querySelector(".litm--sheet-scale-button");
        if (button) {
            button.addEventListener("pointerdown", V2._scale.bind(V2, doc));
        }

        html.querySelectorAll("[data-size-input]").forEach(el => {
            this._elementSizeToText(el);
            el.addEventListener("input", V2._sizeInput.bind(V2, doc));
        });
    }

    static _sizeInput(app, event) {
        const input = event.currentTarget;
        this._elementSizeToText(input);
    }

    static _elementSizeToText(input) {
        // Create (or reuse) a canvas
        const canvas = this._measureCanvas ??= document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        // Get the exact font used by the input
        const style = getComputedStyle(input);
        ctx.font = `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} / ${style.lineHeight} ${style.fontFamily}`;

        // Measure text
        const text = input.value || input.placeholder || "";
        const metrics = ctx.measureText(text.toUpperCase());
        const width = metrics.actualBoundingBoxRight - metrics.actualBoundingBoxLeft;

        // Add padding + caret room
        const padding =
            parseFloat(style.paddingLeft) +
            parseFloat(style.paddingRight) +
            6; // caret breathing room

        input.style.width = `${Math.ceil(width + padding)}px`;
    }

    static _scale(app, event) {
        event.preventDefault();
        event.stopPropagation();

        // IMPORTANT: use currentTarget (the button you bound the listener to)
        const button = event.target;

        // Pointer capture only works with pointer events
        if (event.pointerId == null || typeof button.setPointerCapture !== "function") return;

        // Cache the form once so we don't depend on event.target during dragging
        const form = button.closest("form") ?? app.element?.[0]?.querySelector?.("form");
        if (!form) return;

        let currentScale = parseFloat(button.dataset.scale ?? "1");
        if (!Number.isFinite(currentScale)) currentScale = 1;

        const clampValue = (current, delta) => {
            const value = current + delta / 500;
            return Math.max(0.3, Math.min(3, value));
        };

        let previousX = event.screenX;

        const onMove = (e) => {
            // We keep getting these even if the pointer leaves the button/app
            const delta = e.screenX - previousX;
            previousX = e.screenX;

            currentScale = clampValue(currentScale, delta);
            form.style.transform = `scale(${currentScale})`;
        };

        const finish = (e) => {
            button.removeEventListener("pointermove", onMove);
            button.removeEventListener("pointerup", finish);
            button.removeEventListener("pointercancel", finish);

            try { button.releasePointerCapture(event.pointerId); } catch (_) {}

            button.dataset.scale = String(currentScale);

            app.setPosition({ scale: currentScale });

            const prefs = game.settings.get("foundryvtt-litm", "user_prefs");
            if (prefs.sheetViewTags == null || !prefs.sheetViewTags)
                prefs.sheetViewTags = {};

            if (prefs.sheetViewTags[app.options.document._id] == null)
                prefs.sheetViewTags[app.options.document._id] = {};

            prefs.sheetViewTags[app.options.document._id].scale = currentScale;
            game.settings.set("foundryvtt-litm", "user_prefs", prefs);
        };

        // Capture the pointer so moves/ups keep firing on *this button*
        button.setPointerCapture(event.pointerId);

        // Listen on the button (captured), not on document
        button.addEventListener("pointermove", onMove);
        button.addEventListener("pointerup", finish);
        button.addEventListener("pointercancel", finish);
    }
}
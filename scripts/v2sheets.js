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

    static async updateResizeHandle(doc) {
		const resizeHandle = doc.element.querySelector("div.window-resize-handle");
		if (resizeHandle) {
			if (resizeHandle.innerHTML == '') {
				resizeHandle.innerHTML = '<i inert class="fa-solid fa-left-right fa-rotate-by"></i>';
			}
		}
    }

	static activateListeners(doc, html) {
        const button = html.querySelector(".litm--sheet-scale-button");
        if (button) {
            button.addEventListener("pointerdown", V2._scale.bind(V2, doc));
        }

        html.querySelectorAll("[data-size-input]").forEach(el => {
            el.style.width = `${Math.ceil(Math.max(el.value.length * 1.5, 6))}ch`;
            el.addEventListener("input", V2._sizeInput.bind(V2, doc));
        });
    }

    static _sizeInput(app, event) {
        const input = event.currentTarget;

        // Create (or reuse) a canvas
        const canvas = this._measureCanvas ??= document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        // Get the exact font used by the input
        const style = getComputedStyle(input);
        ctx.font = `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} / ${style.lineHeight} ${style.fontFamily}`;

        // Measure text
        const text = input.value || input.placeholder || "";
        const metrics = ctx.measureText(text.toUpperCase());

        // Add padding + caret room
        const padding =
            parseFloat(style.paddingLeft) +
            parseFloat(style.paddingRight) +
            10; // caret breathing room

        input.style.width = `${Math.ceil(metrics.width + padding)}px`;
    }

    static _scale(app, event) {
        event.preventDefault();
        event.stopPropagation();
        let currentScale = event.target.dataset.scale;
        if (currentScale == null) currentScale = '1';
        currentScale = parseFloat(currentScale);

        const eventNames =
            event.type === "pointerdown"
                ? ["pointermove", "pointerup"]
                : ["mousemove", "mouseup"];

        let previousX = event.screenX;
        let delta = 0;

        const clampValue = (current, delta) => {
            const value = current + delta / 500;
            return Math.max(0.3, Math.min(3, value));
        };

        const mousemove = (event) => {
            delta = event.screenX - previousX;
            previousX = event.screenX;
            currentScale = clampValue(currentScale, delta);

            if (typeof event.target.closest == 'function')
            {
                const el = event.target.closest("form");
                if (!el) return;
                el.style.transform = `scale(${currentScale})`;
            }
        };

        const mouseup = () => {
            document.removeEventListener(eventNames[0], mousemove);
            document.removeEventListener(eventNames[1], mouseup);
            event.target.dataset.scale = currentScale;

            app.setPosition({scale: currentScale});

            if (app.options?.document?.type == 'character') {
                app.options.document.update({"system.scale" : currentScale});
            }
        };

        document.addEventListener(eventNames[0], mousemove);
        document.addEventListener(eventNames[1], mouseup);
    }

    static _storeScrollPositions(app) {
        app._scrollPositions = {};
        for (const el of app.element.querySelectorAll("[data-scroll]")) {
            app._scrollPositions[el.dataset.scroll] = el.scrollTop;
        }
    }

    static _restoreScrollPositions(app) {
        if (!app._scrollPositions) return;

        for (const el of app.element.querySelectorAll("[data-scroll]")) {
            const pos = app._scrollPositions[el.dataset.scroll];
            if (pos !== undefined) el.scrollTop = pos;
        }

        app._scrollPositions = null;
    }
}
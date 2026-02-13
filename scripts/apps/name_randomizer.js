import Randomizer from './randomizer.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api
export default class NameRandomizer extends HandlebarsApplicationMixin(ApplicationV2) {
	#dragDrop

    constructor(options = {}) {
		super({}, options);
        this.selected_culture = null;
        this.amountToGenerate = 20;
		this.#dragDrop = this.#createDragDropHandlers();
    }

	/** @inheritdoc */
	static DEFAULT_OPTIONS = {
    	tag: "form",
		classes: ["app", "window-app", "litm", "themed", "theme-light", "litm--name-generator"],
		position: {
			width: 390,
			height: "auto",
            left: 17,
            top: 400
  		},
		window: {
			resizable: true,
    		title: "Litm.ui.name-randomizer-title",
			controls: [],
  		},
		form: {
			handler: this.#onSubmit,
    		closeOnSubmit: false,
		    submitOnChange: true,
  		},
		actions: {
            doRefresh: this.#doRefresh
		},
		dragDrop: [{dragSelector: "[data-drag]", dropSelector: "form"}],
  	}

	/** @inheritdoc */
	static PARTS = {
		form: { template: "systems/foundryvtt-litm/templates/apps/name-randomizer.html" }
	}

	async getTitle() {
	    return game.i18n.localize("Litm.ui.name-randomizer-title");
	}

	async _onRender(force, options) {
        super._onRender(context, options);

		this.#dragDrop.forEach((d) => d.bind(this.element));

        const el = this.element;
        if (el && !el.dataset.litmDragHooked) {
            el.dataset.litmDragHooked = "1";
            const header = el.querySelector(".window-header") ?? el;
            header.addEventListener("pointerup", () => this._saveWindowPosition(), { passive: true });
            window.addEventListener("mouseup", () => this._saveWindowPosition(), { passive: true });
        }
	}

    async _saveWindowPosition() {
        const el = this.element;
        if (!el) return;

        // Read actual pixel position from DOM (most reliable)
        const rect = el.getBoundingClientRect();
        const left = Math.round(rect.left);
        const top  = Math.round(rect.top);

        // Debounce so we don’t spam settings writes
        clearTimeout(this._savePosT);
        this._savePosT = setTimeout(async () => {
            const prefs = foundry.utils.deepClone(
                game.settings.get("foundryvtt-litm", "user_prefs") ?? {}
            );

            prefs.nameRandomizer ??= {};
            prefs.nameRandomizer.position = { left, top };

            await game.settings.set("foundryvtt-litm", "user_prefs", prefs);
        }, 150);
    }

	/** @override */
	async _prepareContext(options) {
        const prefs = game.settings.get("foundryvtt-litm", "user_prefs") ?? {};
        const pos = prefs.nameRandomizer?.position;
        if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
            // Viewport size
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            // Window size: use known position width/height if set, else fallback
            const w = Number.isFinite(this.position.width) ? this.position.width : 420;
            const h = Number.isFinite(this.position.height) ? this.position.height : 300;

            // Leave a small margin so it’s not flush to edges
            const margin = 5;

            const minLeft = margin;
            const minTop  = margin;

            const maxLeft = Math.max(minLeft, vw - w - margin);
            const maxTop  = Math.max(minTop,  vh - h - margin);

            this.position.left = Math.min(maxLeft, Math.max(minLeft, pos.left));
            this.position.top  = Math.min(maxTop,  Math.max(minTop,  pos.top));
        }

        const context = {};
        context.cultures = Object.keys(Randomizer.name_chains.cultures).sort((a, b) => a.localeCompare(b));
        if (!this.selected_culture)
            this.selected_culture = "west slavic";
        context.selected_culture = this.selected_culture;

        context.male_names = [];
        context.female_names = [];

        for (let i = 0; i < this.amountToGenerate; i++) {
            let culture_name_m = Randomizer.generateCulturalName([this.selected_culture], 'male');
            let culture_name_f = Randomizer.generateCulturalName([this.selected_culture], 'female');

            if (culture_name_m.endsWith("a")) {
                culture_name_m = culture_name_m.slice(0, -1);
            }

            context.male_names.push(culture_name_m);
            context.female_names.push(culture_name_f);
        }

        context.male_names.sort();
        context.female_names.sort();
        return context;
    }

	static async #onSubmit(event, target) {
        if (event.target.name == "name-generator-culture") {
            this.selected_culture = event.target.value;
        }
        this.render();
    }

    static async #doRefresh(event, target) {
        this.render();
    }

	#createDragDropHandlers() {
		return this.options.dragDrop.map((d) => {
			d.permissions = {
				dragstart: this._canDragStart.bind(this),
				drop: this._canDragDrop.bind(this)
			};
			d.callbacks = {
				dragstart: this._onDragStart.bind(this),
				drop: this._onDrop.bind(this)
			};
			return new foundry.applications.ux.DragDrop(d);
		})
	}

	/** @inheritdoc */
	// Only GM can drop actors onto the board
	_canDragDrop() {
		return true;
	}

	/** @inheritdoc */
	_canDragStart() {
		return true;
	}

	/** @override */
	async _onDragStart(event) {
		const li = event.currentTarget;
		const payload = {
			type: "randomName",
			id: foundry.utils.randomID(),
			name: li.dataset.value,
		};

		if (payload.values != '') payload.isBurnt = 'false';

		event.dataTransfer.setData("text/plain", JSON.stringify(payload));
		event.dataTransfer.setData("application/json", JSON.stringify(payload));		
	}

	async _onDrop(dragEvent) {

    }
}
import V2 from "../v2sheets.js";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api
export default class ExternalTextEditor extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(options = {}) {
		super(options);

        this.target = options.target;
        this.improvement = options.improvement;
        this.value = options.value;
        this.document = options.document;
        this[this.target] = this.value;
        this.callback = options.callback;
	}

	/** @inheritdoc */
	static DEFAULT_OPTIONS = {
    	tag: "form",
		classes: ["app", "window-app", "litm", "litm--editor", "themed", "theme-light"],
		position: {
			width: 512,
			height: 512,
  		},
		window: {
			resizable: true,
    		title: "",
			controls: [],
  		},
		form: {
			handler: this.#onSubmit,
    		closeOnSubmit: true,
		    submitOnChange: true,
  		},
		actions: {
		},
		dragDrop: [{dropSelector: "form"}],
  	}

	/** @inheritdoc */
	static PARTS = {
		form: { template: "systems/foundryvtt-litm/templates/apps/text-editor.html" }
	}

	/** @override */
	async _prepareContext(options) {
        const context = {
            name: this.improvement?.name,
            description: this.improvement?.description,
			value: this.value,
			target: this.target,
        };

        return context;
    }

    async _onRender(force, options) {
		await super._onRender(force, options);
        await V2.updateHeader(this);
        await V2.updateResizeHandle(this);
        await this.activateListeners(this.element);
    }

	activateListeners(html) {
        V2.activateListeners(this, html);
	}

	static async #onSubmit(event, target) {

        if (this.callback) {
            this.callback({value: event.target.value, target: this.target});
        }

        if (this.document) {
            this.document.update({[this.target]: event.target.value});
        }
	}
}
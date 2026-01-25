import V2 from "../../v2sheets.js";
import { confirmDelete, localize as t } from "../../utils.js";

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ItemSheetV2 } = foundry.applications.sheets
export class BackpackSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
	constructor(options) {
		super(options);
	}

	/** @inheritdoc */
	static DEFAULT_OPTIONS = {
    	tag: "form",
		classes: ["app", "window-app", "litm", "litm--backpack", "themed", "theme-light"],
		position: {
			width: 400,
			height: 450,
  		},
		window: {
			resizable: true,
    		title: "",
			controls: [],
			scrollY: [".taglist"],
  		},
		form: {
			handler: this.#onSubmit,
    		closeOnSubmit: false,
		    submitOnChange: true,
  		},
		actions: {
			activateTag: this.#onActivateTag,
			burnTag: this.#onBurnTag,
		}
  	}

	/** @inheritdoc */
	static PARTS = {
		form: { template: "systems/foundryvtt-litm/templates/item/backpack.html" }
	}

	get system() {
		return this.item.system;
	}

	/** @override */
	async _prepareContext(options) {
		return {
			backpack: this.system.contents,
			name: this.item.name
		};
	}

	async _onRender(force, options) {
		await super._onRender(force, options);
		await V2.updateHeader(this);
		await this.activateListeners(this.element);
	}

	activateListeners(html) {
		html = html instanceof HTMLElement ? html : html[0];

		html.querySelectorAll("[data-click]")
			.forEach(el => el.addEventListener("click", this._onClick.bind(this)));

		html.querySelectorAll("[data-context]")
			.forEach(el => el.addEventListener("contextmenu", this._onContext.bind(this)));

		V2.activateListeners(this, html);
	}

	static async #onSubmit(event, form, formData) {
		//event.preventDefault();
		const name = event.target.name;
		if (name.startsWith('system.contents')) {
			const contents = structuredClone(this.system.contents);;
			const nameParts = name.split('.');
			if (nameParts?.length >= 3) {
				const nameIndex = parseInt(nameParts[2]);
				contents[nameIndex].name = event.target.value;
			}
			await this.system.parent.update({"system.contents": contents});
		}

		const app = this;

		const data = app._getSubmitData(formData);

		if (app.object) {
			await app.object.update(data);
		}
	}

	/** @override */
	_getSubmitData(formData, updateData) {
		let data = formData.object;

		if (updateData) {
			data = foundry.utils.flattenObject(
			foundry.utils.mergeObject(data, updateData),
			);
		}

		return data;
	}

	_onClick(event) {
		const button = event.currentTarget;
		const action = button.dataset.click;

		switch (action) {
			case "add-tag":
				this.#addTag();
				break;
		}
	}

	_onContext(event) {
		const button = event.currentTarget;
		const action = button.dataset.context;

		switch (action) {
			case "remove-tag":
				this._removeTag(button);
				break;
		}
	}

	#addTag() {
		const item = {
			name: t("Litm.ui.name-tag"),
			isActive: false,
			isBurnt: false,
			type: "backpack",
			id: foundry.utils.randomID(),
		};

		const contents = this.system.contents;
		contents.push(item);

		return this.item.update({ "system.contents": contents });
	}

	async _removeTag(button) {
		if (!(await confirmDelete("Litm.other.tag"))) return;

		const index = button.dataset.id;
		const contents = this.system.contents;
		contents.splice(index, 1);

		return this.item.update({ "system.contents": contents });
	}

	static async #onActivateTag(event, target) {
		event.preventDefault();
		console.log(`BackpackSheet #onActivateTag`);

		const key = event.target.dataset.key;
		const index = parseInt(key);
		const checked = event.target.checked;
		const contents = structuredClone(this.system.contents);;
		if (contents?.length > index) {
			contents[index].isActive = checked;
		}
		await this.system.parent.update({'system.contents': contents});
	}

	static async #onBurnTag(event, target) {
		event.preventDefault();
		console.log(`BackpackSheet #onBurnTag`);

		const key = event.target.dataset.key;
		const index = parseInt(key);
		const checked = event.target.checked;
		const contents = structuredClone(this.system.contents);;

		if (contents?.length > index) {
			contents[index].isBurnt = checked;
		}
		await this.system.parent.update({'system.contents': contents});
	}
}

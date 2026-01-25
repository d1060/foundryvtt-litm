import V2 from "../../v2sheets.js";
import { confirmDelete, localize as t } from "../../utils.js";

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ItemSheetV2 } = foundry.applications.sheets
export class ThreatSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
	isEditing = false;

	constructor(options) {
		super(options);
	}

	/** @inheritdoc */
	static DEFAULT_OPTIONS = {
    	tag: "form",
		classes: ["app", "window-app", "litm", "litm--threat", "themed", "theme-light"],
		position: {
			width: 412,
			height: 231,
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
			addConsequence: this.#onAddConsequence,
			toggleEdit: this.#onToggleEdit
		}
  	}

	/** @inheritdoc */
	static PARTS = {
		form: { template: "systems/foundryvtt-litm/templates/item/threat.html" }
	}

	get effects() {
		return this.item.effects;
	}

	get system() {
		return this.item.system;
	}

	/** @override */
	async _prepareContext(options) {
		let { data, ...rest } = super._prepareContext(options);

		if (data == null) {
			data = { system: {} };
		} else if (data.system == null) {
			data.system = {};
		}

		data.name = this.options.document.name;
		data.system.consequences = this.options.document.system.consequences;
		data.id = this.options.document.id;

		if (!this.isEditing)
		{
			if (data.system.consequences) {
				data.system.consequences = await Promise.all(
					data.system.consequences.map((c) => foundry.applications.ux.TextEditor.implementation.enrichHTML(c)),
				);
			}
		}

		return {
			...rest,
			data,
			isEditing: this.isEditing,
		};
	}

	async _onRender(force, options) {
		await super._onRender(force, options);
		await V2.updateHeader(this);
		await V2.updateResizeHandle(this);
		await this.activateListeners(this.element);
	}

	activateListeners(html) {
		html = html instanceof HTMLElement ? html : html[0];

		// contextmenu handlers
		html.querySelectorAll("[data-context]").forEach(el => el.addEventListener("contextmenu", this._handleContextMenu.bind(this)));

		html.querySelectorAll("span[contenteditable]")
			.forEach(span => {
				span.addEventListener("keydown", ev => {
					if (ev.key === "Enter") {
						ev.preventDefault();
						this._setConsequence(ev);
					}
				});

				// Optional: submit also when clicking away
				span.addEventListener("blur", (ev) => {this._setConsequence(ev)});
		});

		const editable = Array.from(html.querySelectorAll("[contenteditable]"))
			.find(el => el.nextElementSibling?.id === "consequence");

		if (editable) editable.focus();

		V2.activateListeners(this, html);
	}

	static async #onSubmit(event, form, formData) {
		event.preventDefault();

		const app  = this;
		const item = app.item ?? app.object; // depending on how your sheet is structured	
		if (!item) return;

		// formData is a FormDataExtended; its .object is the flat form data
		const data = formData.object;

		// This replaces super._updateObject(event, formData)
		const res = await item.update(data);

		// Same guard as before, using the flat form data
		if (!data["system.consequences.0"]) return res;

		// Delete existing tags and statuses
		if (app.effects?.length) {
			await item.deleteEmbeddedDocuments(
				"ActiveEffect",
				app.effects.map(e => e._id ?? e.id),
			);
		}

		// Use the *updated* system data from the item
		const consequences = item.system.consequences ?? [];
		const matches = consequences.flatMap((string) =>
			Array.from(string.matchAll(CONFIG.litm.tagStringRe)),
		);

		// Create new tags and statuses
		await item.createEmbeddedDocuments(
			"ActiveEffect",
			matches.map(([_, tag, status]) => {
				const type = status !== undefined ? "status" : "tag";
				return {
					name: tag,
					label: tag,
					flags: {
						"foundryvtt-litm": { type },
					},
					changes: [
					{
						key: type === "tag" ? "TAG" : "STATUS",
						mode: 0,
						value: type === "tag" ? 1 : status,
					},
					],
				};
			}),
		);

		return res;
	}

	_handleContextMenu(event) {
		event.preventDefault();
		const { context } = event.currentTarget.dataset;
		switch (context) {
			case "remove-consequence":
				this._removeConsequence(event);
				break;
		}
	}

	static async #onAddConsequence(event, target) {
		this.isEditing = false;
		await this.submit(new Event("submit"));

		const consequences = this.system.consequences;
		consequences.push(t("Litm.ui.name-consequence"));
		this.item.update({ "system.consequences": consequences });
	}

	_setConsequence(event) {
		let { id, input } = event.target.dataset;
		id = parseInt(id);
		const innerHTML = event.target.innerHTML;

		this.isEditing = false;
		switch (input) {
			case 'threat':
				this.options.document.update({"name": innerHTML});
				break;
			case 'consequence':
				const consequences = structuredClone(this.options.document.system.consequences);
				if (consequences?.length > id) {
					consequences[id] = innerHTML;
					this.options.document.update({"system.consequences": consequences});
				}
				break;
		}
		this.render();
	}

	async _removeConsequence(event) {
		if (!(await confirmDelete("Litm.other.consequence"))) return;

		const { id } = event.target.dataset;
		this.system.consequences.splice(id, 1);

		this.item.update({ "system.consequences": this.system.consequences });
	}

	static async #onToggleEdit(event, target) {
		this.isEditing = !this.isEditing;
		return this.render();
	}
}

import V2 from "../../v2sheets.js";
import ExternalTextEditor from "../../apps/text-editor.js";
import SpecialImprovements from "../../apps/special-improvements.js";

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ItemSheetV2 } = foundry.applications.sheets
export class ThemeSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
	constructor(object) {
		super(object);
		this.activeEditor = false;

		this.edittingSpecialImprovement = null;
		this.edittingSpecialImprovementName = false;
		this.edittingSpecialImprovementDescription = false;
	}

	/** @inheritdoc */
	static DEFAULT_OPTIONS = {
    	tag: "form",
		classes: ["app", "window-app", "litm", "litm--theme", "themed", "theme-light"],
		position: {
			width: 330,
			height: 808,
  		},
		window: {
			resizable: true,
    		title: "",
			controls: [],
			scrollY: [".taglist", ".editor"],
  		},
		form: {
			handler: this.#onSubmit,
    		closeOnSubmit: false,
		    submitOnChange: true,
  		},
		actions: {
			addTag: this.#addTag,
			removeTag: this.#removeTag,
			increase: this.#increase,
			activateEditor: this.#activateEditor,
			activateTag: this.#activateTag,
			burnTag: this.#burnTag,
			showAdvancementHint: this.#showAdvancementHint,
			editImprovement: this.#editImprovement,
			addImprovement: this.#addImprovement,
		},
  	}

	get system() {
		return this.item.system;
	}

	/** @inheritdoc */
	static PARTS = {
		form: { template: "systems/foundryvtt-litm/templates/item/theme.html" }
	}

	/** @override */
	async _prepareContext(options)
	{
		let { data, ...rest } = super._prepareContext();

		if (data == null) {
			data = { system: {} };
		}

		if (options.index && !this.index)
			this.index = options.index;

		data._id = this.item.id;
		data.system.weakness = this.item.sheet.system.weakness;
		data.system.levels = this.item.sheet.system.levels;
		data.system.themebooks = this.item.sheet.system.themebooks;
		data.system.powerTags = this.item.sheet.system.powerTags;
		data.system.motivation = this.item.sheet.system.motivation;
		data.system.note = this.item.sheet.system.note;
		data.system.themebook = this.item.sheet.system.themebook;
		data.system.level = this.item.sheet.system.level;
		data.system.experience = this.item.sheet.system.experience;
		data.system.decay = this.item.sheet.system.decay;
		data.system.milestone = this.item.sheet.system.milestone;
		data.system.isActive = this.item.sheet.system.isActive;
		data.system.isBurnt = this.item.sheet.system.isBurnt;
		data.system.toBurn = this.item.sheet.system.toBurn;
		data.system.flipped = this.item.sheet.system.flipped;
		data.name = this.item.name;

		const filledSpecialImprovements = structuredClone(this.item.sheet.system.specialImprovements.filter(i => i.improvementId != null && i.improvementId != ""));
		for (const specialImprovements of filledSpecialImprovements) {
			specialImprovements.renderedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(specialImprovements.description);
		}

		data.system.specialImprovements = [...filledSpecialImprovements, ...this.item.sheet.system.specialImprovements.filter(i => i.improvementId == null || i.improvementId == "")];

		const fallbackSrc = ["origin", "adventure", "greatness"].includes(
			data.system.level,
		)
			? data.system.level
			: "origin";
		const themesrc =
			CONFIG.litm.theme_src[data.system.level] ||
			`systems/foundryvtt-litm/assets/media/${fallbackSrc}`;

		return { 
			data,
			activeEditor: this.activeEditor,
			themesrc, 
			edittingSpecialImprovement: this.edittingSpecialImprovement,
			edittingSpecialImprovementName: this.edittingSpecialImprovementName,
			edittingSpecialImprovementDescription: this.edittingSpecialImprovementDescription,
			...rest
		};
	}

	async _onRender(context, options) {
		await super._onRender(context, options);
		await V2.updateHeader(this);
		await this.activateListeners(this.element);
		await this.activateEditors();
	}

	async _onFirstRender(context, options) {
		super._onFirstRender(context, options);
	}

	async activateEditors() {
		const html = this.element;
		const editors = html.querySelectorAll("[data-editor]");

		for (const el of editors) {
			// If already activated, skip
			if (el.dataset.editorActive === "true") continue;

			const target = el.dataset.editor;
			await foundry.applications.ready;

			const editor = await foundry.applications.ux.TextEditor.implementation.create({
				target: el,
				name: el.name,
				engine: "tinymce",
				save_onsavecallback: this.saveNotes.bind(this)
			});

			// optional flag to avoid re-init on rerender
			el.dataset.editorActive = "true";

			editor.on("keydown", (ev) => {
				if (ev.key === "Escape") {
					ev.preventDefault();
					ev.stopPropagation();
					this._closeEditor(editor, el);
				}
			});

			// Store a reference if you need to programmatically access it later
			if (!this._editors) this._editors = {};
			this._editors[target] = editor;
		}
	}

	activateListeners(html) {
		html.querySelectorAll("[data-context]").forEach(el => { el.addEventListener("contextmenu", this._handleContextmenu.bind(this)); });
		html.querySelectorAll("span[contenteditable]")
			.forEach(span => {
				// Prevent Enter from adding <div> or <br>
				span.addEventListener("keydown", ev => {
					if (ev.key === "Enter") {
						ev.preventDefault();
						span.blur();
					}
				});

				// Optional: submit also when clicking away
				span.addEventListener("blur", (ev) => {this._setText(ev)});
		});

		html.querySelectorAll("textarea.tinymce-editor")
			.forEach(span => {
				// Prevent Enter from adding <div> or <br>
				span.addEventListener("keydown", ev => {
					if (ev.key === "Esc") {
						ev.preventDefault();
						span._committed = true;
						this._closeEditor(ev);
					}
				});
		});
	}

	async _setText(event) {
		event.preventDefault();
		event.stopPropagation();
		const input = event.target.dataset.input;
		let value = event.target.innerHTML;
		const id = event.target.dataset.id;
		if (value == "<br>") {
			if (input == "system.motivation")
				value = game.i18n.localize("Litm.ui.name-motivation");
			else
				value = game.i18n.localize("TYPES.Item.theme") + " " + (this.index + 1);

			event.target.innerHTML = value;
		}
		
		if (input.startsWith("improvement-"))
		{
			const theme = this.options.document;
			const themeImprovements = structuredClone(theme.system.specialImprovements);
			const themeImprovement = themeImprovements.find(i => i.id == id);
			if (!themeImprovement) return;

			switch (input) {
				case "improvement-name":
					themeImprovement.name = value;
					this.edittingSpecialImprovement = null;
					this.edittingSpecialImprovementName = false;
					await theme.update({"system.specialImprovements": themeImprovements });
					break;
				case "improvement-description":
					themeImprovement.description = value;
					this.edittingSpecialImprovement = null;
					this.edittingSpecialImprovementDescription = false;
					await theme.update({"system.specialImprovements": themeImprovements });
					break;
			}
		}
		else
			this.item.update({[input]: value});
	}

	async _closeEditor(event) {
		this.activeEditor = false;
		this.render();
	}

	async saveNotes(tinyMce) {
		const [actor, item] = await ThemeSheet.getActorAndItemFromId(tinyMce.formElement.id);
		if (item) {
			const value = tinyMce.getContent();
			item.system.note = value;
			this.activeEditor = false;
			item.update({"system.note": value});
		}
	}

	static async #onSubmit(event, form, formData) {
		switch(event.target?.name) {
			case 'system.level':
			case 'system.themebook':
				this.item.update({[event.target.name]: event.target.value});
				return;
		}
		if (event.target?.name.startsWith('system.powerTags')) {
			const nameParts = event.target.name.split('.');
			if (nameParts?.length >= 3) {
				const index = parseInt(nameParts[2]);
				const tags = structuredClone(this.item.system.powerTags);
				tags[index].name = event.target.value;
				this.item.update({"system.powerTags": tags});
			}
		}
		else if (event.target?.name.startsWith('system.weaknessTags')) {
			const nameParts = event.target.name.split('.');
			if (nameParts?.length >= 3) {
				const index = parseInt(nameParts[2]);
				const tags = structuredClone(this.item.system.weaknessTags);
				tags[index].name = event.target.value;
				this.item.update({"system.weaknessTags": tags});
			}
		}
		const data = foundry.utils.expandObject(formData.object);
	}

	_handleContextmenu(event) {
		const t = event.currentTarget;
		const action = t.dataset.context;
		const id = t.dataset.id;
		switch (action) {
			case "decrease":
				this._decrease(id);
				break;
			case "remove-improvement":
				event.preventDefault();
				event.stopPropagation();
				this._removeImprovement(t);
				break;
		}
	}

	static async #addTag(event, target) {
		throw new Error("Not implemented");
	}

	static async #removeTag(event, target) {
		if (!(await utils.confirmDelete("Litm.other.tag"))) return;
		throw new Error("Not implemented");
	}

	static async #increase(event, target) {
		const [actor, item] = this.getActorAndItemFromId(event.currentTarget.id);
		const id = event.target.dataset.id;
		await item.sheet._increase(id);
	}

	static async #activateEditor(event, target) {
		event.preventDefault();
		event.stopPropagation();
		const editorTarget = event.target.dataset.target;
		const value = foundry.utils.getProperty(this.options.document, editorTarget);

		const editor = new ExternalTextEditor({target: editorTarget, value, document: this.options.document});
		editor.render(true);
	}

	static async #activateTag(event, target) {
		const path = event.target.dataset.path;
		const checked = event.target.checked;
		let key;
		if (event.target.dataset.key)
			key = parseInt(event.target.dataset.key);

		const tags = structuredClone(foundry.utils.getProperty(this.item, path));
		if (key != null) {
			tags[key].isActive = checked;
			this.item.update({[path]: tags});
		}
		else
		{
			const name = event.target.name;
			if (name)
				this.item.update({[name]: checked});
		}
		this.item.sheet.render();

		const [actor, item] = await ThemeSheet.getActorAndItemFromId(this.element.id);
		if (actor) {
			actor.sheet.render();
		}
	}

	static async #burnTag(event, target) {
		const path = event.target.dataset.path;
		const checked = event.target.checked;
		let key;
		if (event.target.dataset.key)
			key = parseInt(event.target.dataset.key);

		const tags = structuredClone(foundry.utils.getProperty(this.item, path));

		if (key != null) {
			tags[key].isBurnt = checked;
			this.item.update({[path]: tags});
		}
		else
		{
			const name = event.target.name;
			if (name)
				this.item.update({[name]: checked});
		}
		this.item.sheet.render();

		const [actor, item] = await ThemeSheet.getActorAndItemFromId(this.element.id);
		if (actor) {
			actor.sheet.render();
		}
	}

	static async #showAdvancementHint(event) {
		const type = event.target.dataset.type;
		utils.showAdvancementHint(type);
	}

	static async #editImprovement(event) {
		const id = event.target.dataset.id;
		const type = event.target.dataset.type;

		if (type == 'name') {
			this.edittingSpecialImprovement = id;
			this.edittingSpecialImprovementName = true;
			this.edittingSpecialImprovementDescription = false;
		} else if (type == 'description') {
			this.edittingSpecialImprovement = id;
			this.edittingSpecialImprovementName = false;
			this.edittingSpecialImprovementDescription = true;
		}

		this.render();
	}

	static async #addImprovement(event) {
		const id = event.target.dataset.id;
		const themeId = event.target.dataset.themeId;

		const theme = this.item;
		if (!theme) return;

		this.edittingSpecialImprovementName = false;
		this.edittingSpecialImprovementDescription = false;
		this.edittingSpecialImprovement = null;

		const selector = new SpecialImprovements({theme});
		selector.render(true);
	}

	async _increase(id) {
		let value = Math.min(Math.max(this[id] + 1, 0), 3);
		await this.item.update({ [id]: value });
	}

	async _decrease(id) {
		let value = Math.min(Math.max(this[id] - 1, 0), 3);
		await this.item.update({ [id]: value });
	}

	async _removeImprovement(target) {
        const id = target.dataset.id;
		const index = target.dataset.index;

		const theme = this.options.document;
		const themeImprovements = structuredClone(theme.system.specialImprovements);
		const themeImprovement = themeImprovements.find(i => i.id == id);
		if (!themeImprovement) return;
		if (!themeImprovement.name || themeImprovement.name == "") return;

		if (!(await utils.confirmDelete(themeImprovement.name))) return;

		themeImprovement.improvementId = null;
		themeImprovement.name = null;
		themeImprovement.description = null;

		await theme.update({"system.specialImprovements": themeImprovements });
	}

	static async getActorAndItemFromId(id) {
		const actorIdMatch = id.match(/Actor-(.*?)-/);
		const actorId = actorIdMatch[1];
		if (!actorId) return [];
		const itemIdMatch = id.match(/Item-(.*)/);
		const itemId = itemIdMatch[1];
		if (!itemId) return [];

		const actor = game.actors.get(actorId);
		if (!actor) return [];
		const item = await actor.getEmbeddedDocument("Item", itemId);
		if (!item) return [actor, null];
		return [actor, item];
	}
}

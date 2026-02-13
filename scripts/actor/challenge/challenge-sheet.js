import V2 from "../../v2sheets.js";
import ExternalTextEditor from "../../apps/text-editor.js";

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ActorSheetV2 } = foundry.applications.sheets
export class ChallengeSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
	isEditing = false;

	constructor(options) {
		super(options);
	}

	/** @inheritdoc */
	static DEFAULT_OPTIONS = {
    	tag: "form",
		classes: ["app", "window-app", "litm", "litm--challenge", "themed", "theme-light"],
		position: {
			width: 320,
			height: 700,
  		},
		window: {
			resizable: true,
    		title: "",
			controls: [],
			scrollY: [".litm--challenge-wrapper"],
  		},
		form: {
			handler: this.#onSubmit,
    		closeOnSubmit: false,
		    submitOnChange: true,
  		},
		actions: {
			addlimit: this.#onAddLimit,
			addthreat: this.#onAddThreat,
			increase: this.#onIncrease,
			toggleEdit: this.#onToggleEdit,
			activateEditor: this.#activateEditor,
			changeAvatar: this.#changeAvatar,
			selectLimitLevel: this.#selectLimitLevel,
		}
  	}

	/** @inheritdoc */
	static PARTS = {
		form: { template: "systems/foundryvtt-litm/templates/actor/challenge.html" }
	}


	get system() {
		return this.actor.system;
	}

	get items() {
		return this.actor.items;
	}

	/** @override */
	async _prepareContext(options) {
		let { data, rest } = super._prepareContext(options);

		if (data == null) {
			data = { system: {} };
		} else if (data.system == null) {
			data.system = {};
		}

		const system = structuredClone(this.system);
		for (const limit of system.limits) {
			this.ensureLength(limit.levels, limit.value);
		}
		data.system = system;
		data.system.challenges = this.system.challenges;
		data.system.special = await foundry.applications.ux.TextEditor.implementation.enrichHTML(data.system.special);
		data.system.note = await foundry.applications.ux.TextEditor.implementation.enrichHTML(data.system.note);
		data.system.renderedTags = await foundry.applications.ux.TextEditor.implementation.enrichHTML(data.system.tags);
		data.items = await Promise.all(this.items.map((i) => i.sheet._prepareContext()));
		data.img = this.options.document.img;
		data.name = this.options.document.name;

		return { 
			data, 
			...rest,
			isEditing: this.isEditing
		};
	}

	async _onFirstRender(context, options) {
		super._onFirstRender(context, options);

		this._createContextMenu(this._showImage, "[data-edit='img']", {
      		hookName: "_showImage",
      		parentClassHooks: false,
      		fixed: true,
    	});
	}

	async _onRender(force, options) {
		await super._onRender(force, options);
		await V2.updateHeader(this);
		await this.activateListeners(this.element);
	}

	activateListeners(html) {
		//super.activateListeners(html);
		html = html instanceof HTMLElement ? html : html[0];

		// double-click
		html.querySelectorAll("[data-dblclick]")
			.forEach(el => el.addEventListener("dblclick", this._handleDblClick.bind(this)));

		// context menu
		html.querySelectorAll("[data-context]")
			.forEach(el => el.addEventListener("contextmenu", this._handleContext.bind(this)));

		// focus editable field whose next sibling is #tags
		html.querySelectorAll("span[contenteditable]")
			.forEach(span => {
				span.addEventListener("keydown", ev => {
					if (ev.key === "Enter") {
						ev.preventDefault();
						span.blur();
					}
				});

				// Optional: submit also when clicking away
				span.addEventListener("blur", (ev) => {this._setText(ev)});
		});

		const editable = Array.from(html.querySelectorAll("[contenteditable]"))
			.find(el => el.nextElementSibling?.id === "tags");
		if (editable) editable.focus();
	}

	static async #onSubmit(event, form, formData) {
		event.preventDefault();

		const path = event.target.dataset.path;
		const key = parseInt(event.target.dataset.key);
		const targetValue = event.target.dataset.targetValue;
		const name = event.target.name;
		const value = event.target.value;
		const innerHTML = event.target.innerHTML;

		switch (path) {
			case "system.limits":
				const limits = structuredClone(this.options.document.system.limits);
				if (limits?.length > key) {
					if (targetValue == "name")
						limits[key].name = value;
					else if (targetValue == "value")
					{
						limits[key].value = value;
						this.ensureLength(limits[key].levels, limits[key].value);
					}
				}
				this.options.document.update({"system.limits": limits});
				break;
			case "system.category":
				this.options.document.update({"system.category": value});
				break;
			case "system.tags":
				this.options.document.update({"system.tags": innerHTML});
				break;
		}

		const app = this;                   // ApplicationV2 instance
		const data = formData.object;       // flat object (like old formData)

		// Apply your sanitizer, same as before
		const sanitizedFormData = app._sanitizeTags(data);

		// This replaces super._updateObject(...)
		if (app.object) {
			return app.object.update(sanitizedFormData);
		}

		return null;
	}

	async _onDrop(dragEvent) {
		if (dragEvent?.dataTransfer == null) return;
		const dragData = dragEvent.dataTransfer.getData("text/plain");
		if (dragData.startsWith('http')) return;
		const data = JSON.parse(dragData);

		if (data.type == "randomName") {
			this.actor.update({"name": data.name });
			this.actor.update({"prototypeToken.name": data.name });
		}
	}

	// Prevent dropping non-threat items
	async _onDropItem(event, data) {
		const item = await Item.implementation.fromDropData(data);
		if (item.type !== "threat") return;

		if (this.items.get(item.id)) return this._onSortItem(event, item);

		return super._onDropItem(event, data);
	}

	static async #onAddLimit(event, target) {
		this._addLimit();
	}

	static async #onAddThreat(event, target) {
		this._addThreat();
	}
	
	static async #onIncrease(event, target) {
		const button = event.target.closest(".litm--challenge-rating");
		this._increase(button);
	}

	static async #onToggleEdit(event, target) {
		this.isEditing = !this.isEditing;
		return this.render();
	}

	static async #activateEditor(event) {
		event.preventDefault();
		event.stopPropagation();
		const editorTarget = event.target.dataset.target;
		const value = foundry.utils.getProperty(this.options.document, editorTarget);

		const editor = new ExternalTextEditor({target: editorTarget, value, document: this.options.document});
		editor.render(true);
	}
	
	static async #changeAvatar(event) {
		const field = event.target.dataset.edit || "img";
		const actor = game.actors.get(this.options.document._id);
		if (!actor) return;
		const current = foundry.utils.getProperty(actor, field);

		const fp = new foundry.applications.apps.FilePicker({
			type: "image",
			current: current,
			callback: (path) => {
				actor[field] = path;
				actor.update({ [field]: path });
				actor.update({"prototypeToken.texture.src": path})
				actor.sheet.render();
			}
		});

		fp.render(true);
	}

	static async #selectLimitLevel(event, target) {
		const parent = event.target.parentElement;

		const limitId = parseInt(parent.dataset.limitId);
		const level = parseInt(event.target.dataset.level);

		const limit = this.system.limits[limitId];
		if (!limit) return;
		this.ensureLength(limit.levels, limit.value);

		if (!limit.levels[level])
			limit.levels[level] = level + 1;
		else
			limit.levels[level] = null;

		this.options.document.update({"system.limits": this.system.limits});
	}

	_handleDblClick(event) {
		event.preventDefault();

		const button = event.currentTarget;
		const action = button.dataset.dblclick;

		switch (action) {
			case "edit-item":
				this._openItemSheet(button);
				break;
		}
	}

	_handleContext(event) {
		event.preventDefault();

		const button = event.currentTarget;
		const action = button.dataset.context;

		switch (action) {
			case "remove-limit":
				this._removeLimit(button);
				break;
			case "remove-threat":
				this._removeThreat(button);
				break;
			case "decrease":
				this._decrease(button);
				break;
		}
	}

	_addLimit() {
		const limits = this.system.limits;
		const limit = {
			name: "New Limit",
			value: 0,
		};

		limits.push(limit);
		this.actor.update({ "system.limits": limits });
	}

	async _addThreat() {
		const threats = await this.actor.createEmbeddedDocuments("Item", [
			{ name: "New Threat", type: "threat" },
		]);
		threats[0].sheet.render(true);
	}

	async _removeLimit(button) {
		if (!(await utils.confirmDelete("Litm.other.limit"))) return;
		const index = Number(button.dataset.id);
		const limits = this.system.limits;

		limits.splice(index, 1);
		this.actor.update({ "system.limits": limits });
	}

	async _removeThreat(button) {
		if (!(await utils.confirmDelete("TYPES.Item.threat"))) return;
		const item = this.items.get(button.dataset.id);
		item.delete();
	}

	async _increase(target) {
		const attrib = target.dataset.name;
		const value = foundry.utils.getProperty(this.actor, attrib);

		return this.actor.update({ [attrib]: Math.min(value + 1, 5) });
	}

	async _decrease(target) {
		const attrib = target.dataset.name;
		const value = foundry.utils.getProperty(this.actor, attrib);

		return this.actor.update({ [attrib]: Math.max(value - 1, 1) });
	}

	_openItemSheet(button) {
		const item = this.items.get(button.dataset.id);
		item.sheet.render(true);
	}

	_sanitizeTags(formData) {
		if (!formData["system.tags"]) return formData;
		const re = CONFIG.litm.tagStringRe;
		const tags = formData["system.tags"].match(re);
		formData["system.tags"] = tags ? tags.join(" ") : "";

		return formData;
	}

	_setText(event) {
		const input = event.target.dataset.input;
		const path = event.target.dataset.path;
		
		const innerHTML = event.target.innerHTML;
		this.isEditing = false;
		this.options.document.update({[path]: innerHTML});
		if (path == "name")
			this.options.document.update({"prototypeToken.name": innerHTML});
		this.render();
	}

	static async getActorFromId(id) {
		const actorIdMatch = id.match(/Actor-(.*)/);
		const actorId = actorIdMatch[1];
		if (!actorId) return [];

		const actor = game.actors.get(actorId);
		return actor;
	}

	_showImage() {
		const canEdit = function(element, actor) {
			let result = false;

			if (game.user.isGM) {
				result = true;
			}
			else if (actor.canUserModify(game.user, "update")) {
				result = true;
			}

			return result;
		};

		return [
			{
				name: game.i18n.localize("Litm.ui.show-portrait.title"),
				icon: '<i class="fas fa-eye"></i>',
				condition: element => canEdit(element, this.actor),
				callback: async element => {
					const portrait = await PIXI.Texture.fromURL(this.actor.img);
					await utils.showImageDialog(this.actor.img, this.actor.name, true, game.user, portrait.width, portrait.height);
				},
			},
		];
	}

	ensureLength(arr, length, fillValue = null) {
		if (arr.length > length) {
			arr.length = length;
		} else if (arr.length < length) {
			arr.push(...Array(length - arr.length).fill(fillValue));
		}
		return arr;
	}
}

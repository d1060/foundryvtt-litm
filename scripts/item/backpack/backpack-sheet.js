import V2 from "../../v2sheets.js";
import { CharacterSheet } from "../../actor/character/character-sheet.js";

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ItemSheetV2 } = foundry.applications.sheets

export class BackpackSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
	#dragDrop

	constructor(options) {
		super(options);
		this.#dragDrop = this.#createDragDropHandlers();
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
			addTag: this.#onAddTag,
		},
		dragDrop: [{dragSelector: "[draggable]", dropSelector: "li"}],
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
		const backpack = structuredClone(this.system.contents);

		for (const contextTagData of backpack) {
			contextTagData.enrichedName = await foundry.applications.ux.TextEditor.implementation.enrichHTML(contextTagData.name);
			contextTagData.nestedLevel = 0;
			if (contextTagData.enrichedName != contextTagData.name)
				contextTagData.enriched = true;

			if (contextTagData.parentId) {
				const parentTagData = backpack.find(td => td.id == contextTagData.parentId);
				if (parentTagData.expanded) {
					contextTagData.nestedLevel = 1;
				}
			}
		}

		return {
			backpack,
			name: this.item.name
		};
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
		if (!li) return;
		const id = li.dataset.id;
		const item = this.system.parent.system.contents.find(i => i.id == id);
		const index = this.system.parent.system.contents.findIndex(i => i.id == id);

		const payload = {
			type: item.type,
			actorId: this.actor.id,
			id,
			index,
			name: item.name,
			isActive: item.isActive,
			isBurnt: item.isBurnt,
			toBurn: item.toBurn,
		};

		event.dataTransfer.setData("text/plain", JSON.stringify(payload));
		event.dataTransfer.setData("application/json", JSON.stringify(payload));		
	}

	async _onDrop(dragEvent) {
		const dragData = dragEvent.dataTransfer.getData("text/plain");
		const data = JSON.parse(dragData);

		// Handle only Actors to begin with
		if (!["backpack"].includes(data.type)) return;

		const targetId = dragEvent.currentTarget.dataset.id;
		const contents = structuredClone(this.system.parent.system.contents);
		const targetIndex = contents.findIndex(i => i.id == targetId);

		if (data.index == targetIndex) return;

		let newIndex = targetIndex;

		if (data.index < targetIndex)
			newIndex = targetIndex + 1;

		const item = contents.splice(data.index, 1)[0];
		if (newIndex > data.index) newIndex--;
		contents.splice(newIndex, 0, item);

		await this.system.parent.update({"system.contents": contents});
	}

	async _onFirstRender(context, options) {
		this._createContextMenu(this._getItemContextOptions, "li", {
			hookName: "LitmBackpackItemContextMenu",
      		fixed: true,
    	});
		super._onFirstRender(context, options);
	}

	_getItemContextOptions(target) {
		const canTransfer = function(element, actor) {
			return game.users.some(u => u.isGM && u.active);
		};

		const isTheme = function(element, actor) {
			return element.dataset.type.trim() === 'storyTheme';
		};

		const isThemeChild = function(element, actor) {
			return element.dataset.parentid.trim() !== '';
		};

		const canRemove = function(element, actor) {
			return !isTheme(element, actor) && !isThemeChild(element, actor);
		};

		const options = [
			{
				name: game.i18n.localize("Litm.ui.transfer"),
				icon: '<i class="fas fa-exchange-alt"></i>',
				condition: element => canTransfer(element, this.actor),
				callback: (html) => {
					this._transferItem(html);
				},
			},
			{
				name: game.i18n.localize("Litm.ui.remove"),
				icon: "<i class='fas fa-trash'></i>",
				condition: element => canRemove(element, this.actor),
				callback: (html) => {
					this._removeItem(html);
				},
			},
			{
				name: game.i18n.localize("Litm.ui.remove-theme"),
				icon: "<i class='fas fa-trash'></i>",
				condition: element => isTheme(element, this.actor),
				callback: (html) => {
					this._removeTheme(html);
				},
			},
			{
				name: game.i18n.localize("Litm.ui.remove-parent-theme"),
				icon: "<i class='fas fa-trash'></i>",
				condition: element => isThemeChild(element, this.actor),
				callback: (html) => {
					this._removeParentTheme(html);
				},
			},
		];

		return options;
	}

	async _transferItem(domItem) {
		const item = this.system.parent.system.contents.find(i => i.id == domItem.dataset.id);

		const targetActor = await utils.actorChoiceDialog({
			template: 'systems/foundryvtt-litm/templates/item/transfer-item.html',
			title: 'Litm.ui.transfer-item-title',
			exclude: this.actor.id,
			item
		});

		if (targetActor) {
			const to = targetActor;
			this.transferItem(item, to);
		}
	}

	async transferItem(item, to) {
		if (game.user.isGM) {
			CharacterSheet.addBackpackItem(item, to.id, this.actor.id);
		} else {
			game.socket.emit("system.foundryvtt-litm", {
				app: "character-sheet",
				event: "transferItem",
				senderId: game.user.id,
				senderActorId: this.actor.id,
				actorId: to.id,
				item
			});
		}
	}
	
	async _removeItem(item) {
		this._removeTag(item);
	}

	async _removeTheme(html) {
		if (!(await utils.confirmDelete("Litm.other.tag"))) return;

		let contents = this.system.contents;
		const index = contents.findIndex(i => i.id == html.dataset.id);
		if (index < 0) return;

		contents = contents.filter(c => c.id != html.dataset.id && c.parentId != html.dataset.id);
		return this.item.update({ "system.contents": contents });
	}

	async _removeParentTheme(html) {
		if (!(await utils.confirmDelete("Litm.other.tag"))) return;

		let contents = this.system.contents;
		const index = contents.findIndex(i => i.id == html.dataset.parentid);
		if (index < 0) return;

		contents = contents.filter(c => c.id != html.dataset.parentid && c.parentId != html.dataset.parentid);
		return this.item.update({ "system.contents": contents });
	}

	async _onRender(force, options) {
		await super._onRender(force, options);
		await V2.updateHeader(this);
		await this.activateListeners(this.element);
		this.#dragDrop.forEach((d) => d.bind(this.element));
	}

	activateListeners(html) {
		html = html instanceof HTMLElement ? html : html[0];

		html.querySelectorAll("div.tag--name").forEach(el => el.addEventListener("click", this._onTagClick.bind(this)));
		html.querySelectorAll("span.tag--name").forEach(el => el.addEventListener("blur", this._onTagBlur.bind(this)));
	}

	static async #onSubmit(event, form, formData) {
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

	async _onTagClick(event) {
		const div = event.currentTarget;
		if (!div) return;
		const li = div.closest("li");
		if (!li) return;
		const span = li.querySelector("span.tag--name");
		if (!span) return;

		div.style.display = "none";
		span.style.display = "unset";

		span.focus();

		// Put caret at the end
		const range = document.createRange();
		range.selectNodeContents(span);
		range.collapse(false);

		const sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
	}

	async _onTagBlur(event) {
		const span = event.currentTarget;
		if (!span) return;
		const li = span.closest("li");
		if (!li) return;
		const div = li.querySelector("div.tag--name");
		if (!div) return;

		const content = span.innerHTML;
		const id = span.dataset.id;
		const contents = structuredClone(this.system.contents);
		const tag = contents.find(c => c.id == id);
		if (tag) {
			tag.name = content;
			await this.item.update({ "system.contents": contents });
		}
		const enrichedContent = await foundry.applications.ux.TextEditor.implementation.enrichHTML(content);
		div.innerHTML = enrichedContent;

		div.style.display = "unset";
		span.style.display = "none";

		this.actor?.sheet?.render();
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

	static async #onAddTag(element) {
		const item = {
			name: utils.localize("Litm.ui.name-tag"),
			isActive: false,
			isBurnt: false,
			toBurn: false,
			type: "backpack",
			id: foundry.utils.randomID(),
		};

		const contents = this.system.contents;
		contents.push(item);

		return this.item.update({ "system.contents": contents });
	}

	async _removeTag(button) {
		if (!(await utils.confirmDelete("Litm.other.tag"))) return;

		const contents = this.system.contents;
		const index = contents.findIndex(i => i.id == button.dataset.id);
		if (index < 0) return;

		contents.splice(index, 1);
		return this.item.update({ "system.contents": contents });
	}

	static async #onActivateTag(event, target) {
		event.preventDefault();

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

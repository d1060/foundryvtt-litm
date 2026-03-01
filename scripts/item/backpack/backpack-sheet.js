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
		return {
			backpack: this.system.contents,
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

		const canRemove = function(element, actor) {
			return true;
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

	async _onRender(force, options) {
		await super._onRender(force, options);
		await V2.updateHeader(this);
		await this.activateListeners(this.element);
		this.#dragDrop.forEach((d) => d.bind(this.element));
	}

	activateListeners(html) {
		html = html instanceof HTMLElement ? html : html[0];

		html.querySelectorAll("[data-click]")
			.forEach(el => el.addEventListener("click", this._onClick.bind(this)));
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

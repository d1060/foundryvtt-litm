import V2 from "../../v2sheets.js";
import SpecialImprovements from "../../apps/special-improvements.js";
import { Sockets } from "../../system/sockets.js";
import Fellowship from "../../apps/fellowship.js";
import { ThemeSheet } from "../../item/theme/theme-sheet.js";

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ActorSheetV2 } = foundry.applications.sheets
export class CharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
	constructor(object) {
		super(object);

		this.isDragging = false;
  		this.startX = 0;
  		this.startY = 0;
		this.startDragPosition = {};

      	this.isDraggingNotes = false;
		this.notesStartX = 0;
      	this.notesStartY = 0;
		this.notesStartDragPosition = {};

		this._improvementEditTimer = null;
	}

	/** @inheritdoc */
	static DEFAULT_OPTIONS = {
    	tag: "form",
		classes: ["app", "window-app", "litm", "litm--character", "themed", "theme-light"],
		position: {
			width: 250,
			height: 350,
			left: window.innerWidth / 2 - 250,
			top: window.innerHeight / 2 - 250,
  		},
		window: {
			resizable: false,
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
			increase: this.#doIncrease,
			doOpen: this.#doOpen,
			doClose: this.#doClose,
			activate: this.#doActivate,
			select: this.#doSelect,
			burn: this.#doBurn,
			doShowFellowship: this.#doShowFellowship,
			selectStatusLevel: this.#onSelectStatusLevel,
			showAdvancementHint: this.#showAdvancementHint,
			editImprovement: this.#onEditImprovement,
		},
  	}

	/** @inheritdoc */
	static PARTS = {
		form: { template: "systems/foundryvtt-litm/templates/actor/character.html" }
	}

	#dragAvatarTimeout = null;
	_notesEditorStyle = "display: none;";
	#tagsFocused = null;
	#tagsHovered = false;
	#themeHovered = null;
	#contextmenu = null;
	_roll = game.litm.LitmRollDialog.create({
		actorId: this.actor._id,
		characterTags: [],
		shouldRoll: () => game.settings.get("foundryvtt-litm", "skip_roll_moderation"),
	});

	get items() {
		return this.actor.items;
	}

	get system() {
		return this.actor.system;
	}

	get storyTags() {
		return [...this.system.storyTags, ...this.system.statuses];
	}

	_getHeaderControls() {
    	const controls = super._getHeaderControls();
		controls.unshift({
			label: 'Litm.ui.fellowship-toggle',
			icon: "fas fa-user-friends",
			onClick: (html) => {
				const showFellowshipTheme = !this.actor.system.showFellowshipTheme;
				this.actor.update({"system.showFellowshipTheme": showFellowshipTheme });
				this.render();
			},
		});
		return controls;
	}

	updateRollDialog(data) {
		this._roll.receiveUpdate(data);
	}

	renderRollDialog({ toggle } = { toggle: false }) {
		if (toggle && this._roll.rendered) this._roll.close();
		else this._roll.render(true);
	}

	async resetRollDialog() {
		await this._roll.reset();
		if (this.options?.document?._sheet?.rendered)
			this.render();
	}

	async toggleActivateTag(tag, selected) {
		switch (tag.type) {
			case "powerTag": {
				const parentTheme = this.items.find(
					(i) =>
						i.type === "theme" &&
						i.system.powerTags.some((t) => t.id === tag.id),
				);
				if (parentTheme == null) {
					Fellowship.activateTag(tag);
					break;
				}
				const { powerTags } = parentTheme.system.toObject();
				const pTag = powerTags.find((t) => t.id === tag.id);
				pTag.isActive = !tag.isActive;
				await this.actor.updateEmbeddedDocuments("Item", [
					{
						_id: parentTheme.id,
						"system.powerTags": powerTags,
					},
				]);

				if (this._roll?.rendered) {
					this._roll.updateTag(pTag);
				}
				break;
			}
			case "themeTag": {
				if (tag.id == "fellowship") {
					Fellowship.activateTag(tag);
					break;
				}

				const theme = this.items.get(tag.id);
				theme.isActive = !tag.isActive;
				await this.actor.updateEmbeddedDocuments("Item", [
					{
						_id: theme.id,
						"system.isActive": !tag.isActive,
					},
				]);
				if (this._roll?.rendered) {
					this._roll.updateTag(theme);
				}
				break;
			}
			case "backpack": {
				const backpack = this.items.find((i) => i.type === "backpack");
				const { contents } = backpack.system.toObject();
				const bTag = contents.find((i) => i.id === tag.id);
				bTag.isActive = !tag.isActive;
				await this.actor.updateEmbeddedDocuments("Item", [
					{
						_id: backpack.id,
						"system.contents": contents,
					},
				]);
				if (this._roll?.rendered) {
					this._roll.updateTag(bTag);
				}
				break;
			}
		}
	}

	async toggleBurnTag(tag, toBurn) {
		switch (tag.type) {
			case "powerTag": {
				const parentTheme = this.items.find(
					(i) =>
						i.type === "theme" &&
						i.system.powerTags.some((t) => t.id === tag.id),
				);
				if (parentTheme == null) {
					Fellowship.burnTag(tag);
					break;
				}
				const { powerTags } = parentTheme.system.toObject();

				if (toBurn)
					powerTags.find((t) => t.id === tag.id).toBurn = !tag.toBurn;
				else
					powerTags.find((t) => t.id === tag.id).isBurnt = !tag.isBurnt;

				await this.actor.updateEmbeddedDocuments("Item", [
					{
						_id: parentTheme.id,
						"system.powerTags": powerTags,
					},
				]);
				break;
			}
			case "themeTag": {
				if (tag.id == "fellowship") {
					Fellowship.burnTag(tag);
					break;
				}

				const theme = this.items.get(tag.id);
				let dataUpdate = {
						_id: theme.id,
						"system.isBurnt": !tag.isBurnt,
				};

				if (toBurn)
					dataUpdate = {
						_id: theme.id,
						"system.toBurn": !tag.toBurn,
					};

				await this.actor.updateEmbeddedDocuments("Item", [dataUpdate]);
				break;
			}
			case "backpack": {
				const backpack = this.items.find((i) => i.type === "backpack");
				const { contents } = backpack.system.toObject();

				if (toBurn)
					contents.find((t) => t.id === tag.id).toBurn = !tag.toBurn;
				else
					contents.find((i) => i.id === tag.id).isBurnt = !tag.isBurnt;

				await this.actor.updateEmbeddedDocuments("Item", [
					{
						_id: backpack.id,
						"system.contents": contents,
					},
				]);
				break;
			}
		}
	}

	async gainExperience(tag) {
		const parentTheme = this.items.find(
			(i) =>
				i.type === "theme" &&
				i.system.weaknessTags.some((t) => t.id === tag.id),
		);
		if (!parentTheme) return null;
		this.actor.updateEmbeddedDocuments("Item", [
			{
				_id: parentTheme.id,
				"system.experience": parentTheme.system.experience + 1,
			},
		]);
		return parentTheme;
	}

	/** @override */
	async _prepareContext(options)
	{
		const themes = await Promise.all(
			this.items
				.filter((i) => i.type === "theme")
				.sort((a, b) => a.sort - b.sort)
				.map((i, index) => i.sheet._prepareContext({index})),
		);
		if (this.actor.system?.promise == null) { this.actor.system.promise = 0; }
		const note = await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.system.note);
		const backpack = {
			name: this.items.find((i) => i.type === "backpack")?.name,
			id: this.items.find((i) => i.type === "backpack")?._id,
			contents: this.system.backpack
				.sort((a, b) => a.name.localeCompare(b.name))
				.sort((a, b) => (a.isActive && b.isActive ? 0 : a.isActive ? -1 : 1)),
		};

		const showBackpackContextMenu = (this.actor.items.find(i => i.type == 'backpack') == null) || (themes?.length < 4);

		return {
			...this.actor.system,
			backpack,
			note,
			themes,
			_id: this.actor.id,
			toBurnTags: this._roll.characterTags.filter((t) => t.state === "burned"),
			burntTags: this._roll.characterTags.filter((t) => t.isBurnt),
			img: this.actor.img,
			name: this.actor.name,
			promise: this.actor.system.promise,
			notesEditorStyle: this._notesEditorStyle,
			rollTags: this._roll.characterTags,
			storyTags: this.storyTags,
			tagsFocused: this.#tagsFocused,
			tagsHovered: this.#tagsHovered,
			themeHovered: this.#themeHovered,
			weaknessTagDefaultName: game.i18n.localize("Litm.ui.name-weakness"),
			showFellowshipTheme: this.actor.system.showFellowshipTheme,
			fellowship: await this._getFellowship(),
			showBackpackContextMenu,
		};
	}

	async _onFirstRender(context, options) {
		// this._createContextMenu(this._getMainContextOptions, ".nav-main", {
		// 	hookName: "LitmMainContextMenu",
		// 	jQuery: false,
      	// 	fixed: true,
    	// });
		this._createContextMenu(this._showImage, "[data-edit='img']", {
      		hookName: "_showImage",
      		parentClassHooks: false,
      		fixed: true,
    	});
		this._createContextMenu(this._getItemContextOptions, "[data-context='menu']", {
			hookName: "LitmItemContextMenu",
      		fixed: true,
    	});
		this._createContextMenu(this._getBackpackContextOptions, "[data-context='backpack']", {
			hookName: "LitmBackpackContextMenu",
      		fixed: true,
    	});
		super._onFirstRender(context, options);
	}

	// _getMainContextOptions(target) {
	// 	const isFellowshipOpen = function(element, actor) {
	// 		return !!actor.system.showFellowshipTheme;
	// 	}
	// 	const options = [
	// 		{
	// 			name: game.i18n.localize("Litm.ui.roll-title"),
	// 			icon: '<i class="fas fa-dice"></i>',
	// 			callback: (html) => {
	// 				this.renderRollDialog();					
	// 			},
	// 		},
	// 		{
	// 			name: game.i18n.localize("Notes"),
	// 			icon: '<i class="fas fa-book"></i>',
	// 			callback: (html) => {
	// 				this.element.querySelector("#note").style.display = "block";
	// 				this._notesEditorStyle = "display: block;";
	// 			},
	// 		},
	// 		{
	// 			name: game.i18n.localize('Litm.ui.fellowship-hide-tooltip'),
	// 			icon: "<i class='fas fa-user-friends'></i>",
	// 			condition: element => isFellowshipOpen(element, this.actor),
	// 			callback: (html) => {
	// 				const actor = this.options.document;
	// 				const showFellowshipTheme = !actor.system.showFellowshipTheme;
	// 				actor.update({"system.showFellowshipTheme": showFellowshipTheme });
	// 				this.render();
	// 			},
	// 		},
	// 		{
	// 			name: game.i18n.localize('Litm.ui.fellowship-tooltip'),
	// 			icon: "<i class='fas fa-user-friends'></i>",
	// 			condition: element => !isFellowshipOpen(element, this.actor),
	// 			callback: (html) => {
	// 				const actor = this.options.document;
	// 				const showFellowshipTheme = !actor.system.showFellowshipTheme;
	// 				actor.update({"system.showFellowshipTheme": showFellowshipTheme });
	// 				this.render();
	// 			},
	// 		},
	// 	];
	// 	return options;
	// }

	_getItemContextOptions(target) {
		const canShow = function(element, actor) {
			let result = false;
			const contextType = element.dataset.contextType;
			if (contextType == null) return true;
			return contextType != 'backpack';
		};

		const canRemove = function(element, actor) {
			return !element.classList.contains('fellowship');
		};

		const options = [
			{
				name: game.i18n.localize("Litm.ui.edit"),
				icon: '<i class="fas fa-edit"></i>',
				callback: (html) => {
					const parent = html.parentElement;
					const id = parent?.dataset.id;
					const itemId = parent?.dataset.itemId;

					if (id == 'fellowship' || itemId == 'fellowship') {
						const fellowship = new Fellowship({actor: this});
						fellowship.render(true);
						return;
					}

					let item = this.actor.items.get(id);
					if (!item)
						item = this.actor.items.get(itemId);
					if (item)
						item.sheet.render(true);
				},
			},
			{
				name: game.i18n.localize("Litm.ui.flip"),
				icon: '<i class="fas fa-exchange-alt"></i>',
				condition: element => canShow(element, this.actor),
				callback: (html) => {
					const parent = html.parentElement;
					const id = parent?.dataset.id;
					const item = this.actor.items.get(id);
					this._doFlip(html, item);
				},
			},
			{
				name: game.i18n.localize("Litm.ui.remove"),
				icon: "<i class='fas fa-trash'></i>",
				condition: element => canRemove(element, this.actor),
				callback: (html) => {
					const parent = html.parentElement;
					const id = parent?.dataset.id;
					this._removeTheme(id);
				},
			},
		];

		return options;
	}

	_getBackpackContextOptions(target) {
		const showBackpack = function(element, actor) {
			return actor.items.find(i => i.type == 'backpack') == null;
		};

		const showTheme = function(element, actor) {
			const themes = actor.items.filter(i => i.type == 'theme');
			return themes?.length < 4;
		};

		const options = [
			{
				name: game.i18n.localize("Litm.ui.add-theme"),
				icon: '<i class="fas fa-edit"></i>',
				condition: element => showTheme(element, this.actor),
				callback: (html) => {
					this._addTheme();
				},
			},
			{
				name: game.i18n.localize("Litm.ui.add-backpack"),
				icon: '<i class="fas fa-exchange-alt"></i>',
				condition: element => showBackpack(element, this.actor),
				callback: (html) => {
					this._addBackpack();
				},
			}
		];

		return options;
	}

	async _onRender(context, options) {
		await super._onRender(context, options);

		let currentScale = 1;
		const prefs = game.settings.get("foundryvtt-litm", "user_prefs");
		if (prefs.sheetViewTags && prefs.sheetViewTags[this.actor._id])
			currentScale = prefs.sheetViewTags[this.actor._id].scale;

		await V2.updateHeader(this, currentScale);
		await this.activateListeners(this.element);

        this.setPosition({scale: currentScale});
		if (this._roll?.rendered)
			this.renderRollDialog();
	}

	activateListeners(html) {
		if (html && html.jquery) {
			html = html[0];
		}

		html.querySelectorAll("[data-dblclick]").forEach(el => { el.addEventListener("dblclick", this._handleDblclick.bind(this)); });
		html.querySelectorAll("[data-context]").forEach(el => { 
			["context", "contextmenu"].forEach( evt =>  {
				el.addEventListener(evt, this._handleContextmenu.bind(this));
			});
		});
		html.querySelectorAll("[data-mousedown]").forEach(el => { el.addEventListener("mousedown", this._handleMouseDown.bind(this)); });
		html.querySelectorAll("[data-drag]").forEach(el => { el.addEventListener("drag", this._onDragHandleMouseDown.bind(this)); });

		html.querySelectorAll("img.avatar").forEach(el => {
			 el.addEventListener("mousedown", this._onImageMouseDown.bind(this));
			 el.addEventListener("mousemove", this._onImageMouseMove.bind(this));
			 el.addEventListener("mouseup", this._onImageMouseUp.bind(this));
		});

		html.querySelectorAll(".litm--character-notes").forEach(el => {
			 el.addEventListener("mousedown", this._onNotesMouseDown.bind(this));
			 el.addEventListener("mousemove", this._onNotesMouseMove.bind(this));
			 el.addEventListener("mouseup", this._onNotesMouseUp.bind(this));
		});

		html.addEventListener("mouseover", (event) => {
			html.querySelectorAll(".litm--character-theme, .litm--character-story-tags").forEach(el => el.classList.remove("hovered"));

			const t = event.target.classList.contains("litm--character-theme")
				? event.target
				: event.target.closest(".litm--character-theme");

			this.#themeHovered = t ? t.dataset.id : null;

			this.#tagsHovered = !!event.target.closest(".litm--character-story-tags");
		});

		html.querySelectorAll(".litm--character-statuses").forEach(el => {
			const handler = this._handleStatusNameChange.bind(this);
			el.addEventListener("keydown", event => {
				if (event.key === "Enter" || event.key === "Tab" || event.key === "Escape")
					handler(event);
			});
			el.addEventListener("blur", (event) => {
				handler(event)
			});
		});


		this._stopNavLabelAutoFit?.();
		this._stopNavLabelAutoFit = this.enableNavLabelAutoFit({
			root: html,
			selector: "span.navLabel",
			minPx: 10,
			maxPx: 22,
			paddingPx: 0
		});

		if (Number.parseFloat(game.version) < 13)
			this.#contextmenu._setPosition = function (html, target) {
				//this.expandUp = true;
				html.classList.toggle("expand-up", this.expandUp);
				target.append(html);
				target.classList.add("context");
			};
	}

	static async #onSubmit(event) {
		const name = event.target.name;
		const isProseMirror = event.target.classList.contains("prosemirror");

		if (isProseMirror) {
			this._notesEditorStyle = "display: none;";
			this.options.document.update({[name] : event.target.value});
			return;
		}
		switch (name) {
			case "name":
				this.actor.update({[name] : event.target.value});
				this.actor.update({"prototypeToken.name" : event.target.value});
				return;
		}
	}

	async _updateObject(event, formData) {
		const cleaned = await this.#handleUpdateEmbeddedItems(formData);
		logger.info(`CharacterSheet _updateObject`);
		return super._updateObject(event, cleaned);
	}

	async _onImageMouseDown(event) {
		if (!event) return;
		this.startX = event.clientX;
      	this.startY = event.clientY;
      	this.isDragging = false;
		this.startDragPosition = { ...this.position };
	}

	async _onImageMouseMove(event) {
		if (this.startX == 0 && this.startY == 0) return;

		const dx = event.clientX - this.startX;
        const dy = event.clientY - this.startY;

        if (dx > 3 || dx < -3 || dy > 3 || dy < -3) {   // threshold to avoid accidental drags
        	this.isDragging = true;

			this.setPosition({
				left: this.startDragPosition.left + dx,
				top:  this.startDragPosition.top  + dy
			});
        }
	}

	async _onImageMouseUp(event) {
		if (!event) return;
		this.startX = 0;
		this.startY = 0;
		this.startDragPosition = {};

		if (this.isDragging) {
			this.isDragging = false;
			return;
        }
		this.isDragging = false;
		if (event.button != 0) return;

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

	async _onNotesMouseDown(event) {
		if (!event) return;
		this.notesStartX = event.clientX;
      	this.notesStartY = event.clientY;
      	this.isDraggingNotes = false;
		const notesPanel = this.element.querySelector(".litm--character-notes");
		const notesStyle = getComputedStyle(notesPanel);
		const left = parseFloat(notesStyle.left.replace('px', ''));
		const top = parseFloat(notesStyle.top.replace('px', ''));
		this.notesStartDragPosition = { left, top };
	}

	async _onNotesMouseMove(event) {
		if (this.notesStartX == 0 && this.notesStartY == 0) return;

		const dx = event.clientX - this.notesStartX;
        const dy = event.clientY - this.notesStartY;

        if (dx > 3 || dx < -3 || dy > 3 || dy < -3) {
        	this.isDraggingNotes = true;

			const notesPanel = this.element.querySelector(".litm--character-notes");
			notesPanel.style.left = (this.notesStartDragPosition.left + dx) + 'px';
			notesPanel.style.top = (this.notesStartDragPosition.top + dy) + 'px';
        }
	}

	async _onNotesMouseUp(event) {
		if (!event) return;
		this.notesStartX = 0;
		this.notesStartY = 0;
		this.notesStartDragPosition = {};

		if (this.isDraggingNotes) {
			this.isDraggingNotes = false;
			return;
        }
		this.isDraggingNotes = false;
	}

	async _handleStatusNameChange(event) {
		event.preventDefault();
		event.stopPropagation();

		const effectId = event.target.dataset.effectId;
		const value = event.target.value;

		const actorId = this.options.document._id;
		const actor = game.actors.get(actorId);
		if (!actor) return;

		const tag = actor.getEmbeddedDocument("ActiveEffect", effectId);
		if (!tag) return;

		if (tag.name == value)
			return;

		tag.name = value;
		await actor.updateEmbeddedDocuments("ActiveEffect", [{
			_id: effectId,
			"name": value,
		}]);

		game.litm.storyTags?.render(true);
		Sockets.dispatch("updateStoryTags", {actorId, effectId, value});
	}

	async _onDrop(dragEvent) {
		if (dragEvent?.dataTransfer == null) return;
		const dragData = dragEvent.dataTransfer.getData("text/plain");
		if (dragData.startsWith('http')) return;
		const data = JSON.parse(dragData);

		// Handle dropping tags and statuses
		if (!["tag", "storyTag", "status"].includes(data.type)) return super._onDrop(dragEvent);

		if (data.type == "storyTag") {
			data.type = "tag";
			var values = [null, null, null, null, null, null];
			if (data.values != '') {
				data.type = "status";

				var vals = data.values.split(',');
				for (var v of vals) {
					if (v) {
						var vi = parseInt(v) - 1;
						values[vi] = v;
					}
				}
			}
			data.values = values;
		}

		var newTag = true;
		if (data.type == "status") {
			const currentTags = await this.actor.getEmbeddedCollection("ActiveEffect");
			for (const currentTag of currentTags) {
				if (currentTag.name == data.name && currentTag.flags["foundryvtt-litm"].type == "status") {
					newTag = false;

					const values = currentTag.flags["foundryvtt-litm"].values;
					for (const value of data.values) {
						if (!value) continue;

						const index = parseInt(value) - 1;
						for (let currentValuesIndex = index; currentValuesIndex <= 5; currentValuesIndex++) {
							if (!values[currentValuesIndex]) {
								values[currentValuesIndex] = `${currentValuesIndex + 1}`;
								break;
							}
						}
					}

					currentTag.flags["foundryvtt-litm"].values = values;
					await this.actor.updateEmbeddedDocuments("ActiveEffect", [{ _id: currentTag.id, flags: currentTag.flags, }]);
					break;
				}
			}
		}

		if (newTag) {
			await this.actor.createEmbeddedDocuments("ActiveEffect", [
				{
					name: data.name,
					flags: {
						"foundryvtt-litm": {
							type: data.type,
							values: data.values,
							isBurnt: data.isBurnt,
						},
					},
				},
			]);
		}

		game.litm.storyTags.render();
		utils.dispatch({
			app: "story-tags",
			type: "render",
		});
	}

	// Prevent dropping more than 4 themes on the character sheet
	async _onDropItem(event, data) {
		const item = await Item.implementation.fromDropData(data);
		if (!["backpack", "theme"].includes(item.type)) return;

		if (this.items.get(item.id)) return this._onSortItem(event, item);

		const numThemes = this.items.filter((i) => i.type === "theme").length;
		if (item.type === "theme" && numThemes >= 4)
			return ui.notifications.warn(
				game.i18n.localize("Litm.ui.warn-theme-limit"),
			);

		const numBackpacks = this.items.filter((i) => i.type === "backpack").length;
		if (item.type === "backpack" && numBackpacks >= 1)
			return this.#handleLootDrop(item);

		return super._onDropItem(event, data);
	}

	_onEditImage(event) {
		if (this.#dragAvatarTimeout) return clearTimeout(this.#dragAvatarTimeout);
		return super._onEditImage(event);
	}

	_handleMouseDown(event) {
		const t = event.target;
		const action = t.dataset.mousedown;

		switch (action) {
			case "keep-open":
				this.#keepOpen(event);
				break;
		}
	}

	_handleDblclick(event) {
		event.preventDefault();
		event.stopPropagation();

		const t = event.target;
		const action = t.dataset.dblclick;
		const name = t.dataset.name;
		let themeId = t.dataset.id;
		const themeThemeId = t.dataset.themeId;
		if (themeThemeId)
			themeId = themeThemeId;

		switch (action) {
			case "return":
				this.#tagsFocused = null;
				t.classList.remove("focused");
				t.style.cssText = this.#tagsFocused;
				break;
			case "flip":
				if (name != null && name)
					return;
				if (!themeId) return;
				let theme;
				
				if (themeId != 'fellowship')
				{
					theme = this.actor.items.get(themeId);
					if (theme == null) return;
				}

				clearTimeout(this._improvementEditTimer);
				this._improvementEditTimer = null;

				this._doFlip(event.currentTarget, theme, themeId);
				break;
			case "select-improvement":
				this._doSelectImprovement(event.currentTarget);
				break;
		}
	}

	_handleContextmenu(event) {
		const t = event.currentTarget;
		const action = t.dataset.context;

		switch (action) {
			case "decrease":
				event.preventDefault();
				event.stopPropagation();
				this._decrease(event);
				break;
			case "remove-effect":
				event.preventDefault();
				event.stopPropagation();
				this._removeEffect(t.dataset.id);
				break;
			case "remove-improvement":
				event.preventDefault();
				event.stopPropagation();
				this._removeImprovement(t);
				break;
			case "show-hide-fellowship":
				event.preventDefault();
				event.stopPropagation();
				const actor = this.options.document;
				const showFellowshipTheme = !actor.system.showFellowshipTheme;
				actor.update({"system.showFellowshipTheme": showFellowshipTheme });
				this.render();
				break;
		}
	}

	_onDragHandleMouseDown(event) {
		this.#dragAvatarTimeout = null;

		const t = event.target;
		const target = t.dataset.drag;
		const parent = $(t).parents(target).first();

		const x = event.clientX - parent.position().left;
		const y = event.clientY - parent.position().top;

		const handleDrag = (event) => {
			if (target === ".window-app") this.#dragAvatarTimeout = true;

			parent.css({
				left: event.clientX - x,
				top: event.clientY - y,
			});
		};

		const handleMouseUp = () => {
			if (this.#dragAvatarTimeout) {
				this.setPosition({
					left: parent.position().left,
					top: parent.position().top,
				});
				this.#dragAvatarTimeout = setTimeout(() => {
					this.#dragAvatarTimeout = null;
				}, 100);
			}

			if (target === "#note") this._notesEditorStyle = parent.attr("style");

			$(document).off("mousemove", handleDrag);
			$(document).off("mouseup", handleMouseUp);
		};

		$(document).on("mousemove", handleDrag);
		$(document).on("mouseup", handleMouseUp);
	}

	static async #addTag(event, target) {
		//const t = event.target;
		await this.actor.createEmbeddedDocuments("ActiveEffect", [
			{
				name: utils.localize("Litm.ui.name-tag"),
				flags: {
					"foundryvtt-litm": {
						type: "tag",
						values: new Array(6).fill(false),
						isBurnt: false,
					},
				},
			},
		]);

		game.litm.storyTags.render();
		utils.dispatch({
			app: "story-tags",
			type: "render",
		});
	}

	async _addTheme() {
		const currentThemes = this.actor.items.filter((it) => it.type === "theme").length;
		this.actor.createEmbeddedDocuments("Item", [
			{
				name: `${utils.localize("TYPES.Item.theme")} ${currentThemes + 1}`,
				type: "theme",
			}
		]);
	}

	async _addBackpack() {
		const backpack = {
			name: utils.localize("TYPES.Item.backpack"),
			type: "backpack"
		};

		this.actor.createEmbeddedDocuments("Item", [backpack]);
	}

	async _removeTheme(id) {
		const item = this.items.get(id);
		if (!(await utils.confirmDelete(`TYPES.Item.${item.type}`))) return;
		return item.delete();
	}

	async _removeEffect(id) {
		const effect = this.actor.effects.get(id);
		if (!(await utils.confirmDelete())) return;

		await effect.delete();

		game.litm.storyTags.render();
		utils.dispatch({
			app: "story-tags",
			type: "render",
		});
	}

	static async #doIncrease(event, target) {
		const t = event.target;
		const attrib = t.dataset.id;
		const id = $(t).parents(".item").data("id");
		if (id == null) {
			const actor = this.options.document;
			if (foundry.utils.hasProperty(actor, attrib)) {
				const value = foundry.utils.getProperty(actor, attrib);
				actor.update({ [attrib]: Math.min(value + 1, 5) });
			}
			return;
		}
		else if (id == 'fellowship') {
			const fellowship = game.settings.get("foundryvtt-litm", "fellowship");
			let value = foundry.utils.getProperty(fellowship, attrib) ?? 0;
			value = Math.min(value + 1, 3);
			Fellowship.update(attrib, value);
			return;
		}

		const item = this.actor.items.get(id);
		if (item == null) return;

		const value = foundry.utils.getProperty(item, attrib) ?? 0;
		if (value == null) return;

		return item.update({ [attrib]: Math.min(value + 1, 3) });
	}

	async _decrease(event) {
		const t = event.currentTarget;
		const attrib = t.dataset.id;
		const id = $(t).parents(".item").data("id");
		if (id == null) {
			const actor = this.options.document;
			if (foundry.utils.hasProperty(actor, attrib)) {
				const value = foundry.utils.getProperty(actor, attrib);
				actor.update({ [attrib]: Math.max(value - 1, 0) });
			}
			return;
		}
		else if (id == 'fellowship') {
			const fellowship = game.settings.get("foundryvtt-litm", "fellowship");
			let value = foundry.utils.getProperty(fellowship, attrib) ?? 0;
			value = Math.max(value - 1, 0);
			Fellowship.update(attrib, value);
			return;
		}
		
		const item = this.items.get(id);
		if (item == null) return;

		const value = foundry.utils.getProperty(item, attrib);
		if (value == null) return;

		return item.update({ [attrib]: Math.max(value - 1, 0) });
	}

	static async #doOpen(event, target) {
		const id = event.target.dataset.id;

		switch (id) {
			case "note":
				this.element.querySelector("#note").style.display = "block";
				this._notesEditorStyle = "display: block;";
				break;
			case "roll":
				this.renderRollDialog();
				break;
		}
	}

	static async #doClose(event, target) {
		const id = event.target.dataset.id;

		switch (id) {
			case "note": {
				const notes = this.element.querySelector("#note");
				this._notesEditorStyle = "display: none;";
				notes.style.display = "none";
			}
		}
	}

	static async #doActivate(event, target) {
		if (event.detail > 1) return;
		event.preventDefault();
		event.stopPropagation();
		const id = event.target.dataset.id;
		const selected = event.target.hasAttribute("data-selected");
		let tag = this.system.allTags.find((t) => t.id === id);
		this.toggleActivateTag(tag, selected);
		this.render();
	}

	static async #doSelect(event, target) {
		// Prevent double clicks from selecting the tag
		if (event.detail > 1) return;
		event.preventDefault();
		event.stopPropagation();

		const t = event.target;
		const toBurn = event.shiftKey;
		const toBurnNoRoll = event.altKey;
		const id = t.dataset.id;
		let tag = this.system.allTags.find((t) => t.id === id);
		tag = structuredClone(tag);
		if (!tag.name || tag.name == "") return;

		const selected = t.hasAttribute("data-selected");

		if (toBurnNoRoll) return this.toggleBurnTag(tag);
		if (!selected && tag.isBurnt) return;

		// Add or remove the tag from the roll
		switch (selected) {
			case true:
				this._roll.removeTag(tag);
				break;
			case false:
				this._roll.addTag(tag, toBurn);
				break;
		}

		// Render the roll dialog if it's open
		if (this._roll.rendered) this._roll.render();
		this.render();
	}

	static async #doBurn(event, target) {
		if (event.detail > 1) return;
		event.preventDefault();
		event.stopPropagation();
		const id = event.target.dataset.id;
		let tag = this.system.allTags.find((t) => t.id === id);
		this.toggleBurnTag(tag, false);
		if (this._roll.rendered) this._roll.render();
		this.render();
	}

	static async #doShowFellowship(event) {
		const actor = this.options.document;
		const showFellowshipTheme = !actor.system.showFellowshipTheme;
		await actor.update({"system.showFellowshipTheme": showFellowshipTheme });
		this.render();
	}

	static async #onSelectStatusLevel(event, target) {
		event.preventDefault();
		event.stopPropagation();

		const effectId = event.target.dataset.effectId;
		const index = parseInt(event.target.dataset.index);
		const tagValue = `${index + 1}`;
		const checked = event.target.checked;
		const actorId = this.options.document._id;
		const actor = game.actors.get(actorId);
		if (!actor) return;

		const tag = actor.getEmbeddedDocument("ActiveEffect", effectId);
		if (!tag) return;

		const flags = tag.flags;
		if (flags && flags["foundryvtt-litm"]?.values && flags["foundryvtt-litm"].values.length > index)
		{
			flags["foundryvtt-litm"].values[index] = checked ? tagValue : null;
			const anyValueSelected = flags["foundryvtt-litm"].values.some(v => v != null);
			if (anyValueSelected)
				flags["foundryvtt-litm"].type = 'status'
			else
				flags["foundryvtt-litm"].type = 'tag'
			await actor.updateEmbeddedDocuments("ActiveEffect", [{
				_id: effectId,
				flags: flags,
			}]);

			game.litm.storyTags?.render(true);
			Sockets.dispatch("updateStoryTags", {actorId, effectId, index, checked});
		}
	}

	static async #showAdvancementHint(event) {
		const type = event.target.dataset.type;
		utils.showAdvancementHint(type);
	}

	static async #onEditImprovement(event) {
		if (event.detail > 1) return;
		event.preventDefault();
		event.stopPropagation();

		clearTimeout(this._improvementEditTimer);
		this._improvementEditTimer = setTimeout(() => {
			this._improvementEditTimer = null;
			this._editImprovement(event);
		}, 220);
	}

	async _editImprovement(event) {
		const id = event.target.dataset.id;
		const themeId = event.target.dataset.themeId;

		let theme;
		if (themeId == 'fellowship') {
			theme = await this._getFellowship();
		} else {
			theme = this.actor.items.find((i) => i.type === "theme" && i.id == themeId);
			if (!theme) return;
		}

		const selector = new SpecialImprovements({theme, actor: this.actor});
		selector.render(true);
	}

	async _doSelectImprovement(target) {
        const id = target.dataset.id;
		const index = target.dataset.index;

		const theme = this.actor.items.find((i) => i.type === "theme" && i.system.specialImprovements.some((t) => t.id === id));
		if (!theme) return;

		const selector = new SpecialImprovements({theme, actor: this.actor});
		selector.render(true);
		
	}

	async _removeImprovement(target) {
        const id = target.dataset.id;
		const index = target.dataset.index;

		const theme = this.actor.items.find((i) => i.type === "theme" && i.system.specialImprovements.some((t) => t.id === id));
		if (!theme) return;

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

	#keepOpen(event) {
		const t = event.target;

		t.classList.add("focused");
		const listener = () => {
			this.#tagsFocused = t.style.cssText;
			t.removeEventListener("mouseup", listener);
		};
		t.addEventListener("mouseup", listener);
	}

	async #handleLootDrop(item) {
		const { contents } = item.system;
		const chosenLoot = await Dialog.wait({
			title: game.i18n.localize("Litm.ui.item-transfer-title"),
			content: await foundry.applications.handlebars.renderTemplate(
				"systems/foundryvtt-litm/templates/apps/loot-dialog.html",
				{ contents, cssClass: "litm--loot-dialog" },
			),
			buttons: {
				loot: {
					icon: '<i class="fas fa-check"></i>',
					label: game.i18n.localize("Litm.other.transfer"),
					callback: (html) => {
						const chosenLoot = html
							.find("input[type=checkbox]:checked")
							.map((_, i) => i.value)
							.get();
						return chosenLoot;
					},
				},
			},
		});
		if (!chosenLoot || !chosenLoot.length) return;

		const loot = contents.filter((i) => chosenLoot.includes(i.id));
		const backpack = this.items.find((i) => i.type === "backpack");

		if (!backpack) {
			error("Litm.ui.error-no-backpack");
			throw new Error("Litm.ui.error-no-backpack");
		}

		// Add the loot to the backpack
		await backpack.update({
			"system.contents": [...this.system.backpack, ...loot],
		});
		// Remove the loot from the item
		await item.update({
			"system.contents": contents.filter((i) => !chosenLoot.includes(i.id)),
		});

		ui.notifications.info(
			game.i18n.format("Litm.ui.item-transfer-success", {
				items: loot.map((i) => i.name).join(", "),
			}),
		);
		backpack.sheet.render(true);
	}

	async #handleUpdateEmbeddedItems(formData) {
		const itemMap = {};
		for (const [key, value] of Object.entries(formData)) {
			if (!key.startsWith("items.")) continue;

			delete formData[key];
			const [_, _id, subkey, ...rest] = key.split(".");
			itemMap[_id] ??= {};
			itemMap[_id][subkey] ??= {};
			if (rest.length === 0) itemMap[_id][subkey] = value;
			else itemMap[_id][subkey][rest.join(".")] = value;
		}

		const itemsToUpdate = Object.entries(itemMap).reduce((acc, [id, data]) => {
			acc.push({ _id: id, ...data });
			return acc;
		}, []);

		if (itemsToUpdate.length)
			await this.actor.updateEmbeddedDocuments("Item", itemsToUpdate);

		const effectMap = {};
		for (const [key, value] of Object.entries(formData)) {
			if (!key.startsWith("effects.")) continue;

			delete formData[key];
			const [_, _id, subkey, ...rest] = key.split(".");
			effectMap[_id] ??= {};
			effectMap[_id][subkey] ??= {};
			if (rest.length === 0) effectMap[_id][subkey] = value;
			else effectMap[_id][subkey][rest.join(".")] = value;
		}

		const effectsToUpdate = Object.entries(effectMap).reduce(
			(acc, [id, data]) => {
				acc.push({ _id: id, ...data });
				return acc;
			},
			[],
		);

		if (effectsToUpdate.length) {
			await this.actor.updateEmbeddedDocuments("ActiveEffect", effectsToUpdate);
			game.litm.storyTags.render();
			dispatch({
				app: "story-tags",
				type: "render",
			});
		}

		return formData;
	}

	_broadcastRender() {
		dispatch({ app: "story-tags", type: "render" });
		this.render();
	}

	_doFlip(html, theme, themeId) {
		// Find the card container for this item
		const card = html.closest(".litm--theme-background");
		if (!card) return;

		const inner = card.querySelector(".litm--theme-inner");
		if (!inner) return;

		// Just toggle the flipped class
		inner.classList.toggle("is-flipped");

		let isFlipped;
		if (themeId == 'fellowship') {
			isFlipped = !this.options.document.system.flippedFellowshipCard;

			setTimeout(() => {
				this.options.document.update({ "system.flippedFellowshipCard": isFlipped });
			}, 500);
		}
		else if (theme) {
			isFlipped = inner.classList.contains("is-flipped");

			setTimeout(() => {
				theme.update({ "system.flipped": isFlipped });
			}, 500);
		}		
	}

	async _getFellowship() {
		const fellowship = game.settings.get("foundryvtt-litm", "fellowship");
		let changes = false;
		if (fellowship.name == "") {
			fellowship.name = game.i18n.localize("Litm.fellowship.defaultName");
			changes = true;
		}
		if (fellowship.system.motivation == "") {
			fellowship.system.motivation = game.i18n.localize("Litm.fellowship.defaultMission");
			changes = true;
		}
		if (fellowship.system.note == "") {
			fellowship.system.note = game.i18n.localize("Litm.fellowship.defaultDescription");
			changes = true;
		}
		if (fellowship.system.themebook == "") {
			fellowship.system.themebook = game.i18n.localize("Litm.ui.fellowship");
			changes = true;
		}
		if (fellowship.system.level != "fellowship") {
			fellowship.system.level = "fellowship";
			changes = true;
		}
        if (!fellowship.system.specialImprovements || fellowship.system.specialImprovements.length == 0) fellowship.system.specialImprovements = Array(5)
							.fill()
							.map((_, i) => ({
								id: foundry.utils.randomID(),
								name: "",
								description: "",
								improvementId: "",
								type: "specialImprovement",
							}));

		const filledSpecialImprovements = structuredClone(fellowship.system.specialImprovements.filter(i => i.improvementId != null && i.improvementId != ""));
		const emptySpecialImprovements = structuredClone(fellowship.system.specialImprovements.filter(i => i.improvementId == null || i.improvementId == ""));
		for (const specialImprovements of filledSpecialImprovements) {
			specialImprovements.renderedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(specialImprovements.description);
		}
		fellowship.system.specialImprovements = [...filledSpecialImprovements, ...emptySpecialImprovements];

		for (const fellowshipPowerTag of fellowship.system.powerTags) {
			fellowshipPowerTag.isSingleUse = true;
			fellowshipPowerTag.isScratched = fellowshipPowerTag.isBurnt;
		}
		fellowship.system.isScratched = fellowship.system.isBurnt;

		if (changes && game.user.isGM)
			game.settings.set("foundryvtt-litm", "fellowship", fellowship);

		fellowship.system.flipped = this.options.document?.system?.flippedFellowshipCard;

		fellowship.themesrc = "systems/foundryvtt-litm/assets/media/fellowship";
		fellowship._id = 'fellowship';
		return fellowship;
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

	enableNavLabelAutoFit({
		root,
		selector = "span.navLabel",
		minPx = 10,
		maxPx = 22,
		paddingPx = 0
	} = {}) {
		if (!root) 
			return;

		const scheduled = new WeakSet();

		function scheduleFit(el) {
			if (!el || scheduled.has(el)) return;
			scheduled.add(el);
			requestAnimationFrame(() => {
				scheduled.delete(el);
				fitToWidth(el);
			});
		}

		function fitToWidth(el) {
			if (!el.isConnected) return;

			const available = Math.floor(el.clientWidth - paddingPx * 2);
			if (available <= 0) return;

			// Keep single line while measuring
			const prevWhiteSpace = el.style.whiteSpace;
			el.style.whiteSpace = "nowrap";

			const fits = () => el.scrollWidth <= available;

			// If even min doesn't fit, keep min (optionally add ellipsis yourself in CSS)
			el.style.fontSize = `${minPx}px`;
			if (!fits()) {
				el.style.whiteSpace = prevWhiteSpace;
				return;
			}

			// If max fits, use it
			el.style.fontSize = `${maxPx}px`;
			if (fits()) {
				el.style.whiteSpace = prevWhiteSpace;
				return;
			}

			// Binary search
			let lo = minPx;
			let hi = maxPx;
			while (lo + 1 < hi) {
				const mid = (lo + hi) >> 1;
				el.style.fontSize = `${mid}px`;
				if (fits()) lo = mid;
				else hi = mid;
			}

			el.style.fontSize = `${lo}px`;
			el.style.whiteSpace = prevWhiteSpace;
		}

		const ro = new ResizeObserver(entries => {
			for (const entry of entries) scheduleFit(entry.target);
		});

		function observeOne(el) {
			ro.observe(el);
			scheduleFit(el);
		}

		// Observe existing labels
		root.querySelectorAll(selector).forEach(observeOne);

		// Observe newly-rendered labels + text changes
		const mo = new MutationObserver(mutations => {
			for (const m of mutations) {
				if (m.type === "childList") {
					for (const node of m.addedNodes) {
					if (!(node instanceof Element)) continue;
					if (node.matches?.(selector)) observeOne(node);
					node.querySelectorAll?.(selector).forEach(observeOne);
					}
				} else if (m.type === "characterData") {
					const el = m.target?.parentElement?.closest?.(selector);
					if (el) scheduleFit(el);
				}
			}
		});

		mo.observe(root, { childList: true, subtree: true, characterData: true });

		// Return cleanup
		return () => {
			ro.disconnect();
			mo.disconnect();
		};
	}
}

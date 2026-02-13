import StoryTheme from "./story-theme.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api
export class StoryTagApp extends HandlebarsApplicationMixin(ApplicationV2) {
	#dragDrop
	
	constructor(options) {
		super();
		this.#dragDrop = this.#createDragDropHandlers();
		this.storyThemeSheets = [];
	}

	/** @inheritdoc */
	static DEFAULT_OPTIONS = {
    	tag: "form",
		classes: ["app", "litm", "litm--story-tags", "themed", "theme-light"],
		position: {
    		width: 312,
    		height: 500,
			top: 50,
			left: window.innerWidth - 670,
  		},
		window: {
			resizable: true,
    		title: "Litm.ui.manage-tags",
			controls: [],
  		},
		form: {
			handler: this.#onSubmit,
    		closeOnSubmit: false,
		    submitOnChange: true,
  		},
		actions: {
			addTag: this.#onAddTag,
			makeStoryTheme: this.#onMakeStoryTheme,
			openSheet: this.#onOpenSheet,
			removeAllTags: this.#onRemoveAllTags,
			removeActor: this.#onRemoveActor,
			burnTag: this.#onBurnTag,
			selectLevel: this.#onSelectLevel,
		},
		dragDrop: [{dragSelector: "[data-drag]", dropSelector: "form"}],
  	}

	/** @inheritdoc */
	static PARTS = {
		form: { template: "systems/foundryvtt-litm/templates/apps/story-tags.html" }
	}

	async getTitle() {
	    return utils.localize("Litm.ui.manage-tags");
	}

	async _onFirstRender(context, options) {
		this._createContextMenu(this._getStoryTagContextOptions, "[data-context='story-tag']", {
			hookName: "LitmStoryTagItemsContextMenu",
			jQuery: false,
      		parentClassHooks: false,
      		fixed: true,
    	});

		this._createContextMenu(this._getActorContextOptions, "[data-context='actor']", {
			hookName: "LitmActorContextMenu",
			jQuery: false,
      		parentClassHooks: false,
      		fixed: true,
    	});

		this._createContextMenu(this._getItemContextOptions, "[data-context='menu']", {
			hookName: "LitmStoryTagsContextMenu",
			jQuery: false,
      		parentClassHooks: false,
      		fixed: true,
    	});

		const prefs = game.settings.get("foundryvtt-litm", "user_prefs");
		if (prefs.storyTags == null || !prefs.storyTags)
		{
			prefs.storyTags = true;
			game.settings.set("foundryvtt-litm", "user_prefs", prefs);
		}

		super._onFirstRender(context, options);
	}

	_getActorContextOptions(target) {
		const canEdit = function(element, actor) {
			let result = game.user.isGM;
			return result;
		};

		const options = [
			{
				name: game.i18n.localize("Litm.ui.remove-actor"),
				icon: "<i class='fas fa-user-slash'></i>",
				condition: (element) => canEdit(element),
				callback: async (element) => {
					if (!game.user.isGM) return;
					const id = element.dataset.id;
					const name = element.dataset.name;
					if (!(await utils.confirmDelete(name))) return;

					await this.setActors(this.config.actors.filter((a) => a !== id));
					this._broadcastRender();
				},
			},
		];

		return options;
	}

	_getItemContextOptions(target) {
		const canEdit = function(element, actor) {
			let result = game.user.isGM;
			return result;
		};

		const options = [
			{
				name: game.i18n.localize("Litm.ui.remove-story-tags"),
				icon: '<i class="fas fa-tags"></i>',
				condition: element => canEdit(element, this.actor),
				callback: (element) => {
					this.setTags([]);
				},
			},
			{
				name: game.i18n.localize("Litm.ui.remove-actors"),
				icon: "<i class='fas fa-user-slash'></i>",
				condition: element => canEdit(element, this.actor),
				callback: (element) => {
					this.setActors([]);
				},
			},
		];

		return options;
	}

	_getStoryTagContextOptions(target) {
		const canEdit = function(element, actor) {
			let result = game.user.isGM;
			return result;
		};

		const canEditAndIsStory = function(element, actor) {
			const type = element.dataset.type;
			let result = game.user.isGM;
			return result && type == "story";
		};

		const options = [
			{
				name: game.i18n.localize("Litm.ui.remove-tag"),
				icon: '<i class="fas fa-tags"></i>',
				condition: element => canEdit(element, this.actor),
				callback: (element) => {
					this._onRemoveTag(element);
				},
			},
			{
				name: game.i18n.localize("Litm.ui.make-story-theme"),
				icon: "<i class='fas fa-user-slash'></i>",
				condition: element => canEditAndIsStory(element, this.actor),
				callback: (element) => {
					this._makeStoryTheme(element);
				},
			},
		];

		return options;
	}

	async _onRender(force, options) {
		const resizeHandle = this.element.querySelector("div.window-resize-handle");
		if (resizeHandle) {
			if (resizeHandle.innerHTML == '') {
				resizeHandle.innerHTML = '<i inert class="fa-solid fa-left-right fa-rotate-by"></i>';
			}
		}

		await this.activateListeners(this.element);
		this.#dragDrop.forEach((d) => d.bind(this.element));

		requestAnimationFrame(() => {
			this.openStoryThemes();
		});
	}

	async _onClose(options) {
		const prefs = game.settings.get("foundryvtt-litm", "user_prefs");
		if (prefs.storyTags == null || prefs.storyTags)
		{
			prefs.storyTags = false;
			game.settings.set("foundryvtt-litm", "user_prefs", prefs);
		}

		for (const storyThemeSheet of this.storyThemeSheets) {
			if (storyThemeSheet.rendered)
				storyThemeSheet.close();
		}
		this.__storyThemesOpened = false;
	}

	_onPosition(position) {
    	super._onPosition(position);
    	//logger.info(`Moved to ${position.left} ${position.top}`);
		for (const storyThemeSheet of this.storyThemeSheets) {
			if (storyThemeSheet?.rendered)
				storyThemeSheet.moveToParents(position);
		}
  	}

	activateListeners(html) {
		if (html && html.jquery) {
			html = html[0];
		}

		//html.querySelectorAll('input[type="text"]').forEach(input => {
			//input.addEventListener("contextmenu", event => {
			//	this._onRemoveTag(event);
			//});
		//});

		html.querySelectorAll("[data-focus]").forEach(el => {
			el.addEventListener("focus", event => {
				const li = event.currentTarget.closest("li");
				const source = li.dataset.type;
				if (source != "story" || game.user.isGM)
					event.currentTarget.select();
			});
		});

		html.querySelectorAll(".window-header").forEach(el => {
			el.addEventListener("pointerup", event => {
				const form = event.target.closest("form");
				const left = parseInt(form.style.left.replace('px', ''));
				const top = parseInt(form.style.top.replace('px', ''));
				const prefs = game.settings.get("foundryvtt-litm", "user_prefs");
				if (!prefs.storyTagsPosition) prefs.storyTagsPosition = [];
				prefs.storyTagsPosition = [left, top];
				game.settings.set("foundryvtt-litm", "user_prefs", prefs);
			});
		});

		window.addEventListener("resize", () => {
			if (this.rendered) this.setPosition({ left: window.innerWidth - 605 });
		});

		game.socket.on("system.foundryvtt-litm", async (data) => {
			if (data.app !== "story-tags") return;
			switch (data.type) {
				case "update":
					this._doUpdate(data.component, data.data);
					break;
				case "render":
					this.render();
					break;
			}
		});
	}

	#createDragDropHandlers() {
		return this.options.dragDrop.map((d) => {
			d.permissions = {
				dragstart: this._canDragStart.bind(this),
				drop: this._canDragDrop.bind(this)
			};
			d.callbacks = {
				dragstart: this._onDragStart.bind(this),
				dragover: this._onDragOver.bind(this),
				drop: this._onDrop.bind(this)
			};
			return new foundry.applications.ux.DragDrop(d);
		})
	}

	/** @inheritdoc */
	// Only GM can drop actors onto the board
	_canDragDrop() {
		return game.user.isGM;
	}

	/** @inheritdoc */
	_canDragStart() {
		return game.user.isGM;
	}

	/** @override */
	async _onDragStart(event) {
		const li = event.currentTarget;
		const payload = {
			type: "storyTag",
			id: li.dataset.id,
			name: li.dataset.value,
			values: li.dataset.values,
			isBurnt: li.dataset.isburnt,
			level: li.dataset.level
		};

		if (payload.values != '') payload.isBurnt = 'false';

		event.dataTransfer.setData("text/plain", JSON.stringify(payload));
		event.dataTransfer.setData("application/json", JSON.stringify(payload));		
	}

	/** @override */
	async _onDragOver(event) {
	}

	/** @override */
	async _prepareContext(options)
	{
		const actors = this.actors
				.filter(a => game.user.isGM || a.isOwner)
				.sort((a, b) => a.name.localeCompare(b.name))
				.sort((_a, b) => (b.type === "challenge" ? 1 : -1));
				
		const tags = this.tags || [];

		const context = {
			actors,
			tags,
			isGM: game.user.isGM,
		};
		return context;
	}

	async _preparePartContext(partId, context, options)
	{
		return context;
	}

	get config() {
		const config = game.settings.get("foundryvtt-litm", "storytags");
		if (!config || foundry.utils.isEmpty(config))
			return { actors: [], tags: [], storyThemes: [] };
		return config;
	}

	get actors() {
		return (
			this.config.actors
				?.map((id) => game.actors.get(id))
				.filter(Boolean)
				.map((actor) => ({
					name: actor.name,
					type: actor.type,
					img: actor.prototypeToken.texture.src || actor.img,
					id: actor._id,
					isOwner: actor.isOwner,
					tags: actor.effects
						.filter((e) => !!e.flags["foundryvtt-litm"]?.type)
						.map((e) => ({
							id: e._id,
							name: e.name,
							values: e.flags["foundryvtt-litm"].values,
							isBurnt: e.flags["foundryvtt-litm"].isBurnt,
							value: (e.flags["foundryvtt-litm"].values && Array.isArray(e.flags["foundryvtt-litm"].values) ? e.flags["foundryvtt-litm"].values.findLast((v) => !!v) : []),
							type: (e.flags["foundryvtt-litm"].values && Array.isArray(e.flags["foundryvtt-litm"].values) ? (e.flags["foundryvtt-litm"].values.some((v) => !!v) ? "status" : "tag") : "tag"),
							level: e.flags["foundryvtt-litm"].level,
						}))
						.sort((a, b) => a.name.localeCompare(b.name))
						.sort((a, b) =>
							a.type === b.type ? 0 : a.type === "status" ? -1 : 1,
						),
				})) || []
		);
	}

	get tags() {
		return (this.config.tags ?? [])
			.sort((a, b) => a.name.localeCompare(b.name))
			.sort((a, b) => (a.type === b.type ? 0 : a.type === "status" ? -1 : 1));
	}

	get storyThemes() {
		return (this.config.storyThemes ?? [])
			.sort((a, b) => a.name.localeCompare(b.name))
			.sort((a, b) => (a.type === b.type ? 0 : a.type === "status" ? -1 : 1));
	}

	async setActors(actors) {
		await game.settings.set("foundryvtt-litm", "storytags", { ...this.config, actors });
		return this._broadcastRender();
	}

	async setTags(tags) {
		await game.settings.set("foundryvtt-litm", "storytags", { ...this.config, tags });
		return this._broadcastRender();
	}

	async setStoryThemes(storyThemes) {
		await game.settings.set("foundryvtt-litm", "storytags", { ...this.config, storyThemes });
		return this._broadcastRender();
	}

	async _updateObject(_event, formData) {
		const data = foundry.utils.expandObject(formData);
		if (foundry.utils.isEmpty(data)) return;

		const { story, ...actors } = data;

		await Promise.all(
			Object.entries(actors).map(([id, tags]) =>
				this._updateTagsOnActor({
					id,
					tags: Object.entries(tags).map(([tagId, data]) => ({
						_id: tagId,
						name: data.name,
						flags: {
							"foundryvtt-litm": {
								type: data.values.some((v) => v !== null) ? "status" : "tag",
								values: data.values,
								isBurnt: data.isBurnt,
							},
						},
					})),
				}),
			),
		);

		const storyTags = Object.entries(story || {}).map(([tagId, data]) => ({
			id: tagId,
			name: data.name,
			values: data.values,
			isBurnt: data.isBurnt,
			type: data.values.some((v) => v !== null) ? "status" : "tag",
			value: data.values.filter((v) => v !== null).at(-1),
		}));

		if (game.user.isGM) await this.setTags(storyTags);
		else this._broadcastUpdate("tags", storyTags);
	}

	async _onDrop(dragEvent) {
		const dragData = dragEvent.dataTransfer.getData("text/plain");
		const data = JSON.parse(dragData);

		// Handle only Actors to begin with
		if (!["Actor", "tag", "status"].includes(data.type)) return;
		const id = data.uuid?.split(".").pop() || data.id;

		// Add tags and statuses to the story / Actor
		if (data.type === "tag" || data.type === "status") {
			const target = dragEvent.target.closest("[data-id]")?.dataset.id;
			if (target) {
				return this._addTagToActor({
					id: target,
					tag: data,
				});
			}

			if (game.user.isGM) return this.setTags([...this.tags, data]);
			return this._broadcastUpdate("tags", [...this.tags, data]);
		}

		if (this.config.actors.includes(id)) return;

		// Add current tags and statuses from a challenge
		const actor = game.actors.get(id);
		if (
			actor.type === "challenge" &&
			actor.effects.size === 0 &&
			actor.system.tags.length
		) {
			const tags = actor.system.tags.matchAll(CONFIG.litm.tagStringRe);
			await actor.createEmbeddedDocuments(
				"ActiveEffect",
				Array.from(tags).map(([_, name, value]) => ({
					name,
					flags: {
						"foundryvtt-litm": {
							type: value ? "status" : "tag",
							values: Array(6)
								.fill()
								.map((_, i) =>
									Number.parseInt(value) === i + 1 ? value : null,
								),
							isBurnt: false,
						},
					},
				})),
			);
		}

		await this.setActors([...this.config.actors, id]);
	}

	static async #onSubmit(event, target) {
		const name = event.target.name;
		const nameParts = name.split('.');
		if (nameParts.length == 3) {
			const actorId = nameParts[0];
			const id = nameParts[1];
			const type = nameParts[2];

			if (actorId == 'story') {
				if (!game.user.isGM) return;
				const tags = this.tags;
				const tag = tags.find(t => t.id == id);
				if (tag) {
					if (type == "name") {
						tag.name = event.target.value;
					}
					else if (type == "values") {
						const checked = event.target.checked;
						const tagValue = event.target.value;
						const level = parseInt(event.target.value);

						if (tag.values && tag.values.length >= level)
						{
							tag.values[level - 1] = checked ? tagValue : null;
							const anyValueSelected = tag.values.some(v => v != null);
							if (anyValueSelected)
								tag.type = 'status'
							else
								tag.type = 'tag'
						}
					}
					else if (type == "isBurnt") {
						const checked = event.target.checked;
						tag.isBurnt = checked;
					}
				}
				await game.settings.set("foundryvtt-litm", "storytags", { ...this.config, tags });
				event.target.blur();
				this.render(true);
			} else {
				const actor = game.actors.get(actorId);
				if (actor) {
					if (type == "name") {
						const name = event.target.value;
						await actor.updateEmbeddedDocuments("ActiveEffect", [{_id: id, name}]);
						event.target.blur();
					}
				}
			}
			this._broadcastStoryTagChange();
		}
	}

	static async #onAddTag(event, target) {
		const id = event.target.dataset.id;

		const tag = {
			name: utils.localize("Litm.ui.name-tag"),
			values: Array(6)
				.fill()
				.map(() => null),
			type: "tag",
			isBurnt: false,
			id: foundry.utils.randomID(),
		};

		if (id === "story") {
			if (game.user.isGM) {
				this.setTags([...this.tags, tag]);
				this._broadcastStoryTagChange();
				return this._broadcastUpdate("tags", [...this.tags, tag]);
			}
		}

		return this._addTagToActor({ id, tag });
	}

	static async #onMakeStoryTheme(event, target) {
		if (!game.user.isGM) return;
		return this._makeStoryTheme(event.target);
	}

	static async #onOpenSheet(event, target) {
		const actor = game.actors.get(event.target.dataset.id);
		actor.sheet.render(true);
	}

	static async #onRemoveAllTags(event, target) {
		event.preventDefault();
		event.stopPropagation();

		if (!this.config.tags.length || !(await utils.confirmDelete())) return;
		if (game.user.isGM) {
			this.setTags([]);
			return this._broadcastUpdate("tags", []);
		}
	}

	static async #onRemoveActor(event, target) {
		const id = event.target.dataset.id;
		const name = event.target.dataset.name;
		event.preventDefault();
		event.stopPropagation();

		if (!game.user.isGM) return;
		if (!(await utils.confirmDelete(name))) return;

		await this.setActors(this.config.actors.filter((a) => a !== id));
		this._broadcastRender();
	}

	static async #onBurnTag(event, target) {
		const source = event.target.name;
		const checked = event.target.checked;
		const sourceParts = source.split('.');
		if (sourceParts.length == 3) {
			const actorId = sourceParts[0];
			const id = sourceParts[1];
			const type = sourceParts[2];

			if (actorId == "story") {
				if (game.user.isGM) {
					const tag = this.config.tags.find((t) => t.id == id);
					tag.isBurnt = checked;

					this.setTags([...this.tags]);
					this._broadcastRender();
					this.renderRollDialogs();
				}
			} else {
				const actor = game.actors.get(actorId);
				if (actor) {
					if (type == "isBurnt") {
						const tag = actor.getEmbeddedDocument("ActiveEffect", id);
						if (tag) {
							const flags = tag.flags;
							flags["foundryvtt-litm"].isBurnt = checked;
							await actor.updateEmbeddedDocuments("ActiveEffect", [{
								_id: id,
								flags: flags,
							}]);
						}
					}
				}
			}
			if (game.user.isGM) 
				return this._broadcastStoryTagChange();
			else
				this.render();
		}
	}

	static async #onSelectLevel(event, target) {
		const source = event.target.name;
		const tagValue = event.target.value;
		const level = parseInt(event.target.value);
		const sourceParts = source.split('.');
		if (sourceParts.length == 3) {
			const actorId = sourceParts[0];
			const id = sourceParts[1];
			const type = sourceParts[2];

			const actor = game.actors.get(actorId);
			if (actor) {
				if (type == "values") {
					const checked = event.target.checked;
					const tag = actor.getEmbeddedDocument("ActiveEffect", id);
					if (tag) {
						const flags = tag.flags;
						if (flags && flags["foundryvtt-litm"]?.values && flags["foundryvtt-litm"].values.length >= level)
						{
							flags["foundryvtt-litm"].values[level - 1] = checked ? tagValue : null;
							const anyValueSelected = flags["foundryvtt-litm"].values.some(v => v != null);
							if (anyValueSelected)
								flags["foundryvtt-litm"].type = 'status'
							else
								flags["foundryvtt-litm"].type = 'tag'
							await actor.updateEmbeddedDocuments("ActiveEffect", [{
								_id: id,
								flags: flags,
							}]);

							this._broadcastRender();
						}
					}
				}
			}
			if (game.user.isGM) 
				return this._broadcastStoryTagChange();
			else
				this.render();
		}
	}

	async _makeStoryTheme(target) {
		logger.info(`Making a new Story Theme.`);
		if (!game.user.isGM) return;
		const tagId = target.dataset.id;

		const tag = this.config.tags.find((t) => t.id == tagId);
		if (!tag) return;
		const tags = this.config.tags.filter((t) => t.id != tagId);

		const storyTheme = {
			name: tag.name,
			type: "storyTheme",
			tags: [],
			isBurnt: false,
			id: foundry.utils.randomID(),
		};
		let storyThemes = structuredClone(this.config.storyThemes);
		if (!storyThemes) storyThemes = [];
		storyThemes.push(storyTheme);
		
		const style = getComputedStyle(this.element);
		const newIndex = this.storyThemeSheets.length;
		const zIndex = parseInt(style.zIndex) - storyThemes.length + newIndex;
		const storyThemeSheet = new StoryTheme({id: storyTheme.id, index: newIndex, left: this.position.left, top: this.position.top, app: this, zIndex, name: tag.name, theme: storyTheme});
		this.storyThemeSheets.push(storyThemeSheet);
		await storyThemeSheet.render(true);

		this.config.tags = tags;
		this.setTags(tags);
		this.setStoryThemes(storyThemes);
		this._broadcastStoryTagChange();
		this.render();
	}

	async removeStoryTheme(id) {
		let storyThemes = structuredClone(this.config.storyThemes);
		if (!storyThemes) return;
		storyThemes = storyThemes.filter(st => st.id != id);
		await this.setStoryThemes(storyThemes);
		const idx = this.storyThemeSheets.findIndex(sts => sts.themeId == id);
		this.storyThemeSheets.splice(idx, 1);
		await this._broadcastStoryTagChange();
	}

	async _onRemoveTag(target) {
		//event.preventDefault();
		//event.stopPropagation();
		//event.target.blur();

		//const id = event.target.dataset.id;
		//const type = event.target.dataset.type;
		const id = target.dataset.id;
		const type = target.dataset.type;
		const value = target.dataset.value;

		if (type === "story") {
			if (!(await utils.confirmDelete(value))) return;

			if (game.user.isGM)
				return this.setTags(this.config.tags.filter((t) => t.id !== id));
			this._broadcastStoryTagChange();
			return this._broadcastUpdate(
				"tags",
				this.config.tags.filter((t) => t.id !== id),
			);
		} else {
			this._broadcastStoryTagChange();
			return this._removeTagFromActor({ actorId: type, id, value });
		}
	}

	async _addTagToActor({ id, tag }) {
		const actor = game.actors.get(id);
		if (!actor)
			return ui.notifications.error("Litm.ui.error-no-actor", {
				localize: true,
			});
		if (!actor.isOwner)
			return ui.notifications.error("Litm.ui.warn-not-owner", {
				localize: true,
			});

		await actor.createEmbeddedDocuments("ActiveEffect", [
			{
				name: tag.name,
				flags: { "foundryvtt-litm": { type: "tag", values: tag.values, isBurnt: false } },
			},
		]);
		this._broadcastStoryTagChange();
		return this._broadcastRender();
	}

	async _updateTagsOnActor({ id, tags }) {
		const actor = game.actors.get(id);
		this._broadcastStoryTagChange();
		return actor.updateEmbeddedDocuments("ActiveEffect", tags);
	}

	async _removeTagFromActor({ actorId, id, value }) {
		const actor = game.actors.get(actorId);

		if (!actor)
			return ui.notifications.error("Litm.ui.error-no-actor", {
				localize: true,
			});
		if (!actor.isOwner) return;

		if (!(await utils.confirmDelete(value))) return;

		this._broadcastStoryTagChange();
		await actor.deleteEmbeddedDocuments("ActiveEffect", [id]);
		return this._broadcastRender();
	}

	async renderRollDialogs() {
		const actorSheets = [...foundry.applications.instances.values()];//.filter(app => app instanceof foundry.applications.sheets.CharacterSheet);
		for (const sheet of actorSheets) {
			if (sheet._roll?.rendered)
				sheet._roll.render();
		}
	}

	/**  Start Socket Methods  */
	_broadcastUpdate(component, data) {
		utils.dispatch({ app: "story-tags", type: "update", component, data });
	}

	_broadcastRender() {
		utils.dispatch({ app: "story-tags", type: "render" });
		this.render();
	}

	_broadcastStoryTagChange() {
		const isGM = game.user.isGM;
		const user = game.user.id;
		return game.socket.emit("system.foundryvtt-litm", { event: "storyTagChange", senderId: user, isGM });
	}

	async _doUpdate(component, data) {
		if (!game.user.isGM) return;
		if (component === "tags") return this.setTags(data);
	}

	async burnTag(tag) {
		if (this.tags?.length) {
			const storyTag = this.tags.find(t => t.id == tag.id);
			if (storyTag) {
				storyTag.isBurnt = tag.state == "burned";
				this.setTags(this.tags);
				this.render();
				return;
			}
		}

		if (this.storyThemes?.length) {
			for (const storyTheme of this.storyThemes) {
				if (storyTheme.id == tag.id) {
					storyTheme.isBurnt = tag.state == "burned";
					await this.setStoryThemes(this.storyThemes);
					this.storyThemeSheets.find(s => s.themeId == storyTheme.id)?.render();
					this.render();
					return;
				}

				for (const storyThemeTag of storyTheme.tags ?? []) {
					if (storyThemeTag.id == tag.id)
					{
						storyThemeTag.isBurnt = tag.state == "burned";
						await this.setStoryThemes(this.storyThemes);
						this.storyThemeSheets.find(s => s.themeId == storyTheme.id)?.render();
						this.render();
						return;
					}
				}
			}
		}

		if (this.actors?.length) {
			const actor = this.actors.find(a => a.tags?.length && a.tags.some(t => t.id == tag.id));
			if (actor) {
				const actorTag = actor.tags.find(t => t.id == tag.id);
				actorTag.isBurnt = tag.state == "burned";

				const gameActor = game.actors.get(actor.id);
				const gameActorTag = gameActor.getEmbeddedDocument("ActiveEffect", tag.id);
				if (gameActorTag) {
					const flags = gameActorTag.flags;
					flags["foundryvtt-litm"].isBurnt = actorTag.isBurnt;
					await gameActor.updateEmbeddedDocuments("ActiveEffect", [{
						_id: tag.id,
						flags: flags,
					}]);
				}

				this.render();
				return;
			}
		}
	}

	async openStoryThemes() {
		if (this.__storyThemesOpened) return;
		const storyThemes = this.storyThemes;
		const rect = this.element.getBoundingClientRect();
		const style = getComputedStyle(this.element);
		const left = rect.left;
		const top = rect.top;

		if (this.storyThemeSheets.length > storyThemes.length) {
			this.storyThemeSheets.length = storyThemes.length;
		} else if (this.storyThemeSheets.length < storyThemes.length) {
			this.storyThemeSheets.push(...Array(storyThemes.length - this.storyThemeSheets.length).fill(null));
		}

		for (let index = storyThemes.length - 1; index >= 0; index--) {
			const storyTheme = storyThemes[index];
			const zIndex = parseInt(style.zIndex) - storyThemes.length + index;

			let storyThemeSheet;
			if (this.storyThemeSheets[index] == null) {
				storyThemeSheet = new StoryTheme({id: storyTheme.id, index, left, top, app: this, zIndex});
			} else {
				storyThemeSheet = this.storyThemeSheets[index];
			}

			if (!storyThemeSheet.rendered)
			{
				await storyThemeSheet.render(true);
				await storyThemeSheet.moveToParents({left, top});
				storyThemeSheet.sendBehind();
			}

			if (this.storyThemeSheets[index] == null)
				this.storyThemeSheets[index] = storyThemeSheet;
		}
		this.__storyThemesOpened = true;
	}
	/**  End Socket Methods  */
}

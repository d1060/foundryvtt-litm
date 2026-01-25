import { confirmDelete, dispatch, localize as t } from "../utils.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api
export class StoryTagApp extends HandlebarsApplicationMixin(ApplicationV2) {
	#dragDrop
	
	constructor(options) {
		super();
		this.#dragDrop = this.#createDragDropHandlers();
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
			openSheet: this.#onOpenSheet,
			removeAllTags: this.#onRemoveAllTags,
			removeActor: this.#onRemoveActor,
			burnTag: this.#onBurnTag,
			selectLevel: this.#onSelectLevel,
		},
		dragDrop: [{dropSelector: "form"}],
  	}

	/** @inheritdoc */
	static PARTS = {
		form: { template: "systems/foundryvtt-litm/templates/apps/story-tags.html" }
	}

	async getTitle() {
	    return t("Litm.ui.manage-tags");
	}

	async _onFirstRender(context, options) {
		this._createContextMenu(this._getItemContextOptions, "[data-context='menu']", {
			hookName: "LitmStoryTagsContextMenu",
			jQuery: false,
      		parentClassHooks: false,
      		fixed: true,
    	});
		super._onFirstRender(context, options);
	}

	_getItemContextOptions(target) {
		const canEdit = function(element, actor) {
			let result = true;
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

	async _onRender(force, options) {
		const resizeHandle = this.element.querySelector("div.window-resize-handle");
		if (resizeHandle) {
			if (resizeHandle.innerHTML == '') {
				resizeHandle.innerHTML = '<i inert class="fa-solid fa-left-right fa-rotate-by"></i>';
			}
		}

		await this.activateListeners(this.element);
		this.#dragDrop.forEach((d) => d.bind(this.element));
	}

	activateListeners(html) {
		if (html && html.jquery) {
			html = html[0];
		}

		html.querySelectorAll('input[type="text"]').forEach(input => {
			input.addEventListener("contextmenu", event => {
				this._onRemoveTag(event);
			});
		});

		html.querySelectorAll("[data-focus]").forEach(el => {
			el.addEventListener("focus", event => {
				event.currentTarget.select();
			});
		});

		window.addEventListener("resize", () => {
			if (this.rendered) this.setPosition({ left: window.innerWidth - 605 });
		});

		game.socket.on("system.litm", async (data) => {
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

		// GM only listeners
		if (!game.user.isGM) return;
	}

	#createDragDropHandlers() {
		return this.options.dragDrop.map((d) => {
			d.permissions = {
				drop: this._canDragDrop.bind(this)
			};
			d.callbacks = {
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

	/** @override */
	async _prepareContext(options)
	{
		const context = {
			actors: this.actors
				.sort((a, b) => a.name.localeCompare(b.name))
				.sort((_a, b) => (b.type === "challenge" ? 1 : -1)),
			tags: this.tags || [],
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
			return { actors: [], tags: [] };
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
							value: e.flags["foundryvtt-litm"].values.findLast((v) => !!v),
							type: e.flags["foundryvtt-litm"].values.some((v) => !!v) ? "status" : "tag",
						}))
						.sort((a, b) => a.name.localeCompare(b.name))
						.sort((a, b) =>
							a.type === b.type ? 0 : a.type === "status" ? -1 : 1,
						),
				})) || []
		);
	}

	get tags() {
		return this.config.tags
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
		if (!game.user.isGM) return;
		const name = event.target.name;
		const nameParts = name.split('.');
		if (nameParts.length == 3) {
			const actorId = nameParts[0];
			const id = nameParts[1];
			const type = nameParts[2];

			if (actorId == 'story') {
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
		}
	}

	static async #onAddTag(event, target) {
		const id = event.target.dataset.id;

		const tag = {
			name: t("Litm.ui.name-tag"),
			values: Array(6)
				.fill()
				.map(() => null),
			type: "tag",
			isBurnt: false,
			id: foundry.utils.randomID(),
		};

		if (id === "story") {
			if (game.user.isGM) return this.setTags([...this.tags, tag]);
			return this._broadcastUpdate("tags", [...this.tags, tag]);
		}

		return this._addTagToActor({ id, tag });
	}

	static async #onOpenSheet(event, target) {
		const actor = game.actors.get(event.target.dataset.id);
		actor.sheet.render(true);
	}

	static async #onRemoveAllTags(event, target) {
		event.preventDefault();
		event.stopPropagation();

		if (!this.config.tags.length || !(await confirmDelete())) return;
		if (game.user.isGM) return this.setTags([]);
		return this._broadcastUpdate("tags", []);
	}

	static async #onRemoveActor(event, target) {
		const id = event.target.dataset.id;
		event.preventDefault();
		event.stopPropagation();

		if (!game.user.isGM) return;
		if (!(await confirmDelete("Actor"))) return;

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
		}
	}

	async _onRemoveTag(event) {
		event.preventDefault();
		event.stopPropagation();
		event.target.blur();

		const id = event.target.dataset.id;
		const type = event.target.dataset.type;

		if (type === "story") {
			if (!(await confirmDelete("Litm.other.tag"))) return;

			if (game.user.isGM)
				return this.setTags(this.config.tags.filter((t) => t.id !== id));
			return this._broadcastUpdate(
				"tags",
				this.config.tags.filter((t) => t.id !== id),
			);
		} else {
			return this._removeTagFromActor({ actorId: type, id });
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
		return this._broadcastRender();
	}

	async _updateTagsOnActor({ id, tags }) {
		const actor = game.actors.get(id);
		return actor.updateEmbeddedDocuments("ActiveEffect", tags);
	}

	async _removeTagFromActor({ actorId, id }) {
		const actor = game.actors.get(actorId);

		if (!actor)
			return ui.notifications.error("Litm.ui.error-no-actor", {
				localize: true,
			});
		if (!actor.isOwner) return;

		if (!(await confirmDelete("Litm.other.tag"))) return;

		await actor.deleteEmbeddedDocuments("ActiveEffect", [id]);
		return this._broadcastRender();
	}

	/**  Start Socket Methods  */
	_broadcastUpdate(component, data) {
		dispatch({ app: "story-tags", type: "update", component, data });
	}

	_broadcastRender() {
		dispatch({ app: "story-tags", type: "render" });
		this.render();
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
				return;
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

	/**  End Socket Methods  */
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api
export default class StoryTheme extends HandlebarsApplicationMixin(ApplicationV2) {
	#dragDrop
    #_boundHeaderDragMove
    #_boundHeaderDragEnd

    storyThemesTransforms = [{rotation: 1,    x: 0},
                             {rotation: -1,   x: -10},
                             {rotation: 0.25, x: 10},
                             {rotation: 1.3,  x: -20},
                             {rotation: -1.2, x: -6},
                             {rotation: 0.13, x: 24},
                             {rotation: -1.5, x: -14},
                             {rotation: 0.4,  x: 8},
                             {rotation: 0,    x: 24}];
    static xOffset = 180;
    static yStep = 45;
    static yOffset = 50;
    static borderSize = 20;

    constructor(options) {
		super();
        this.themeId = options.id;
        this.index = options.index;
        this.left = options.left;
        this.top = options.top;
        this.parent = options.app;
        this.zIndex = options.zIndex;
        if (options.name != null) this.name = options.name;
        if (options.theme != null) this.theme = options.theme;
		this.#dragDrop = this.#createDragDropHandlers();

        const altIdx = this.index % this.storyThemesTransforms.length;
        this.rotation = this.storyThemesTransforms[altIdx].rotation;
        this.x = this.storyThemesTransforms[altIdx].x - StoryTheme.xOffset;
        this.y = this.index * StoryTheme.yStep + StoryTheme.yOffset;

        this.editing = false;
        this.editingTitle = false;

		this.isDragging = false;
  		this.startX = 0;
  		this.startY = 0;
		this.startDragPosition = {};
    }

	/** @inheritdoc */
	static DEFAULT_OPTIONS = {
    	tag: "form",
		classes: ["app", "litm", "litm--story-themes", "themed", "theme-light"],
		position: {
    		width: 250,
    		height: 175,
			top: 100,
			left: window.innerWidth - 770,
  		},
		window: {
			resizable: false,
    		title: "Litm.themes.story-theme",
			controls: [],
  		},
		form: {
			handler: this.#onSubmit,
    		closeOnSubmit: false,
		    submitOnChange: true,
  		},
		actions: {
            toggleEdit: this.#toggleEdit
		},
		dragDrop: [{dropSelector: "form"}],
  	}

    /** @inheritdoc */
    static PARTS = {
        form: { template: "systems/foundryvtt-litm/templates/apps/story-theme.html" }
    }

	async getTitle() {
	    return this.name ?? "aaa";
	}

	async _onFirstRender(context, options) {
        this._createContextMenu(this._getStoryThemeTagContextOptions, ".litm--story-theme-tags", {
			hookName: "LitmStoryThemeTagContextMenu",
			jQuery: false,
      		parentClassHooks: false,
      		fixed: true,
    	});

		this._createContextMenu(this._getStoryThemeContextOptions, ".litm--story-themes", {
			hookName: "LitmStoryThemeContextMenu",
			jQuery: false,
      		parentClassHooks: false,
      		fixed: true,
    	});
    }

    _getStoryThemeTagContextOptions(target) {
		const canEdit = function(element, actor) {
			let result = game.user.isGM;
			return result;
		};

        const options = [
            {
                name: game.i18n.localize("Litm.ui.delete-story-theme"),
                icon: "<i class='fas fa-user-slash'></i>",
				condition: (element) => canEdit(element),
                callback: async (element) => {
                    if (!game.user.isGM) return;
                    if (!(await utils.confirmDelete(this.name))) return;
                    await this.parent.removeStoryTheme(this.themeId);
                    this.close();
                },
            },
            {
                name: game.i18n.localize("Litm.ui.add-story-theme-tag"),
                icon: "<i class='fas fa-user-slash'></i>",
				condition: (element) => canEdit(element),
                callback: async (element) => {
                    this.#addTag(element);
                },
            },
            {
                name: game.i18n.localize("Litm.ui.delete-story-theme-tag"),
                icon: "<i class='fas fa-user-slash'></i>",
				condition: (element) => canEdit(element),
                callback: async (element, target, options) => {
                    this.#removeTag(element, target, options);
                },
            },
        ];

        return options;
    }


    _getStoryThemeContextOptions(target) {
		const canEdit = function(element, actor) {
			let result = game.user.isGM;
			return result;
		};

        const options = [
            {
                name: game.i18n.localize("Litm.ui.delete-story-theme"),
                icon: "<i class='fas fa-user-slash'></i>",
				condition: (element) => canEdit(element),
                callback: async (element) => {
                    if (!game.user.isGM) return;
                    if (!(await utils.confirmDelete(this.name))) return;
                    await this.parent.removeStoryTheme(this.themeId);
                    this.close();
                },
            },
            {
                name: game.i18n.localize("Litm.ui.add-story-theme-tag"),
                icon: "<i class='fas fa-user-slash'></i>",
				condition: (element) => canEdit(element),
                callback: async (element) => {
                    this.#addTag(element);
                },
            },
        ];

        return options;
    }

	async _onRender(force, options) {
        await super._onRender(force, options);

 		this.#dragDrop.forEach((d) => d.bind(this.element));

        const title = this.element?.querySelector(".window-title");
        if (title) title.textContent = this.name;

        await this.activateListeners(this.element);

        if (!this.__firstRender) {
            this.__firstRender = true;
            this.moveToParents({ left : this.left, top: this.top });
        }

        requestAnimationFrame(() => {
            this.fitHeightToContent({ padding: StoryTheme.borderSize });
        });

        const container = this.element.querySelector(".litm--story-themes-container");
        if (container) {
            container.style.transform = `rotate(${this.rotation}deg)`;
        }
    }

	async activateListeners(html) {
		html.querySelectorAll("span[contenteditable]")
			.forEach(span => {
				span.addEventListener("keydown", ev => {
					if (ev.key === "Enter") {
						ev.preventDefault();
						span.blur();
					}
				});

				// Optional: submit also when clicking away
				span.addEventListener("blur", (ev) => {this.setTags(ev)});
		});

		html.querySelectorAll(".litm--story-themes-title").forEach(title => {
            title.addEventListener("pointerdown", this.#headerDragStart.bind(this));
        });

		const editable = html.querySelector("[contenteditable]");
		if (editable) editable.focus();
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

    async _onDrop(dragEvent) {
    }

    /** @override */
	async _prepareContext(options)
	{
        const config = await game.settings.get("foundryvtt-litm", "storytags");
        this.theme = config.storyThemes.find(t => t.id == this.themeId);

        if (this.name == null)
            this.name = this.theme.name;

        if (!this.theme.tags) this.theme.tags = [];
        let tags = structuredClone(this.theme.tags);
        if (!(tags instanceof Object)) tags = [];
        tags = tags.filter(t => t instanceof Object);
        for (const tag of tags) {
            tag.renderedName = await foundry.applications.ux.TextEditor.implementation.enrichHTML(tag.name);
            tag.editing = this.editing == tag.id;
        }

        const context = {
            id: this.themeId,
            name: this.name,
            rotation: this.rotation,
            isBurnt: this.theme.isBurnt,
            x: this.x,
            y: this.y,
            tags: this.theme.tags,
            renderedTags: await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.theme.tags),
            renderedName: await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.name),
            editing: this.editing,
            editingTitle: this.editingTitle,
            tags,
        };

        return context;
    }

	static async #onSubmit(event, target) {

    }

    async moveToParents(position) {
        const left = position.left + this.x;
        const top = position.top + this.y;

        await this.setPosition({left, top});
    }

    async sendBehind() {
        this.element.style.zIndex = this.zIndex;
    }

    static async #toggleEdit(event) {
        const id = event.target.dataset.id;

        if (event.altKey) {
            // Adds / Removes Burnt Status.
            const config = await game.settings.get("foundryvtt-litm", "storytags");
            this.theme = config.storyThemes.find(t => t.id == this.themeId);
            const tag = this.theme?.tags?.find(t => t.id == id);
            if (tag) {
                tag.isBurnt = !tag.isBurnt;
                await game.settings.set("foundryvtt-litm", "storytags", config);
                this.parent._broadcastRender();
                this.parent.renderRollDialogs();
                this.render(true);
            }

            return;
        }

        this.editing = id;
        this.render(true);
    }

	async setTags(event) {
        const id = event.target.dataset.id;
        const path = event.target.dataset.path;
		const innerHTML = event.target.innerHTML;

        const config = await game.settings.get("foundryvtt-litm", "storytags");
        this.theme = config.storyThemes.find(t => t.id == this.themeId);
        if (path == "tags") {
            const tag = this.theme.tags.find(t => t.id == id);
            if (!tag) return;
            tag.name = innerHTML;
            this.editing = false;
        } else if (path == "name") {
            this.theme.name = innerHTML;
            this.name = innerHTML;
            this.editingTitle = false;
        }

        game.settings.set("foundryvtt-litm", "storytags", config);
       
        this.parent.renderRollDialogs();
        this.render();
	}

    async #headerDragStart(event) {
        if (!event) return;
        if (event.button !== 0) return;      // left button only

        event.preventDefault();
        event.stopPropagation();

        const el = event.currentTarget;      // the title div we clicked

        this.startX = event.clientX;
        this.startY = event.clientY;
        this.isDragging = false;

        // IMPORTANT: don't trust this.position during drags; use DOM rect or cached
        // If you move via setPosition, this.position is usually fine, but cache it once.
        this.startDragPosition = {
            left: this.position.left ?? 0,
            top:  this.position.top  ?? 0
        };

        // Capture pointer so we keep getting moves even outside the app
        // pointerId can be 0; that's valid — only null/undefined is invalid
        if (event.pointerId != null && typeof el.setPointerCapture === "function") {
            el.setPointerCapture(event.pointerId);
        }

        // Bind move/up only for the active drag
        this.#_boundHeaderDragMove ??= this.#headerDrag.bind(this);
        this.#_boundHeaderDragEnd  ??= this.#headerDragEnd.bind(this);

        el.addEventListener("pointermove", this.#_boundHeaderDragMove);
        el.addEventListener("pointerup", this.#_boundHeaderDragEnd);
        el.addEventListener("pointercancel", this.#_boundHeaderDragEnd);

        // Optional: prevent touch scrolling/gesture interference
        el.style.touchAction = "none";
    }

	async #headerDrag(event) {
		if (this.startX === 0 && this.startY === 0) return;

        const dx = event.clientX - this.startX;
        const dy = event.clientY - this.startY;

        // threshold to avoid accidental drags
        if (!this.isDragging && Math.hypot(dx, dy) < 3) return;

        this.isDragging = true;

        this.setPosition({
            left: this.startDragPosition.left + dx,
            top:  this.startDragPosition.top + dy
        });
    }

    async #headerDragEnd(event) {
        if (!event) return;
        const el = event.currentTarget;

        // Clean up listeners
        el.removeEventListener("pointermove", this.#_boundHeaderDragMove);
        el.removeEventListener("pointerup", this.#_boundHeaderDragEnd);
        el.removeEventListener("pointercancel", this.#_boundHeaderDragEnd);

        // Release capture (safe even if not captured)
        if (event.pointerId != null && typeof el.releasePointerCapture === "function") {
            try { el.releasePointerCapture(event.pointerId); } catch (_) {}
        }

        if (event.altKey) {
            // Adds / Removes Burnt Status.
            const config = await game.settings.get("foundryvtt-litm", "storytags");
            this.theme = config.storyThemes.find(t => t.id == this.themeId);
            this.theme.isBurnt = !this.theme.isBurnt;
            await game.settings.set("foundryvtt-litm", "storytags", config);
            this.parent._broadcastRender();
            this.parent.renderRollDialogs();
            this.render(true);
            return;
        }

        const wasDragging = this.isDragging;

        this.startX = 0;
        this.startY = 0;
        this.startDragPosition = { left: 0, top: 0 };
        this.isDragging = false;

        // If it was a drag, stop here (don't trigger click behavior)
        if (wasDragging) return;

        // Click behavior
        if (event.button !== 0) return;
        this.editingTitle = true;
        this.render(true);
    }

    async #addTag(element) {
        const config = await game.settings.get("foundryvtt-litm", "storytags");
        this.theme = config.storyThemes.find(t => t.id == this.themeId);

        if (!this.theme) return;
        if (!this.theme.tags || !Array.isArray(this.theme.tags)) this.theme.tags = [];

        const tag = {
			name: utils.localize("Litm.ui.name-tag"),
			type: "tag",
			isBurnt: false,
			id: foundry.utils.randomID(),
        };

        this.theme.tags.push(tag);

        await game.settings.set("foundryvtt-litm", "storytags", config);
        this.parent._broadcastRender();
        this.parent.renderRollDialogs();
        this.render(true);
    }

    async #removeTag(element) {
        const id = element.dataset.id;
        if (id == null) return;
        const config = await game.settings.get("foundryvtt-litm", "storytags");
        this.theme = config.storyThemes.find(t => t.id == this.themeId);

        if (!this.theme) return;
        if (!this.theme.tags) this.theme.tags = [];

        const tagIndex = this.theme.tags.findIndex(t => t.id == id);
        if (tagIndex == -1) return;
		this.theme.tags.splice(tagIndex, 1);

        await game.settings.set("foundryvtt-litm", "storytags", config);
        this.parent._broadcastRender();
        this.parent.renderRollDialogs();
        this.render(true);
    }

    async fitHeightToContent({ padding = 0 } = {}) {
        const el = this.element;
        if (!el) return;

        const header = el.querySelector(".window-header");
        const content = el.querySelector(".window-content");
        if (!content) return;

        // scrollHeight gives "natural" content height even if content is smaller/larger than current box
        const headerH = header?.getBoundingClientRect().height ?? 0;
        const contentH = content.scrollHeight;

        let newHeight = Math.ceil(headerH + contentH + padding);
 
        // Keep current left/top/width; only update height
        const { left, top, width } = this.position ?? {};
        this.setPosition({ left, top, width, height: newHeight });
    }
}
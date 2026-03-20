import V2 from "../v2sheets.js";
import { CharacterSheet } from "../actor/character/character-sheet.js";
import { StoryTagApp } from "./story-tags.js";

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ItemSheetV2 } = foundry.applications.sheets
export class StoryTheme extends HandlebarsApplicationMixin(ItemSheetV2) {
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
    static characterParentLeftOffset = 760;
    static characterParentTopOffset = 200;

    constructor(options) {
		super(options);
        this.themeId = this.document.id;
        this.index = options?.index;
        this.left = options?.left;
        this.top = options?.top;
        this.parent = options?.app;
        this.zIndex = options?.zIndex;
        if (this.document.system.name == null) {
            if (options.name)
                this.document.system.name = options.name;
            else
                this.document.system.name = game.i18n.localize("Litm.themes.story-theme");
        }
        if (!this.document.system.tags) this.document.system.tags = [];
        if (!this.document.system.limits) this.document.system.limits = [];
		this.#dragDrop = this.#createDragDropHandlers();

        const altIdx = (this.index ?? 0) % this.storyThemesTransforms.length;
        this.rotation = this.storyThemesTransforms[altIdx].rotation;
        this.x = this.storyThemesTransforms[altIdx].x - StoryTheme.xOffset;
        this.y = (this.index ?? 0) * StoryTheme.yStep + StoryTheme.yOffset;

        this.editing = false;
        this.editingTitle = false;
        this.titleSelected = false;

		this.isDragging = false;
  		this.startX = 0;
  		this.startY = 0;
		this.startDragPosition = {};
        this.locked = false;
        if (this.parent && this.parent instanceof CharacterSheet)
            this.locked = true;
    }

	/** @inheritdoc */
	static DEFAULT_OPTIONS = {
    	tag: "form",
		classes: ["app", "window-app", "litm", "litm--story-themes", "themed", "theme-light"],
		position: {
    		width: 250,
    		height: 175,
			top: 100,
			left: window.innerWidth - 770,
  		},
		window: {
			resizable: true,
    		title: "Litm.themes.story-theme",
			controls: [],
  		},
		form: {
			handler: this.#onSubmit,
    		closeOnSubmit: false,
		    submitOnChange: true,
  		},
		actions: {
            toggleEdit: this.#toggleEdit,
            lockToggle: this.#lockToggle,
            selectTag: this.#selectTag,
            selectLimitLevel: this.#selectLimitLevel,
		},
		dragDrop: [{dropSelector: "form"}],
  	}

    /** @inheritdoc */
    static PARTS = {
        form: { template: "systems/foundryvtt-litm/templates/apps/story-theme.html" }
    }

	async getTitle() {
	    return this.document.system.name ?? "aaa";
	}

	async _onFirstRender(context, options) {
        this._createContextMenu(this._getStoryThemeTagContextOptions, ".litm--story-theme-tags", {
            container: this.element,
			hookName: "LitmStoryThemeTagContextMenu",
			jQuery: false,
      		parentClassHooks: false,
      		fixed: true,
    	});

        this._createContextMenu(this._getStoryThemeImageContextOptions, ".litm--story-themes-image", {
            container: this.element,
			hookName: "LitmStoryThemeImageContextMenu",
			jQuery: false,
      		parentClassHooks: false,
      		fixed: true,
    	});

		this._createContextMenu(this._getStoryThemeContextOptions, ".litm--story-themes", {
            container: this.element,
			hookName: "LitmStoryThemeContextMenu",
			jQuery: false,
      		parentClassHooks: false,
      		fixed: true,
    	});

        const savedPosition = this.position;
        if (savedPosition != null && this.parent == null) {
            this.setPosition({
                left: savedPosition.left,
                top: savedPosition.top,
                width: savedPosition.width,
                height: savedPosition.height
            });
        }
        else if (savedPosition != null && this.parent instanceof StoryTagApp) {
            this.setPosition({
                width: savedPosition.width,
                height: savedPosition.height
            });
        }
    }

    _getStoryThemeTagContextOptions(target) {
        const isImageSet = function(img) {
            return img != 'icons/svg/item-bag.svg';
        }

		const canEdit = function(element, actor) {
			let result = game.user.isGM || this.document?.isOwner;
			return result;
		};

        const options = [
            {
                name: game.i18n.localize("Litm.ui.change-story-theme-image"),
                icon: "<i class='fas fa-address-book'></i>",
				condition: (element) => canEdit(element) && !isImageSet(this.document.img),
                callback: async (element) => {
                    this.changeImage();
                },
            },
            {
                name: game.i18n.localize("Litm.ui.delete-story-theme"),
                icon: "<i class='fas fa-user-slash'></i>",
				condition: (element) => canEdit(element),
                callback: async (element) => {
                    if (!(await utils.confirmDelete(this.document.system.name))) return;
                    await this.parent?.removeStoryTheme(this.themeId);
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
            {
                name: game.i18n.localize("Litm.ui.add-limit"),
                icon: "<i class='fas fa-shield-alt'></i>",
				condition: (element) => canEdit(element),
                callback: async (element, target, options) => {
                    this.#addLimit(element, target, options);
                },
            },
        ];

        return options;
    }

    _getStoryThemeImageContextOptions(target) {
		const canEdit = function(element, actor) {
			let result = game.user.isGM || this.document?.isOwner;
			return result;
		};

        const options = [
            {
                name: game.i18n.localize("Litm.ui.change-story-theme-image"),
                icon: "<i class='fas fa-address-book'></i>",
				condition: (element) => canEdit(element),
                callback: async (element) => {
                    this.changeImage();
                },
            },
            {
                name: game.i18n.localize("Litm.ui.delete-story-theme-image"),
                icon: "<i class='fas fa-user-slash'></i>",
				condition: (element) => canEdit(element),
                callback: async (element) => {
                    this.document.img = 'icons/svg/item-bag.svg';
                    await this.document.update({"img": 'icons/svg/item-bag.svg'});
                    this.render(true);
                },
            },
        ];

        return options;
    }


    _getStoryThemeContextOptions(target) {
        const isImageSet = (img) => {
            return img != 'icons/svg/item-bag.svg';
        }

        const isLimit = (target) => {
            let limitDiv;
            if (target.classList.contains("litm--story-themes-limit"))
                limitDiv = target;
            else {
                limitDiv = target.closest(".litm--story-themes-limit");
            }
            return limitDiv != null;
        }

        const isImage = (target) => {
            return false;
        }

		const canEdit = () => {
			let result = game.user.isGM || this.document?.isOwner;
			return result;
		};

        const options = [
            {
                name: game.i18n.localize("Litm.ui.change-story-theme-image"),
                icon: "<i class='fas fa-address-book'></i>",
				condition: (element, args) => canEdit(element, args) && !isImageSet(this.document.img) && !isImage(this._lastContextTarget),
                callback: async (element, args) => {
                    this.changeImage();
                },
            },
            {
                name: game.i18n.localize("Litm.ui.delete-story-theme"),
                icon: "<i class='fas fa-user-slash'></i>",
				condition: (element, args) => canEdit(element, args) && !isImage(this._lastContextTarget),
                callback: async (element, args) => {
                    if (!(await utils.confirmDelete(this.document.system.name))) return;
                    await this.parent?.removeStoryTheme(this.themeId);
                    this.close();
                },
            },
            {
                name: game.i18n.localize("Litm.ui.add-story-theme-tag"),
                icon: "<i class='fas fa-user-slash'></i>",
				condition: (element, args) => canEdit(element, args) && !isImage(this._lastContextTarget),
                callback: async (element, args) => {
                    this.#addTag(element);
                },
            },
            {
                name: game.i18n.localize("Litm.ui.add-limit"),
                icon: "<i class='fas fa-shield-alt'></i>",
				condition: (element) => canEdit(element) && !isLimit(this._lastContextTarget),
                callback: async (element, target, options) => {
                    this.#addLimit(element, target, options);
                },
            },
            {
                name: game.i18n.localize("Litm.ui.remove-limit"),
                icon: "<i class='fas fa-shield-alt'></i>",
				condition: (element) => canEdit(element) && isLimit(this._lastContextTarget),
                callback: async (element, target, options) => {
                    this.#removeLimit(this._lastContextTarget);
                },
            },
        ];

        return options;
    }

	async _onRender(force, options) {
        await super._onRender(force, options);
        await V2.updateHeader(this);

 		this.#dragDrop.forEach((d) => d.bind(this.element));

        const title = this.element?.querySelector(".window-title");
        if (title) title.textContent = this.document.system.name;

        await this.activateListeners(this.element);

        let renderPadding = 0;
        if (!this.__firstRender && this.parent != null) {
            this.__firstRender = true;
            renderPadding = StoryTheme.borderSize;
            const left = ( this.left == null ? this.options.position.left : this.left );
            const top = ( this.top == null ? this.options.position.top : this.top );
            this.moveToParents({ left, top });
        }

        requestAnimationFrame(async () => {
            await this.fitWidthToTitle();
            await this.fitHeightToContent({ padding: renderPadding });
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

		html.querySelectorAll(".window-header").forEach(title => {
            title.addEventListener("pointerup", this.#topHeaderDragEnd.bind(this));
        });

		const editable = html.querySelector("[contenteditable]");
		if (editable) editable.focus();

		html.querySelectorAll(".window-resize-handle").forEach(title => {
            title.addEventListener("pointerup", this.#resizePointerUp.bind(this));
        });

        this._onRightDown ??= (event) => {
            if (event.button !== 2) return; // right mouse button
            this._lastContextTarget = event.target;
        };

        this.element.addEventListener("pointerdown", this._onRightDown, {
            capture: true
        });
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

    _canRender(options) {
        if (!this.parent && game.litm.storyTags && game.litm.storyTags.rendered) {
            const renderedSheet = game.litm.storyTags.storyThemeSheets.find(sts => sts.id == this.document.id);
            if (renderedSheet) {
                return false;
            }
        }
        return super._canRender(options);
    }

    /** @override */
	async _prepareContext(options)
	{
        if (!this.document.system.tags) this.document.system.tags = [];
        let tags = structuredClone(this.document.system.tags);
        let limits = structuredClone(this.document.system.limits);
        if (!(tags instanceof Object)) tags = [];
        tags = tags.filter(t => t instanceof Object);
        for (const tag of tags) {
            tag.renderedName = await foundry.applications.ux.TextEditor.implementation.enrichHTML(tag.name);
            tag.editing = this.editing == tag.id;
        }
        const image = this.document.img == 'icons/svg/item-bag.svg' ? null : this.document.img;
        const canLock = this.parent && this.parent instanceof CharacterSheet;
        const hasLimits = limits.length > 0;

        //logger.info(`Rendering ${this.document.system.name}`);
        const context = {
            id: this.themeId,
            image,
            name: this.document.system.name,
            rotation: this.rotation,
            isBurnt: this.document.system.isBurnt,
            canLock,
            hasLimits,
            x: this.x,
            y: this.y,
            tags: this.document.system.tags,
            renderedTags: await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.document.system.tags),
            renderedName: await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.document.system.name),
            editing: this.editing,
            editingTitle: this.editingTitle,
            locked: this.locked,
            titleSelected: this.titleSelected,
            tags,
            limits
        };

        return context;
    }

	static async #onSubmit(event, target) {
        switch (event.target.dataset.path) {
            case 'limits':
                const index = parseInt(event.target.dataset.key);
                const value = event.target.value;
                const limits = structuredClone(this.document.system.limits);
                if (event.target.dataset.targetValue == 'name') {
                    limits[index].name = value;
                } if (event.target.dataset.targetValue == 'value') {
                    limits[index].value = value;
                    if (limits[index].levels == null) limits[index].levels = [];
        			utils.ensureLength(limits[index].levels, limits[index].value);
                }
        		await this.document.update({ "system.limits": limits });
                this.render();
                break;
        }
    }

    async moveToParents(position) {
        if (!this.rendered) return;

        if (this.parent && this.parent instanceof CharacterSheet) {
            const scale = (this.parent.position.scale ?? this.position.scale) ?? 1;
            const left = this.parent.position.left + (StoryTheme.characterParentLeftOffset  - (this.position.width / 2) + this.x) * scale;
            const top = this.parent.position.top + (this.y + StoryTheme.characterParentTopOffset) * scale;
            await this.setPosition({left, top});
        } else {
            const left = position.left + this.x;
            const top = position.top + this.y;
            await this.setPosition({left, top});
        }
    }

    async sendBehind() {
        if (this.rendered)
            this.element.style.zIndex = this.zIndex;
    }

    static async #toggleEdit(event) {
        let div = event.target;
        if (event.target instanceof Element && event.target.matches("mark")) {
            div = event.target.closest("div");
        }
        const id = div.dataset.id;

        if (event.altKey) {
            // Adds / Removes Burnt Status.
            const tag = this.document.system.tags?.find(t => t.id == id);
            if (tag) {
                tag.isBurnt = !tag.isBurnt;
                this.parent?._broadcastRender();
                this.parent?.renderRollDialogs();
                this.render(true);
            }

            return;
        }

        this.editing = id;
        this.render(true);
    }

    static async #selectTag(event) {
        let div = event.target;
        if (event.target instanceof Element && event.target.matches("mark")) {
            div = event.target.closest("div");
        }
        const id = div.dataset.id;
        const tag = this.document.system.tags?.find(t => t.id == id);
        if (!tag) return;
        let toBurn = false;

        if (event.altKey) {
            // Adds / Removes Burnt Status.
            tag.isBurnt = !tag.isBurnt;
            this.parent?._broadcastRender();
            this.parent?.renderRollDialogs();
        } else {
            tag.selected = !tag.selected;
            const rollTag = structuredClone(tag);
            rollTag.type = rollTag.name.includes("[--") ? "weaknessTag" : "powerTag";
            rollTag.isActive = true;

            if (tag.selected) {
                await this.parent?._roll?.addTag(rollTag, toBurn);
            } else {
                await this.parent?._roll?.removeTag(rollTag);
            }
    		if (this.parent?._roll?.rendered) this.parent?._roll?.render();
        }

        this.render(true);
    }

    static async #selectLimitLevel(event) {
        const level = parseInt(event.target.dataset.level);
        const checkboxes = event.target.closest(".limit-checkboxes");
        const limitIndex = parseInt(checkboxes.dataset.limitId);
        const checked = event.target.checked;
        const limits = structuredClone(this.document.system.limits);
        limits[limitIndex].levels[level] = checked;

        await this.document.update({ "system.limits": limits });
    }

    static async #lockToggle (event) {
        this.locked = !this.locked;
        if (this.locked) {
            this.editingTitle = false;
            this.editing = false;
        }
        this.render(true);
    }

	async setTags(event) {
        const id = event.target.dataset.id;
        const path = event.target.dataset.path;
		const innerHTML = event.target.innerHTML;

        if (path == "tags") {
            const tag = this.document.system.tags.find(t => t.id == id);
            if (!tag) return;
            tag.name = innerHTML;
            tag.selected = false;
            await this.document.update({"system.tags": this.document.system.tags});
            this.editing = false;
        } else if (path == "name") {
            await this.document.update({
                "system.name": innerHTML,
                "name": innerHTML,
            });
            this.editingTitle = false;
        }

        this.parent?.renderRollDialogs();
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
            left: ( this.startDragPosition.left ?? 0 ) + dx,
            top:  ( this.startDragPosition.top ?? 0 ) + dy
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
            this.document.system.isBurnt = !this.document.system.isBurnt;
            await this.document.update({"system.isBurnt" : this.document.system.isBurnt});
            this.parent?._broadcastRender();
            this.parent?.renderRollDialogs();
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

        const left = parseInt(this.element.style.left.replace("px", ""));
        const top = parseInt(this.element.style.top.replace("px", ""));
        const width = parseInt(this.element.style.width.replace("px", ""));
        const height = parseInt(this.element.style.height.replace("px", ""));

        this.position = {left, top, width, height};

        // Click behavior
        if (event.button !== 0) return;
        if (!this.locked)
            this.editingTitle = true;
        else {
            this.titleSelected = !this.titleSelected;
            let toBurn = false;
            const tag = {
                name: this.document.system.name,
                id: this.themeId,
                isBurnt: this.document.system.isBurnt,
                isActive: true,
                type: this.document.system.name.includes("[--") ? "weaknessTag" : "powerTag",
            };

            if (this.titleSelected) {
                await this.parent?._roll?.addTag(tag, toBurn);
            } else {
                await this.parent?._roll?.removeTag(tag);
            }
    		if (this.parent?._roll?.rendered) this.parent?._roll?.render();
        }
        this.render(true);
    }

    async #topHeaderDragEnd(event) {
        const left = parseInt(this.element.style.left.replace("px", ""));
        const top = parseInt(this.element.style.top.replace("px", ""));
        const width = parseInt(this.element.style.width.replace("px", ""));
        const height = parseInt(this.element.style.height.replace("px", ""));

        this.position = {left, top, width, height};
    }

    async #resizePointerUp(event) {
        const left = parseInt(this.element.style.left.replace("px", ""));
        const top = parseInt(this.element.style.top.replace("px", ""));
        const width = parseInt(this.element.style.width.replace("px", ""));
        const height = parseInt(this.element.style.height.replace("px", ""));

        this.position = {left, top, width, height};
        this.fitHeightToContent();
    }

    async #addTag(element) {
        if (!this.document.system.tags || !Array.isArray(this.document.system.tags)) this.document.system.tags = [];

        const tag = {
			name: utils.localize("Litm.ui.name-tag"),
			type: "tag",
			isBurnt: false,
			id: foundry.utils.randomID(),
        };

        this.document.system.tags.push(tag);
        await this.document.update({"system.tags" : this.document.system.tags});

        this.fitHeightToContent();
        this.parent?._broadcastRender();
        this.parent?.renderRollDialogs();
        this.render(true);
    }

    async #addLimit(element, target, options) {
		const limits = structuredClone(this.document.system.limits);
		const limit = {
			name: "New Limit",
			value: 0,
            levels: []
		};

		limits.push(limit);
		await this.document.update({ "system.limits": limits });
        this.render(true);
    }

    async #removeLimit(target) {
        let limit;
        if (target.classList.contains("litm--story-themes-limit"))
            limit = target;
        else {
            limit = target.closest(".litm--story-themes-limit");
        }
        if (limit == null) return;
        const index = parseInt(limit.dataset.id);
		const limits = structuredClone(this.document.system.limits);
        limits.splice(index, 1);
		await this.document.update({ "system.limits": limits });

        this.render(true);
    }

    async #removeTag(element) {
        const id = element.dataset.id;
        if (id == null) return;

        if (!this.document.system.tags) this.document.system.tags = [];

        const tagIndex = this.document.system.tags.findIndex(t => t.id == id);
        if (tagIndex == -1) return;
		this.document.system.tags.splice(tagIndex, 1);
        await this.document.update({"system.tags" : this.document.system.tags});

        this.fitHeightToContent();
        this.parent?._broadcastRender();
        this.parent?.renderRollDialogs();
        this.render(true);
    }

    async fitWidthToTitle() {

    }

    async fitHeightToContent({ padding = 0 } = {}) {
        const topBorder = 70;
        let contentHeights = 0;

    	const title = this.element.querySelector(".litm--story-themes-title");
        if (title)
            contentHeights += title.clientHeight;

        const separators = this.element.querySelectorAll("litm--story-themes-separator");
        for (const separator of separators) {
            contentHeights += separator.clientHeight;
        }

    	const elements = this.element.querySelectorAll(".litm--story-theme-tags");
        for (const el of elements ?? []) {
            contentHeights += el.clientHeight;
        }

    	const limitsContent = this.element.querySelector(".litm--story-themes-limits");
        if (limitsContent) {
            contentHeights += limitsContent.clientHeight;
        }

    	const innerContent = this.element.querySelector(".litm--story-themes-inner-content");
        if (innerContent) {
            if (innerContent.clientHeight > contentHeights)
                contentHeights = innerContent.clientHeight;
        }

        let newHeight = contentHeights + topBorder;

        if (newHeight < this.options.position.height)
            newHeight = this.options.position.height;

        const { left, top, width, height } = this.position ?? {};
        if (height < newHeight)
            this.setPosition({ left, top, width, height: newHeight });

        this.element.style.minHeight = newHeight + 'px';
    }

    async changeImage() {
        new foundry.applications.apps.FilePicker({
            type: "image",
            current: this.document.img,
            callback: async (path) => {
                await this.document.update({"img": path});
                this.render(true);
            }
        }).render(true);
    }
}
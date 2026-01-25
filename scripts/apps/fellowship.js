import V2 from "../v2sheets.js";
import ExternalTextEditor from "./text-editor.js";
import SpecialImprovements from "./special-improvements.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api
export default class Fellowship extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(object) {
		super(object);
		this.activeEditor = false;
        this.actor = object.actor;

        this.fellowship = game.settings.get("foundryvtt-litm", "fellowship");
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
		return this.fellowship.system;
	}

	/** @inheritdoc */
	static PARTS = {
		form: { template: "systems/foundryvtt-litm/templates/item/theme.html" }
	}

	/** @override */
	async _prepareContext(options)
	{
		let { data, ...rest } = super._prepareContext();
        this.fellowship = game.settings.get("foundryvtt-litm", "fellowship");

		if (data == null) {
			data = { system: {} };
		}

		data._id = this.fellowship.id;
		data.system.weakness = this.fellowship.system.weakness;
		data.system.levels = this.fellowship.system.levels;
		data.system.themebooks = this.fellowship.system.themebooks;
		data.system.powerTags = this.fellowship.system.powerTags;
		data.system.motivation = this.fellowship.system.motivation;
		data.system.note = this.fellowship.system.note;
		data.system.themebook = this.fellowship.system.themebook;
		data.system.level = this.fellowship.system.level;
		data.system.experience = this.fellowship.system.experience;
		data.system.decay = this.fellowship.system.decay;
		data.system.milestone = this.fellowship.system.milestone;
		data.system.isActive = this.fellowship.system.isActive;
		data.system.isBurnt = this.fellowship.system.isBurnt;
		data.system.flipped = this.fellowship.system.flipped;
		data.name = this.fellowship.name;

        for (const powerTag of data.system.powerTags) {
            powerTag.isSingleUse = true;
        }

        if (!this.fellowship.system.specialImprovements) this.fellowship.system.specialImprovements = Array(5)
							.fill()
							.map((_, i) => ({
								id: foundry.utils.randomID(),
								name: "",
								description: "",
								improvementId: "",
								type: "specialImprovement",
							}));

		const filledSpecialImprovements = structuredClone(this.fellowship.system.specialImprovements.filter(i => i.improvementId != null && i.improvementId != ""));
		for (const specialImprovements of filledSpecialImprovements) {
			specialImprovements.renderedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(specialImprovements.description);
		}

		data.system.specialImprovements = [...filledSpecialImprovements, ...this.fellowship.system.specialImprovements.filter(i => i.improvementId == null || i.improvementId == "")];

		const themesrc = `systems/foundryvtt-litm/assets/media/fellowship`;

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
    }

    async _onFirstRender(context, options) {
        super._onFirstRender(context, options);
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
    }

    async _setText(event) {
        const input = event.target.dataset.input;
        const value = event.target.innerHTML;
        const id = event.target.dataset.id;
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
                    await this.update("system.specialImprovements", themeImprovements);
                    break;
                case "improvement-description":
                    themeImprovement.description = value;
                    this.edittingSpecialImprovement = null;
                    this.edittingSpecialImprovementDescription = false;
                    await this.update("system.specialImprovements", themeImprovements);
                    break;
            }
        }
        else
            this.update(input, value);
    }

    async _closeEditor(event) {
        this.activeEditor = false;
        this.render();
    }

    static async #onSubmit(event, form, formData) {
        switch(event.target?.name) {
            case 'system.level':
            case 'system.themebook':
                this.update(event.target.name, event.target.value);
                return;
        }
        if (event.target?.name.startsWith('system.powerTags')) {
            const nameParts = event.target.name.split('.');
            if (nameParts?.length >= 3) {
                const index = parseInt(nameParts[2]);
                const target = nameParts?.length >= 4 ? nameParts[3] : "";
                if (target == "name") {
                    const tags = structuredClone(this.fellowship.system.powerTags);
                    tags[index].name = event.target.value;
                    if (tags[index].name != "")
                        tags[index].isActive = true;

                    this.update("system.powerTags", tags);
                }
            }
        }
        else if (event.target?.name.startsWith('system.weaknessTags')) {
            const nameParts = event.target.name.split('.');
            if (nameParts?.length >= 3) {
                const index = parseInt(nameParts[2]);
                const tags = structuredClone(this.fellowship.system.weakness);
                tags[index].name = event.target.value;
                this.update("system.weakness", tags);
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
        if (!(await confirmDelete("Litm.other.tag"))) return;
        throw new Error("Not implemented");
    }

    static async #increase(event, target) {
        const id = event.target.dataset.id;
        await this._increase(id);
    }

    static async #activateEditor(event, target) {
        event.preventDefault();
        event.stopPropagation();
        const editorTarget = event.target.dataset.target;
        const value = foundry.utils.getProperty(this.fellowship, editorTarget);

        const editor = new ExternalTextEditor({target: editorTarget, value, callback: this.saveNotes});
        editor.render(true);
    }

    async saveNotes({value, target}) {
        Fellowship.update(target, value);
    }

    static async #activateTag(event, target) {
        const path = event.target.dataset.path;
        const checked = event.target.checked;
        let key;
        if (event.target.dataset.key)
            key = parseInt(event.target.dataset.key);

        const tags = structuredClone(foundry.utils.getProperty(this.fellowship, path));
        if (key != null) {
            if (tags[key].name && tags[key].name != "")
                tags[key].isActive = checked;

            this.update(path, tags);
        }
        else
        {
            const name = event.target.name;
            if (name)
                this.update(name, checked);
        }
    }

    static async #burnTag(event, target) {
        const path = event.target.dataset.path;
        const checked = event.target.checked;
        let key;
        if (event.target.dataset.key)
            key = parseInt(event.target.dataset.key);

        const tags = structuredClone(foundry.utils.getProperty(this.fellowship, path));

        if (key != null) {
            if (tags[key].name && tags[key].name != "")
                tags[key].isBurnt = checked;

            this.update(path, tags);
        }
        else
        {
            const name = event.target.name;
            if (name)
                this.update(name, checked);
        }
        this.render();

        this.actor.sheet.render();
    }

    static async #showAdvancementHint(event) {
        const type = event.target.dataset.type;
        showAdvancementHint(type);
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

        this.edittingSpecialImprovementName = false;
        this.edittingSpecialImprovementDescription = false;
        this.edittingSpecialImprovement = null;

        const selector = new SpecialImprovements({theme: this.fellowship});
        selector.render(true);
    }

    async _increase(id) {
        let value = Math.min(Math.max(foundry.utils.getProperty(this.fellowship, id) + 1, 0), 3);
        await this.update(id, value);
    }

    async _decrease(id) {
        let value = Math.min(Math.max(foundry.utils.getProperty(this.fellowship, id) - 1, 0), 3);
        await this.update(id, value);
    }

    async _removeImprovement(target) {
        const id = target.dataset.id;
        const index = target.dataset.index;

        const theme = this.options.document;
        const themeImprovements = structuredClone(theme.system.specialImprovements);
        const themeImprovement = themeImprovements.find(i => i.id == id);
        if (!themeImprovement) return;
        if (!themeImprovement.name || themeImprovement.name == "") return;

        if (!(await confirmDelete(themeImprovement.name))) return;

        themeImprovement.improvementId = null;
        themeImprovement.name = null;
        themeImprovement.description = null;

        await this.update("system.specialImprovements", themeImprovements);
    }

    static async burnTag(tag) {
		const fellowship = game.settings.get("foundryvtt-litm", "fellowship");
        if (tag.id == 'fellowship') {
			fellowship.system.isBurnt = !fellowship.system.isBurnt;
            this.update("system.isBurnt", fellowship.system.isBurnt);
        } else {
            let myTag = fellowship.system.powerTags.find(t => t.id == tag.id);
            if (myTag) {
				myTag.isBurnt = !myTag.isBurnt;
                this.update("system.powerTags", fellowship.system.powerTags);
                return;
            }
            myTag = fellowship.system.weakness.find(t => t.id == tag.id);
            if (myTag) {
				myTag.isBurnt = !myTag.isBurnt;
                this.update("system.weakness", fellowship.system.weakness);
            }
        }
    }

    static async activateTag(tag) {
		const fellowship = game.settings.get("foundryvtt-litm", "fellowship");
        if (tag.id == 'fellowship') {
			fellowship.system.isActive = !fellowship.system.isActive;
            this.update("system.isActive", fellowship.system.isActive);
        } else {
            let myTag = fellowship.system.powerTags.find(t => t.id == tag.id);
            if (myTag) {
				myTag.isActive = !myTag.isActive;
                this.update("system.powerTags", fellowship.system.powerTags);
                return;
            }
            myTag = fellowship.system.weakness.find(t => t.id == tag.id);
            if (myTag) {
				myTag.isActive = !myTag.isActive;
                this.update("system.weakness", fellowship.system.weakness);
            }
        }
    }

	async update(attrib, value) {
		if (game.user.isGM) {
			foundry.utils.setProperty(this.fellowship, attrib, value);
			await game.settings.set("foundryvtt-litm", "fellowship", this.fellowship);
			Fellowship.renderFellowship();
			Fellowship.broadcastFellowshipUpdate();
		} else {
			Fellowship.requestFellowshipUpdate(attrib, value);
		}
	}

	static async update(attrib, value) {
		if (game.user.isGM) {
			const fellowship = game.settings.get("foundryvtt-litm", "fellowship");
			foundry.utils.setProperty(fellowship, attrib, value);
			await game.settings.set("foundryvtt-litm", "fellowship", fellowship);
			this.renderFellowship();
			this.broadcastFellowshipUpdate();
		} else {
			this.requestFellowshipUpdate(attrib, value);
		}
	}

	static broadcastFellowshipUpdate() {
		const isGM = game.user.isGM;
		const user = game.user.id;
		return game.socket.emit("system.foundryvtt-litm", { app: "character-sheet", type: "renderFellowship", event: "renderFellowship", senderId: user, isGM, user});
	}

	static requestFellowshipUpdate(attrib, value) {
		const isGM = game.user.isGM;
		const user = game.user.id;
		return game.socket.emit("system.foundryvtt-litm", { app: "character-sheet", type: "updateFellowship", event: "updateFellowship", attrib, value, senderId: user, isGM, user});
	}

	static async renderFellowship() {
		const apps = Array.from(foundry.applications.instances.values());
		for (const app of apps) {
			if (app.document instanceof Actor && app.document.type === "character") {
				if (app.document.system?.showFellowshipTheme) {
					app.document.render();
				}
			}
            else if (app instanceof Fellowship) {
                app.render();
            }
		}
	}
}
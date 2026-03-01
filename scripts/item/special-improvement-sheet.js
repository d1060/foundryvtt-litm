import V2 from "../v2sheets.js";

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ItemSheetV2 } = foundry.applications.sheets
export class SpecialImprovementSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
    #editingName;
    editingDescription;
    focusDescription;

    constructor(options) {
        super(options);
        if (this.document) {
            if (!this.document.system.themebook) {
                this.document.system.themebook = "circumstance";
                this.document.update({"system.themebook": this.document.system.themebook});
            }
        }
    }

    /** @inheritdoc */
    static DEFAULT_OPTIONS = {
        tag: "form",
        classes: ["app", "window-app", "litm", "litm--special-improvement", "themed", "theme-light"],
        position: {
            width: 412,
            height: 231,
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
            toggleEditDescription: this.#onToggleEditDescription,
        }
    }

    /** @inheritdoc */
    static PARTS = {
        form: { template: "systems/foundryvtt-litm/templates/item/special-improvement.html" }
    }

    get effects() {
        return this.item.effects;
    }

    get system() {
        return this.item.system;
    }

    /** @override */
    async _prepareContext(options) {
        let { data, ...rest } = super._prepareContext(options);

        const context = {
            item: this.document,
            system: structuredClone(this.document.system),
            editingName: this.#editingName,
            editingDescription: this.editingDescription,
        };

        if (!context.item.name) context.item.name = game.i18n.localize("Litm.ui.new-improvement-name");

        if (context.system.description) context.system.description = this.filterDescription(context.system.description);
        if (!context.system.description) {
            context.descriptionPlaceholder = game.i18n.localize("Litm.ui.new-improvement-description");
            if (!this.editingDescription)
                context.system.description = context.descriptionPlaceholder;
        }
        context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML( context.system.description, { async: true, });

        if (!context.system.themebook) context.system.themebook = "circumstance";

        context.themebooks = this.getThemebooks();
        return context;
    }

    async _onRender(force, options) {
        await super._onRender(force, options);
        await V2.updateHeader(this);
        await this.activateListeners(this.element);
    }

    activateListeners(html) {
        html = html instanceof HTMLElement ? html : html[0];
		html.querySelectorAll("[contenteditable]")
			.forEach(span => {
				// Prevent Enter from adding <div> or <br>
				span.addEventListener("keydown", ev => { this.enterText(ev); });

                // Optional: submit also when clicking away
				span.addEventListener("blur", (ev) => {this.setText(ev)});
		});

        if (this.focusDescription) {
            this.focusDescription = false;

            // Wait one tick to ensure the element is in the DOM
            queueMicrotask(() => {
                const el = html.querySelector(".litm--special-improvement-description-active[contenteditable]");
                if (!el) return;

                el.focus();

                // Optional: put caret at end
                const range = document.createRange();
                range.selectNodeContents(el);
                range.collapse(false);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            });
        }
    }

    static async #onSubmit(event, form, formData) {
        event.preventDefault();
        switch (event.target.name) {
            case 'themebook':
                this.setOriginByThemebook(event.target.value);
                this.document.update({"system.themebook": event.target.value});
                break;
        }
    }

    _handleContextMenu(event) {
        event.preventDefault();
    }

    getThemebooks() {
        let themebooks = [ ];
        for (const themebook in CONFIG.litm.theme_levels) {
            const tb = CONFIG.litm.theme_levels[themebook];
            for (const theme of tb) {
                //if (!CONFIG.litm.themebook_equivalence.hasOwnProperty(theme))
                themebooks.push({theme, name: game.i18n.localize(`Litm.themes.${theme}`)});
            }
        }

        return themebooks;
    }

    setOriginByThemebook(themebook) {
        let newLevel;
        for (const themeLevel in CONFIG.litm.theme_levels) {
            const tb = CONFIG.litm.theme_levels[themeLevel];

            if (tb.some(t => t == themebook)) {
                newLevel = themeLevel;
                break;
            }
        }

        if (!newLevel) {
            if (CONFIG.litm.themebook_equivalence.hasOwnProperty(themebook)) {
                const eqTheme = CONFIG.litm.themebook_equivalence[themebook];
                if (eqTheme) {
                    const level = Object.entries(CONFIG.litm.theme_levels).find(([, values]) => values.includes(eqTheme))?.[0];
                    if (level)
                        newLevel = level;
                }
            }
        }

        if (newLevel) {
            let currentLevel = this.document.system.level ?? 'origin';
            if (newLevel !== currentLevel) {
                this.document.update({"system.level": newLevel});

                switch (newLevel) {
                    case 'adventure':
                        this.document.update({"img": 'systems/foundryvtt-litm/assets/media/adventure.webp'});
                        break;
                    case 'greatness':
                        this.document.update({"img": 'systems/foundryvtt-litm/assets/media/greatness.webp'});
                        break;
                    case 'legend':
                        this.document.update({"img": 'systems/foundryvtt-litm/assets/media/legend.webp'});
                        break;
                    case 'variable':
                        this.document.update({"img": 'systems/foundryvtt-litm/assets/media/variable-might.webp'});
                        break;
                    case 'origin':
                    default:
                        this.document.update({"img": 'systems/foundryvtt-litm/assets/media/origin.webp'});
                        break;
                }
            }
        }
    }

    filterDescription(description) {
        if (typeof description !== "string") return description;

        if (
            description.startsWith("<div>") &&
            description.endsWith("</div>")
        ) {
            description = description.slice(5, -6);
        }

        description = description.replace(/(<br\s*\/?>)+$/gi, "");

        return description;
    }

    static async #onToggleEditDescription(event, target) {
        this.editingDescription = true;
        this.focusDescription = true;
        this.render(true);
    }

    async enterText(event) {

    }

    async setText(event) {
        switch (event.target.dataset.input) {
            case 'name':
                this.#editingName = false;
                this.document.update({"name": event.target.innerHTML});
                break;
            case 'description':
                this.editingDescription = false;
                this.document.update({"system.description": event.target.innerHTML});
                break;
        }
        this.render(true);
    }
}

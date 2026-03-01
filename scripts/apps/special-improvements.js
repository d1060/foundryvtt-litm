import Fellowship from "./fellowship.js";
import V2 from "../v2sheets.js";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api
export default class SpecialImprovements extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(options = {}) {
		super(options);

        this.theme = options.theme;
        this.actor = options.actor;
		this.selectedImprovements = structuredClone(this.theme.system.specialImprovements
			.filter(t => t.improvementId)
			.map(t => t.improvementId));

		this.improvements = [];
  		this.closestRawTheme = null;
		this.firstPass = true;
	}

	/** @inheritdoc */
	static DEFAULT_OPTIONS = {
    	tag: "form",
		classes: ["app", "window-app", "litm", "litm--improvement-editor", "themed", "theme-light"],
		position: {
			width: 600,
			height: 1000,
  		},
		window: {
			resizable: true,
    		title: "",
			controls: [],
  		},
		form: {
			handler: this.#onSubmit,
    		closeOnSubmit: true,
		    submitOnChange: true,
  		},
		actions: {
			selectImprovement: this.#selectImprovement,
			deselectImprovement: this.#deselectImprovement
		},
		dragDrop: [{dropSelector: "form"}],
  	}

    /** @inheritdoc */
    static PARTS = {
        form: { template: "systems/foundryvtt-litm/templates/apps/improvement-selector.html" }
    }

    /** @override */
    async _prepareContext(options) {

		this.improvements = await this.getImprovements();
		if (this.firstPass) {
			this.closestRawTheme = await this.getClosestTheme();
			this.firstPass = false;
		}

        const context = {
            target: this.target,
            value: this.value,
        };

		if (this.improvements?.length)
			context.improvements = [...this.improvements];
		else
			context.improvements = [];

        return context;
    }

    async _onRender(force, options) {
        await super._onRender(force, options);
        await V2.updateHeader(this);
        await this.activateListeners(this.element);
		if (this.closestRawTheme) {
			const themebook = this.element.querySelector(`[data-themebook="${this.closestRawTheme}"]`);
  			if (themebook) 
			{
				themebook.scrollIntoView({
					behavior: "instant",
					block: "start"
				});
			}
			this.closestRawTheme = null;
		}
		else
			utils.restoreScrollPositions(this);
    }

    activateListeners(html) {

	}

    static async #onSubmit(event, target) {

        if (this.callback) {
            //this.callback({value: event.target.value, target: this.target});
        }

        if (this.actor) {
            //this.actor.update({[this.target]: event.target.value});
        }
	}

	async allImprovements(theme) {
		const compendiumSpecialImprovements = game.items.filter(i => i.type === 'specialImprovement');
		for (const pack of game.packs) {
			if (pack.metadata.type !== 'Item') continue;
			const indexes = await pack.getIndex();
			const ids = indexes
				.filter(e => e.type === "specialImprovement")
				.map(e => e._id);
			if (!ids.length) continue;
			let docs = await pack.getDocuments({ _id__in: ids });
			if (theme != null) {
				docs = docs.filter(d => d.system.themebook === theme);
			}
			compendiumSpecialImprovements.push(...docs);
		}
		return compendiumSpecialImprovements;
	}

	async getImprovements() {
		const improvements = [];

		const compendiumSpecialImprovements = await this.allImprovements();

		const themeImprovements = structuredClone(this.theme.system.specialImprovements);
		this.selectedImprovements = themeImprovements
			.filter(t => t.improvementId)
			.map(t => t.improvementId);

		const levels = Object.keys(CONFIG.litm.theme_levels);
		for (const level of levels) {
			const themes = CONFIG.litm.theme_levels[level];
			for (const theme of themes) {
				let themeImage = `/systems/foundryvtt-litm/assets/media/${level}.webp`;
				if (level == 'variable')
					themeImage = `/systems/foundryvtt-litm/assets/media/variable-might.webp`;

				let i = 0;
				const compendiumImprovements = compendiumSpecialImprovements.filter(im => im.system?.themebook === theme);
				if (!compendiumImprovements.length) continue;

				improvements.push({level, theme, themeImage, themeNameId: theme, themeName: game.i18n.localize(`Litm.themes.${theme}`)});
				for (const compendiumImprovement of compendiumImprovements) {
					improvements.push({
						level,
						theme,
						improvement: compendiumImprovement,
						id: compendiumImprovement.id,
						selected: this.selectedImprovements.some(i => i == compendiumImprovement.id),
						canSelect: this.selectedImprovements.length < 5,
						title: compendiumImprovement.name,
						description: compendiumImprovement.system.description,
						renderedDescription: await foundry.applications.ux.TextEditor.implementation.enrichHTML(compendiumImprovement.system.description),
						lineStyle: i % 2 == 1 ? "odd" : "even",
					});
					i++;
				}
			}
		}

		return improvements;
	}

	static async #selectImprovement(event) {
		const improvementId = event.target.dataset.id;
		const rawImprovement = this.improvements.find(i => i.id == improvementId);
		if (!rawImprovement) return;

		const emptyImprovementId = this.firstEmptyImprovement();
		if (!emptyImprovementId) return;

		const themeImprovements = structuredClone(this.theme.system.specialImprovements);
		const themeImprovement = themeImprovements.find(i => i.id == emptyImprovementId);
		if (!themeImprovement) return;

		themeImprovement.improvementId = improvementId;
		themeImprovement.name = rawImprovement.title;
		themeImprovement.description = rawImprovement.description;

		if (this.theme._id == 'fellowship') {
			Fellowship.update("system.specialImprovements", themeImprovements);
			this.theme.system.specialImprovements = themeImprovements;
		} else {
			await this.theme.update({"system.specialImprovements": themeImprovements });
		}

		this.selectedImprovements = themeImprovements
			.filter(t => t.improvementId)
			.map(t => t.improvementId);
		this.improvements = await this.getImprovements();

		this.actor?._sheet.render();
		utils.storeScrollPositions(this);
		this.render();
	}

	static async #deselectImprovement(event) {
		const improvementId = event.target.dataset.id;
		const rawImprovement = this.improvements.find(i => i.id == improvementId);
		if (!rawImprovement) return;

		const themeImprovements = structuredClone(this.theme.system.specialImprovements);
		const themeImprovement = themeImprovements.find(i => i.improvementId == improvementId);
		if (!themeImprovement) return;

		themeImprovement.improvementId = null;
		themeImprovement.name = null;
		themeImprovement.description = null;
		themeImprovement.renderedDescription = null;

		if (this.theme._id == 'fellowship') {
			Fellowship.update("system.specialImprovements", themeImprovements);
			this.theme.system.specialImprovements = themeImprovements;
		} else {
			await this.theme.update({"system.specialImprovements": themeImprovements });
		}

		this.selectedImprovements = themeImprovements
			.filter(t => t.improvementId)
			.map(t => t.improvementId);
		this.improvements = await this.getImprovements();

		this.actor?._sheet.render();
		utils.storeScrollPositions(this);
		this.render();
	}

	firstEmptyImprovement() {
		for (const specialImprovement of this.theme.system.specialImprovements) {
			if (!specialImprovement.name || specialImprovement.name == "")
				return specialImprovement.id;
		}
		return null;
	}

	async getClosestTheme() {
		let closestThemeId = null;
		const levels = Object.keys(CONFIG.litm.theme_levels);

		if (this.selectedImprovements.length)
		{
			for (const level of levels) {
				const themes = CONFIG.litm.theme_levels[level];
				for (const theme of themes) {
					let themeImprovements = await this.allImprovements(theme);
					if (!themeImprovements) continue;

					for (const improvement of themeImprovements) {
						if (this.selectedImprovements.some(i => i == improvement.id)) {
							closestThemeId = theme;
							return closestThemeId;
						}
					}
				}
			}
		}

		const actorThemeName = this.theme.system.themebook;
		let lowestSimilarity = Number.MAX_VALUE;
		for (const level of levels) {
			const themes = CONFIG.litm.theme_levels[level];
			for (const theme of themes) {
				const themeName = game.i18n.localize(`Litm.themes.${theme}`);
				const similarity = utils.stringDistance(actorThemeName, themeName);
				if (similarity < lowestSimilarity) {
					lowestSimilarity = similarity;
					closestThemeId = theme;
				}
			}
		}
		return closestThemeId;
	}

    improvement_equivalence = {
        "mystery" : "knowledge",
        "hedge-magic" : "magic",
        "thaumaturgy" : "magic",
        "rulership" : "dominion",
        "grand-thaumaturgy" : "magic",
    };
}
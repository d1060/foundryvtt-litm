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

		this.rawImprovements = [];
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

		if (this.rawImprovements.length == 0)
			this.rawImprovements = await this.getImprovements();
		if (this.firstPass) {
			this.closestRawTheme = this.getClosestRawTheme();
			this.firstPass = false;
		}

        const context = {
            target: this.target,
            value: this.value,
        };

		if (this.rawImprovements?.length)
			context.improvements = [...this.rawImprovements];
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
			V2._restoreScrollPositions(this);
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

	async getImprovements() {
		const improvements = [];
		const levels = Object.keys(CONFIG.litm.theme_levels);
		for (const level of levels) {
			const themes = CONFIG.litm.theme_levels[level];
			for (const theme of themes) {
				let themeImprovements = this.raw_improvements[theme];
				if (!themeImprovements) continue;

				let themeImage = `/systems/foundryvtt-litm/assets/media/${level}.webp`;
				if (level == 'variable')
					themeImage = `/systems/foundryvtt-litm/assets/media/variable-might.webp`;
				improvements.push({level, theme, themeImage, themeNameId: theme, themeName: game.i18n.localize(`Litm.themes.${theme}`)});

				let i = 0;
				for (const improvement of themeImprovements) {
					const title = game.i18n.localize(`Litm.improvements.${improvement}-title`);
					const description = game.i18n.localize(`Litm.improvements.${improvement}-description`);

					improvements.push({
						level,
						theme,
						improvement,
						selected: this.selectedImprovements.some(i => i == improvement),
						canSelect: this.selectedImprovements.length < 5,
						title,
						description,
						renderedDescription: await foundry.applications.ux.TextEditor.implementation.enrichHTML(description),
						lineStyle: i % 2 == 1 ? "odd" : "even",
					});
					i++;
				}
			}
		}

		return improvements;
	}

	static async #selectImprovement(event) {
		const improvementId = event.target.dataset.improvement;
		const rawImprovement = this.rawImprovements.find(i => i.improvement == improvementId);
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
		this.rawImprovements = await this.getImprovements();

		this.actor?._sheet.render();
		V2._storeScrollPositions(this);
		this.render();
	}

	static async #deselectImprovement(event) {
		const improvementId = event.target.dataset.improvement;
		const rawImprovement = this.rawImprovements.find(i => i.improvement == improvementId);
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
		this.rawImprovements = await this.getImprovements();

		this.actor?._sheet.render();
		V2._storeScrollPositions(this);
		this.render();
	}

	firstEmptyImprovement() {
		for (const specialImprovement of this.theme.system.specialImprovements) {
			if (!specialImprovement.name || specialImprovement.name == "")
				return specialImprovement.id;
		}
		return null;
	}

	getClosestRawTheme() {
		let closestThemeId = null;
		const levels = Object.keys(CONFIG.litm.theme_levels);

		if (this.selectedImprovements.length)
		{
			for (const level of levels) {
				const themes = CONFIG.litm.theme_levels[level];
				for (const theme of themes) {
					let themeImprovements = this.raw_improvements[theme];
					if (!themeImprovements) continue;

					let i = 0;
					for (const improvement of themeImprovements) {
						if (this.selectedImprovements.some(i => i == improvement)) {
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



	raw_improvements = {
        "circumstance" : [
            "comfort-zone",
            "expected-role",
            "familiar-matters",
            "strength-from-adversity",
            "trudging-along"
        ],
        "devotion" : [
            "bodyguard",
            "catch-me-when-i-fall",
            "deeply-committed",
            "goes-both-ways",
            "unwavering"
        ],
        "past" : [
            "face-from-the-past",
            "lessons-learned",
            "not-letting-go",
            "put-it-behind-me",
            "vivid-memory",
        ],
        "people" : [
			"shared-language",
			"stand-out",
			"true-to-my-tribe",
			"trust-in-legacy",
            "wisdom-handed-down",
        ],
        "personality" : [
			"adaptable-persona",
			"big-personality",
			"infectious-personality",
			"lasting-impression",
			"unshakeable",
        ],
        "trade-or-skill" : [
			"deft-remedy",
			"learn-from-my-mistakes",
			"practice-makes-perfect",
			"rehearsed-technique",
			"resourceful",
        ],
        "trait" : [
			"innate-sense",
			"made-for-this",
			"moment-to-shine",
			"pull-through",
			"wild-blood",
        ],
        "duty" : [
			"dutiful-anticipation",
			"grim-determination",
			"painful-lessons",
			"driven-by-shame",
			"unstoppable",
        ],
        "influence" : [
			"follow-me",
			"friends-everywhere",
			"long-reach",
			"overextend",
			"read-between-the-lines",
        ],
        "knowledge" : [
			"a-known-expert",
			"always-thinking",
			"applied-expertise",
			"inventive-stroke",
			"flashes-of-insight",
        ],
        "prodigious-skill" : [
			"improved-counter",
			"create-an-opening",
			"discerning-eye",
			"masterpiece",
			"practiced-maneuver",
        ],
        "relic" : [
			"eternal-bond",
			"momentary-bearer",
			"reckless-discharge",
			"sentinel",
			"signature-move",
        ],
        "uncanny-being" : [
			"expressive-form",
			"repel-witchery",
			"self-discovery",
			"shifting-form",
			"strive-to-belong",
        ],
        "destiny" : [
			"as-foretold",
			"meet-it-head-on",
			"not-how-it-ends",
			"reincarnation",
			"pull-of-destiny",
        ],
        "dominion" : [
			"embodiment-of-the-realm",
			"good-help-is-hard-to-find",
			"my-word-is-absolute",
			"regalia",
			"untarnished-glory",
        ],
        "mastery" : [
			"always-prepared",
			"calculated-sacrifice",
			"foresee-the-outcome",
			"lifelong-insight",
			"second-wind",
        ],
        "monstrosity" : [
			"display-of-force",
			"fine-control",
			"invulnerability",
			"magical-trace",
			"surge-of-power",
        ],
        "companion" : [
			"everyones-best-friend",
			"here-for-you",
			"perfect-positioning",
			"reliable-ally",
			"retaliation",
        ],
        "magic" : [
			"scholar-of-magic",
			"ward-breaker",
			"rote-technique",
			"reputation-precedes",
			"inspired-ingenuity",
        ],
        "possessions" : [
			"durable",
			"favorite-piece",
			"im-keeping-this",
			"just-the-thing",
			"quartermaster",
        ],
    };

    raw_improvement_equivalence = {
        "mystery" : "knowledge",
        "hedge-magic" : "magic",
        "thaumaturgy" : "magic",
        "rulership" : "dominion",
        "grand-thaumaturgy" : "magic",
    };
}
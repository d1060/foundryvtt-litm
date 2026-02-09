import Randomizer from '../../apps/randomizer.js';

export class CharacterData extends foundry.abstract.TypeDataModel {
	static themeKits = null;

	static defineSchema() {
		const fields = foundry.data.fields;
		return {
			note: new fields.HTMLField(),
			promise: new fields.NumberField({
				integer: true,
				min: 0,
				initial: 0,
				max: 5,
			}),
			scale: new fields.NumberField({
				integer: false,
				min: 0.25,
				initial: 1,
				max: 5,
			}),
			showFellowshipTheme: new fields.BooleanField({
				required: true,
				initial: false,
			}),
			flippedFellowshipCard: new fields.BooleanField({
				required: true,
				initial: false,
			}),
		};
	}

	static getTrackableAttributes() {
		return {
			bar: ["limit"],
			value: [],
		};
	}

	get backpack() {
		const backpack = this.parent.items.find((item) => item.type === "backpack");
		if (!backpack) return [];
		return backpack.system.contents;
	}

	get allTags() {
		const backpack = this.backpack;
		const themeTags = this.parent.items
			.filter((item) => item.type === "theme")
			.flatMap((item) => item.system.allTags);
		const fellowship = game.settings.get("foundryvtt-litm", "fellowship");

		const fellowshipPowerTags = structuredClone(fellowship.system.powerTags);
		for (const fellowshipPowerTag of fellowshipPowerTags) {
			fellowshipPowerTag.isSingleUse = true;
			fellowshipPowerTag.isScratched = fellowshipPowerTag.isBurnt;
		}
		const fellowshipTags = [...fellowshipPowerTags, ...fellowship.system.weakness];
		return [...backpack, ...themeTags, ...fellowshipTags, {
			id: 'fellowship', 
			type: 'themeTag', 
			isActive: fellowship.system.isActive,
			isScratched: fellowship.system.isBurnt,
			isBurnt: fellowship.system.isBurnt,
			toBurn: fellowship.system.toBurn,
			name: fellowship.name,
			isSingleUse: true}];
	}

	get powerTags() {
		return this.allTags.filter(
			(tag) =>
				tag.type === "powerTag" ||
				tag.type === "themeTag" ||
				tag.type === "backpack",
		);
	}

	get weaknessTags() {
		return this.parent.items
			.filter((item) => item.type === "theme")
			.flatMap((item) => item.system.weakness);
	}

	get availablePowerTags() {
		const backpack = this.backpack.filter(
			(tag) => tag.isActive && !tag.isBurnt,
		);
		const themeTags = this.parent.items
			.filter((item) => item.type === "theme")
			.flatMap((item) => item.system.availablePowerTags);
		return [...backpack, ...themeTags];
	}

	get statuses() {
		return this.parent.appliedEffects
			.filter((item) => (item.getFlag("foundryvtt-litm", "values") && Array.isArray(item.getFlag("foundryvtt-litm", "values")) ? item.getFlag("foundryvtt-litm", "values") : [])?.some((v) => !!v))
			.map((item) => {
				return {
					...item.flags["foundryvtt-litm"],
					type: "status",
					value: item.flags["foundryvtt-litm"].values.findLast((v) => !!v),
					id: item._id,
					name: item.name,
				};
			});
	}

	get storyTags() {

		const storyTags = [];
		for (const item of this.parent.appliedEffects) {
			const values = item.getFlag("foundryvtt-litm", "values");
			if (values && Array.isArray(values) && values?.every((v) => !v)) {
				storyTags.push({
					...item.flags["foundryvtt-litm"],
					type: "tag",
					value: item.flags["foundryvtt-litm"].values.findLast((v) => !!v),
					id: item._id,
					name: item.name,
				});
			}
		}
		return storyTags;

		// return this.parent.appliedEffects
		// 	.filter((item) => item.getFlag("foundryvtt-litm", "values")?.every((v) => !v))
		// 	.map((item) => {
		// 		return {
		// 			...item.flags["foundryvtt-litm"],
		// 			type: "tag",
		// 			value: item.flags["foundryvtt-litm"].values.findLast((v) => !!v),
		// 			id: item._id,
		// 			name: item.name,
		// 		};
		// 	});
	}

	get limit() {
		return {
			label: "Litm.other.limit",
			value:
				6 - (this.statuses.sort((a, b) => b.value - a.value)[0]?.value || 0),
			max: 6,
		};
	}

	async prepareBaseData() {

	}

	async prepareDerivedData() {
		// Make sure only four themes are present
		const themes = this.parent.items.filter((item) => item.type === "theme");
		if (themes.length > 4) {
			logger.warn(
				`Too many themes found for ${this.parent.name}, attempting to resolve...`,
			);
			const toDelete = themes.slice(4);
			await this.parent.deleteEmbeddedDocuments(
				"Item",
				toDelete.map((item) => item._id),
			);
		}

		// Make sure only one backpack is present
		const backpacks = this.parent.items.filter(
			(item) => item.type === "backpack",
		);
		if (backpacks.length > 1) {
			logger.warn(
				`Too many backpacks found for ${this.parent.name}, attempting to resolve...`,
			);
			const toDelete = backpacks.slice(1);
			await this.parent.deleteEmbeddedDocuments(
				"Item",
				toDelete.map((item) => item._id),
			);
		}

		// Validate unique data ids
		// Get duplicates
		const duplicates = this.allTags
			.map((tag) => tag.id)
			.filter((id, index, arr) => arr.indexOf(id) !== index);
		if (!duplicates.length) return;
		logger.warn("Duplicate tag IDs found, attempting to resolve...");
		logger.error(`Duplicate tag IDs found for: ${this.parent._id}`, duplicates);

		// try to fix duplicates
		const tags = this.allTags;
		for (const tag of tags) {
			if (duplicates.includes(tag.id)) {
				tag.id = foundry.utils.randomID();
			}
		}
	}

	static async createThemes(actor) {
		const existingThemes = actor.items.filter(it => it.type === "theme").length;
		const missingThemes = Math.max(0, 4 - existingThemes);

		if (this.themeKits == null)
			this.themeKits = await foundry.utils.fetchJsonWithTimeout("systems/foundryvtt-litm/assets/data/theme-kits.json");
		let startupKits = structuredClone(this.themeKits.filter(t => t.startup == "true"));

		for (let i = 0; i < missingThemes; i++) {
			const newTheme = await actor.createEmbeddedDocuments("Item", [{
				name: `${utils.localize("TYPES.Item.theme")} ${existingThemes + i + 1}`,
				type: "theme"
			}]);

			this.randomizeThemeKit(actor, newTheme[0], startupKits);
		}

		const backpack = actor.items.find(it => it.type === "backpack");
		if (!backpack) {
			await actor.createEmbeddedDocuments("Item", [{
				name: utils.localize("TYPES.Item.backpack"),
				type: "backpack"
			}]);
		}
	}

	static async randomize(actor) {
        const gender = Math.random() >= 0.5 ? 'male' : 'female';
		await this.randomizeName(actor, gender);
		await this.randomizeImage(actor, gender);
	}

	static async randomizeName(actor, gender) {
		const name = Randomizer.newName(gender);
		actor.name = name;
		await actor.update({"name": actor.name});
	}

	static async randomizeImage(actor, gender) {
		if (actor?.img == '' || actor?.img?.startsWith('icons/svg/'))
		{
			const portrait = Randomizer.randomizeImage(gender);
			actor.img = portrait;
			await actor.update({"img": actor.img});
		}
	}

	static async randomizeThemeKit(actor, theme, startupKits) {
		const themeIndex = Math.floor(Math.random() * startupKits.length);
		const themeKitList = startupKits[themeIndex];
		startupKits.splice(themeIndex, 1);

		const themeKitIndex = Math.floor(Math.random() * themeKitList.kits.length);
		const themeKit = themeKitList.kits[themeKitIndex];

		// Power Tags.
		const powerTags = structuredClone(theme.system.powerTags);
		for (var a = 0; a < 2; a++) {
			const themeKitPowerTagIndex = Math.floor(Math.random() * themeKit.tags.length);
			const themeKitPowerTag = themeKit.tags[themeKitPowerTagIndex];
			themeKit.tags.splice(themeKitPowerTagIndex, 1);

			powerTags[a].name = themeKitPowerTag;
		}

		// Weakness Tags.
		const weakness = structuredClone(theme.system.weaknessTags);
		const themeKitWeaknessIndex = Math.floor(Math.random() * themeKit.weaknesses.length);
		const themeKitWeakness = themeKit.weaknesses[themeKitWeaknessIndex];
		themeKit.weaknesses.splice(themeKitWeaknessIndex, 1);
		weakness[0].name = themeKitWeakness;

		await actor.updateEmbeddedDocuments("Item", [
			{
				_id: theme.id,
				"name": themeKit.title,
				"system.themebook": themeKitList.theme,
				"system.motivation": themeKit.mission,
				"system.powerTags": powerTags,
				"system.weaknessTags": weakness
			},
		]);
	}
}

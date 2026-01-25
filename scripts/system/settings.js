export class LitmSettings {
	static createTag(data, type) {
		return {
			...(data || { name: "", isBurnt: false, isActive: false, isSingleUse: false }),
			type,
			id: foundry.utils.randomID(),
		};
	}

	static register() {
		game.settings.register("foundryvtt-litm", "welcomed", {
			name: "Welcome Screen",
			hint: "Welcome Scene, Message, and Journal Entry has been created and displayed.",
			scope: "world",
			config: false,
			type: Boolean,
			default: false,
		});

		game.settings.register("foundryvtt-litm", "storytags", {
			name: "Story Tags",
			hint: "Tags that are shared between all users.",
			scope: "world",
			config: false,
			type: Object,
			default: {
				tags: [],
				actors: [],
			},
		});

		game.settings.register("foundryvtt-litm", "fellowship", {
			name: "Fellowship",
			hint: "Fellowship card shared by all Players.",
			scope: "world",
			config: false,
			type: Object,
			default: {
				name: "",
				type: "theme",
				system: {
					themebook: "",
					level: "fellowship",
					isActive: true,
					isBurnt: false,
					toBurn: false,
					powerTags: Array(10)
						.fill()
						.map((_, i) => this.createTag({name: "", isBurnt: false, toBurn: false, isActive: false, isSingleUse: true}, "powerTag")),
					weakness: Array(2)
						.fill()
						.map((_, i) => this.createTag({name: "", isBurnt: false, toBurn: false, isActive: true, isSingleUse: false}, "weaknessTag")),
					specialImprovements: Array(5)
							.fill()
							.map((_, i) => ({
								id: foundry.utils.randomID(),
								name: "",
								description: "",
								improvementId: "",
								type: "specialImprovement",
							})),
					experience: 0,
					decay: 0,
					motivation: "",
					note: "",
				},
			},
		});

		game.settings.register("foundryvtt-litm", "show_tag_window_on_load", {
			name: "Litm.ui.show-tag-window-on-load",
			hint: "Litm.ui.show-tag-window-on-load-hint",
			scope: "client",
			config: true,
			type: Boolean,
			default: true,
		});

		game.settings.register("foundryvtt-litm", "skip_roll_moderation", {
			name: "Litm.settings.skip-roll-moderation",
			hint: "Litm.settings.skip-roll-moderation-hint",
			scope: "client",
			config: true,
			type: Boolean,
			default: true,
		});

		game.settings.register("foundryvtt-litm", "user_prefs", {
			name: "",
			hint: "",
			scope: "client",
			config: false,
			type: Object,
			default: {},
		});
	}
}

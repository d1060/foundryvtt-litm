import { info } from "../logger.js";

export class HandlebarsHelpers {
	static register() {
		info("Registering Handlebars Helpers...");

		Handlebars.registerHelper("add", (...args) => {
			args.pop();
			return args.reduce((acc, val) => acc + val, 0);
		});

		Handlebars.registerHelper("includes", (array, value, path) =>
			Array.isArray(array)
				? (path && array.some((i) => i[path] === value)) ||
					array.includes(value)
				: false,
		);

		Handlebars.registerHelper(
			"progress-buttons",
			function (current, max, block) {
				let acc = "";
				for (let i = 0; i < max; ++i) {
					block.data.index = i;
					block.data.checked = i < current;
					acc += block.fn(this);
				}
				return acc;
			},
		);

		Handlebars.registerHelper(
			"titlecase",
			(string) => string.charAt(0).toUpperCase() + string.slice(1),
		);

		Handlebars.registerHelper("tagActiveString", (tag, readonly) =>
			tag.isActive
				? "Litm.tags.isActive"
				: readonly
					? "Litm.tags.isInactive"
					: "Litm.tags.activate",
		);

		Handlebars.registerHelper("range", function (from, to) {
			const out = [];
			for (let i = from; i <= to; i++)
				out.push(i);
			return out;
		});
	}
}

export class HandlebarsPartials {
	static partials = [
		"systems/foundryvtt-litm/templates/apps/improvement-selector.html",
		"systems/foundryvtt-litm/templates/apps/loot-dialog.html",
		"systems/foundryvtt-litm/templates/apps/roll-dialog.html",
		"systems/foundryvtt-litm/templates/apps/story-tags.html",
		"systems/foundryvtt-litm/templates/chat/message.html",
		"systems/foundryvtt-litm/templates/chat/message-tooltip.html",
		"systems/foundryvtt-litm/templates/chat/moderation.html",
		"systems/foundryvtt-litm/templates/item/backpack-ro.html",
		"systems/foundryvtt-litm/templates/item/theme-card.html",
		"systems/foundryvtt-litm/templates/item/theme-ro.html",
		"systems/foundryvtt-litm/templates/item/theme-ro-back.html",
		"systems/foundryvtt-litm/templates/item/leaf-ro.html",
		"systems/foundryvtt-litm/templates/partials/new-tag.html",
		"systems/foundryvtt-litm/templates/partials/roll-tag.html",
		"systems/foundryvtt-litm/templates/partials/tag.html",
		"systems/foundryvtt-litm/templates/partials/tag-item.html",
		"systems/foundryvtt-litm/templates/partials/add-button.html",
		"systems/foundryvtt-litm/templates/partials/divider.html",
	];

	static register() {
		info("Registering Handlebars Partials...");
		foundry.applications.handlebars.loadTemplates(HandlebarsPartials.partials);
	}
}

export class Enrichers {
	static register() {
		Enrichers.#enrichSceneLinks();
		// Note that this one has to go last for now
		Enrichers.#enrichTags();
	}

	static #enrichSceneLinks() {
		const enrichSceneLinks = ([text, sceneId, flavour]) => {
			const id = sceneId.replace(/^Scene./, "");

			const scene = game.scenes.get(id) || game.scenes.getName(id);
			if (!scene) return text;

			const link = $(
				`<a class="content-link" draggable="true" data-uuid="Scene.${
					scene._id
				}" data-id="${
					scene._id
				}" data-type="ActivateScene" data-tooltip="Scene"><i class="far fa-map"></i>${
					flavour || scene.navName
				}</a>`,
			);
			return link[0];
		};
		CONFIG.TextEditor.enrichers.push({
			pattern: CONFIG.litm.sceneLinkRe,
			enricher: enrichSceneLinks,
		});
	}

	static #enrichTags() {
		const tooltip = game.i18n.localize("Litm.ui.drag-apply");
		const enrichTags = ([_text, tag, status]) => {
			let isWeakness = tag.startsWith("--");
			let isLimit = tag.startsWith("-") && !isWeakness;

			let isLegend = tag.endsWith("+++");
			let isGreatness = tag.endsWith("++") && !isLegend;
			let isAdventure = tag.endsWith("+") && !isGreatness && !isLegend;

			let markClass = 'litm--tag';
			let imageBefore = "";

			if (isWeakness) {
				markClass = 'litm--weaknessTag';
				tag = tag.replace(/^--/, "");
				imageBefore = '<i class="fa fa-angle-double-down"></i>';
			}
			else if (isLimit) {
				markClass = 'litm--limit';
				tag = tag.replace(/^-/, "");
			}
			else if (status) {
				markClass = 'litm--status';
			}

			let level = 'origin';
			if (isLegend && !isWeakness) {
				level = 'legend';
				tag = tag.replace(/\+\+\+$/, "");
				imageBefore = '<i class="litm--legend-icon"></i>';
			}
			if (isGreatness && !isWeakness) {
				level = 'greatness';
				tag = tag.replace(/\+\+$/, "");
				imageBefore = '<i class="litm--greatness-icon"></i>';
			}
			if (isAdventure && !isWeakness) {
				level = 'adventure';
				tag = tag.replace(/\+$/, "");
				imageBefore = '<i class="litm--adventure-icon"></i>';
			}

			const enrichedTag = $(`<mark class="${markClass}" draggable="true" ${status ? `data-status="${status}" `:""}data-level="${level}" data-tooltip="${tooltip}">${imageBefore}${tag}${status ? `-${status}`:""}</mark>`)[0];
			return enrichedTag;
		};
		CONFIG.TextEditor.enrichers.push({
			pattern: CONFIG.litm.tagStringRe,
			enricher: enrichTags,
		});
	}
}

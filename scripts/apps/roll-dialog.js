import { Sockets } from "../system/sockets.js";
import Fellowship from "./fellowship.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api
export class LitmRollDialog extends HandlebarsApplicationMixin(ApplicationV2) {
	#tagState = [];
	#shouldRoll = () => false;
	#modifier = 0;
	#firstPrepare = true;

	constructor(actorId, characterTags = [], options = {}) {
		super({}, options);

		this.#tagState = options.tagState || [];
		this.#shouldRoll = options.shouldRoll || (() => false);
		this.#modifier = options.modifier || 0;

		this.actorId = actorId;
		this.characterTags = characterTags;
		this.speaker =
			options.speaker || ChatMessage.getSpeaker({ actor: this.actor });
		this.rollName = options.title || game.i18n.localize(LitmRollDialog.DEFAULT_OPTIONS.window.title);
		this.type = options.type || "tracked";
	}

	/** @inheritdoc */
	static DEFAULT_OPTIONS = {
    	tag: "form",
		classes: ["app", "window-app", "litm", "litm--roll", "themed", "theme-light"],
		position: {
			width: 500,
			height: "auto",
  		},
		window: {
			resizable: true,
    		title: "Litm.ui.roll-title",
			controls: [],
  		},
		form: {
			handler: this.#onSubmit,
    		closeOnSubmit: false,
		    submitOnChange: true,
  		},
		actions: {
			addTag: this.#onAddTag,
			cancel: this.#onClose,
			rollDice: this.#onRollDice,
		},
		dragDrop: [{dropSelector: "form"}],
  	}

	/** @inheritdoc */
	static PARTS = {
		form: { template: "systems/foundryvtt-litm/templates/apps/roll-dialog.html" }
	}

	async getTitle() {
	    return game.i18n.localize("Litm.ui.roll-title");
	}

	static create({
		actorId,
		characterTags,
		speaker,
		tagState,
		shouldRoll,
		type,
		title,
		id,
	}) {
		return new LitmRollDialog(actorId, characterTags, {
			tagState,
			speaker,
			shouldRoll,
			type,
			title,
			id,
		});
	}

	static async roll({ actorId, tags, title, type, speaker, modifier = 0 }) {
		// Separate tags
		const {
			burnedTags,
			powerTags,
			weaknessTags,
			positiveStatuses,
			negativeStatuses,
		} = LitmRollDialog.#filterTags(tags);

		// Values
		const {
			burnedValue,
			powerValue,
			weaknessValue,
			positiveStatusValue,
			negativeStatusValue,
			totalPower,
		} = game.litm.methods.calculatePower({
			burnedTags,
			powerTags,
			weaknessTags,
			positiveStatuses,
			negativeStatuses,
			storyThemes: tags.storyThemes,
			modifier: Number(modifier) || 0,
		});

		const formula =
			typeof CONFIG.litm.roll.formula === "function"
				? CONFIG.litm.roll.formula({
						burnedTags,
						powerTags,
						weaknessTags,
						positiveStatuses,
						negativeStatuses,
						burnedValue,
						powerValue,
						weaknessValue,
						positiveStatusValue,
						negativeStatusValue,
						totalPower,
						actorId,
						type,
						title,
						modifier,
					})
				: CONFIG.litm.roll.formula ||
					"2d6 + (@burnedValue + @powerValue + @positiveStatusValue - @weaknessValue - @negativeStatusValue + @modifier)";

		const actor = game.actors.get(actorId);
		logger.warn(`${actor?.name} (${actorId}) is performing a roll with modifiers: ${burnedValue} + ${powerValue} + ${positiveStatusValue} - ${weaknessValue} - ${negativeStatusValue} + ${modifier}.`);
		// Roll
		const roll = new game.litm.LitmRoll(
			formula,
			{
				burnedValue,
				powerValue,
				positiveStatusValue,
				weaknessValue,
				negativeStatusValue,
				modifier: Number(modifier) || 0,
			},
			{
				actorId,
				title,
				type,
				burnedTags,
				powerTags,
				weaknessTags,
				positiveStatuses,
				negativeStatuses,
				speaker,
				totalPower,
				modifier,
			},
		);

		const res = await roll.toMessage({
				speaker,
				flavor: title,
			});

		// Reset roll dialog
		await res.rolls[0]?.actor?.sheet.resetRollDialog();
		Sockets.dispatch("resetRollDialog", { actorId });

		if (roll.litm?.burnedTags?.length) {
			for (const tag of roll.litm.burnedTags) {
				if (tag.type == "powerTag" || tag.type == "backpack" || tag.type == "themeTag")
				{
					const actor = game.actors.get(actorId);
					await actor?.sheet.toggleBurnTag(tag);
				} else {
					if (game.user.isGM)
						game.litm.storyTags?.burnTag(tag);
					else
						Sockets.dispatch("burnStoryTag", {tag});
				}
			}
		}

		if (roll.litm?.powerTags?.length) {
			for (const tag of roll.litm.powerTags.filter(t => t.isSingleUse)) {
				if (tag.type == "powerTag" || tag.type == "backpack" || tag.type == "themeTag")
				{
					const actor = game.actors.get(actorId);
					await actor?.sheet.toggleBurnTag(tag);
				} else {
					if (game.user.isGM)
						game.litm.storyTags?.burnTag(tag);
					else
						Sockets.dispatch("burnStoryTag", {tag});
				}
			}
		}

		if (roll.litm?.weaknessTags?.length) {
			const weaknessTag = roll.litm.weaknessTags[0];
			const actor = game.actors.get(roll.litm.actorId);
			if (actor && weaknessTag) {
				if (await actor.sheet.gainExperience(weaknessTag) == null) {
					const fellowship = game.settings.get("foundryvtt-litm", "fellowship");
					if (fellowship && fellowship.system.weakness.some(w => w.id == weaknessTag.id) && fellowship.system.experience < 3) {
						fellowship.system.experience ++;
						Fellowship.update("system.experience", fellowship.system.experience);
					}
				}
			}
		}

		return res;
	}

	static calculatePower(tags) {
		let burnedValue = tags.burnedTags.length * 3;
		let powerValue = tags.powerTags.length;
		let weaknessValue = tags.weaknessTags.length;

		let positiveStatusValue = 0;
		for (const positiveStatus of tags.positiveStatuses) {
			if (positiveStatus.value != null) {
				const thisValue = Number.parseInt(positiveStatus.value);
				if (thisValue > positiveStatusValue) positiveStatusValue = thisValue;
			}
			else if (positiveStatus.values?.length) {
				for (let i = positiveStatus.values.length - 1; i >= 0; i--) {
					if (positiveStatus.values[i] != null) {
						const thisValue = Number.parseInt(positiveStatus.values[i]);
						if (thisValue > positiveStatusValue) positiveStatusValue = thisValue;
						break;
					}
				}
			}
		}

		let negativeStatusValue = 0;
		for (const negativeStatus of tags.negativeStatuses) {
			if (negativeStatus.value != null) {
				const thisValue = Number.parseInt(negativeStatus.value);
				if (thisValue > negativeStatusValue) negativeStatusValue = thisValue;
			}
			else if (negativeStatus.values?.length) {
				for (let i = negativeStatus.values.length - 1; i >= 0; i--) {
					if (negativeStatus.values[i] != null) {
						const thisValue = Number.parseInt(negativeStatus.values[i]);
						if (thisValue > negativeStatusValue) negativeStatusValue = thisValue;
						break;
					}
				}
			}
		}

		const modifier = Number(tags.modifier) || 0;

		const totalPower 
			= burnedValue
			+ powerValue
			+ positiveStatusValue 
			- weaknessValue 
			- negativeStatusValue 
			+ modifier;

		return {
			burnedValue,
			powerValue,
			weaknessValue,
			positiveStatusValue,
			negativeStatusValue,
			totalPower,
			modifier,
		};
	}

	static #filterTags(tags) {
		const burnedTags = tags.filter((t) => t?.state === "burned");
		const powerTags = tags.filter( (t) => t?.type !== "status" && t?.state === "positive", );
		const weaknessTags = tags.filter( (t) => t?.type !== "status" && t?.state === "negative", );
		const positiveStatuses = tags.filter( (t) => t?.type === "status" && t?.state === "positive", );
		const negativeStatuses = tags.filter( (t) => t?.type === "status" && t?.state === "negative", );

		return {
			burnedTags,
			powerTags,
			weaknessTags,
			positiveStatuses,
			negativeStatuses,
		};
	}

	get actor() {
		return game.actors.get(this.actorId);
	}

	get statuses() {
		const { tags } = game.litm.storyTags;
		const statuses = tags.filter((tag) => tag.values.some((v) => !!v));
		return [...statuses, ...this.actor.system.statuses].map((tag) => ({
			...tag,
			state: this.#tagState.find((t) => t.id === tag.id)?.state || "",
			states: ",negative,positive",
		}));
	}

	get tags() {
		const { tags } = game.litm.storyTags;
		return [
			...tags.filter((tag) => tag.values.every((v) => !v)),
			...this.actor.system.storyTags,
		].map((tag) => ({
			...tag,
			state: this.#tagState.find((t) => t.id === tag.id)?.state || "",
			states: ",negative,positive,burned",
		}));
	}

	get gmTags() {
		if (!game.user.isGM) return [];

		const { actors } = game.litm.storyTags;
		const tags = actors
			.filter((actor) => actor.id !== this.actorId)
			.flatMap((actor) => actor.tags);
		return tags
			.map((tag) => ({
				...tag,
				state: this.#tagState.find((t) => t.id === tag.id)?.state || "",
				states:
					tag.type === "tag"
						? ",negative,positive,burned"
						: ",negative,positive",
			}))
			.filter((tag) => tag.state !== "");
	}

	get targetTags() {
		const targetTags = [];
		for (const target of game.user.targets.values()) {
			if (!target.actor) continue;
			if (target.actor.type == "challenge") {
				let tags = target.actor.system.tags;
				const tagsArray = [...tags.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
				targetTags.push(...tagsArray);
			}
		}

		const mappedTargetTags = [];
		for (const targetTag of targetTags) {
			if (targetTag.includes('-')) {
				const parts = targetTag.split("-");
				mappedTargetTags.push({
					id: `${utils.stringHash(parts[0])}`,
					name: parts[0],
					state: "",
					states: ",negative",
					type: "status",
					value: parseInt(parts[1]),
				});
			} else {
				mappedTargetTags.push({
					id: `${utils.stringHash(targetTag)}`,
					name: targetTag,
					state: "",
					states: ",negative",
					type: "targetTag"
				});
			}
		}
		return mappedTargetTags;
	}

	get totalPower() {
		const state = [...this.#tagState, ...this.characterTags.filter(t => t.isActive), ...this.targetTags];

		for (const storyTheme of this.storyThemes ?? []) {
			if (storyTheme.state != null && storyTheme.state != "") {
				state.push(LitmRollDialog.storyThemeToTag(storyTheme));
			}

			for (const tag of storyTheme.tags ?? []) {
				if (tag.state != null && tag.state != "") {
					state.push(tag);
				}
			}
		}

		for (const tag of state) {
			if (tag.value == null && tag.values != null && tag.values?.length) {
				for (let i = tag.values.length - 1; i >= 0; i--) {
					if (tag.values[i] != null) {
						tag.value = Number.parseInt(tag.values[i]);
						break;
					}
				}
			}
		}
		
		const tags = LitmRollDialog.#filterTags(state);
		const { totalPower } = LitmRollDialog.calculatePower({
			...tags,
			storyThemes: this.storyThemes,
			modifier: this.#modifier,
		});
		return totalPower;
	}

	/** @override */
	async _prepareContext(options) {
		const data = {};
		const skipModeration = this.#shouldRoll();
		const config = game.settings.get("foundryvtt-litm", "storytags");
		this.storyThemes = structuredClone(config.storyThemes);
		if (this.#firstPrepare) {
			await this._resetStoryThemeTagsStates(config);
		}
		if (this.storyThemes?.length) {
			for (const storyTheme of this.storyThemes) {
				storyTheme.title = LitmRollDialog.storyThemeToTag(storyTheme);
				storyTheme.title = LitmRollDialog.classifyTag(storyTheme.title);

				for (let tag of storyTheme.tags ?? []) {
					tag = LitmRollDialog.classifyTag(tag);
				}
			}
		}

		this.#firstPrepare = false;

		const context = {
			...data,
			actorId: this.actorId,
			characterTags: utils.sortTags(this.characterTags.filter(t => t.isActive)),
			rollTypes: {
				quick: "Litm.ui.roll-quick",
				tracked: "Litm.ui.roll-tracked",
				mitigate: "Litm.ui.roll-mitigate",
			},
			skipModeration,
			statuses: utils.sortTags(this.statuses),
			tags: utils.sortTags(this.tags),
			gmTags: utils.sortTags(this.gmTags),
			targetTags: this.targetTags,
			isGM: game.user.isGM,
			title: this.rollName,
			type: this.type,
			totalPower: this.totalPower,
			modifier: this.#modifier,
			storyThemes: this.storyThemes,
		};
		
		return context;
	}

	async _onFirstRender(context, options) {

	}

	async _onRender(force, options) {
		await this.activateListeners(this.element);
	}

	activateListeners(html) {
		const root = html instanceof HTMLElement ? html : html[0];

		/* CLICKABLE ELEMENTS */
		root.querySelectorAll("[data-click]").forEach(el => {
			const handler = this._handleClick.bind(this);

			el.addEventListener("keydown", event => {
				if (event.key === "Enter" || event.key === " ") handler(event);
			});
		});

		/* CUSTOM CHECKBOX ELEMENT */
		root.querySelectorAll("litm-super-checkbox").forEach(el => {
			el.addEventListener("change", this._handleCheckboxChange.bind(this));
		});

		/* MODIFIER INPUT ELEMENTS */
		root.querySelectorAll("[data-update='modifier']").forEach(el => {
			el.addEventListener("change", this._handleModifierChange.bind(this));
		});
	}

	static async #onAddTag(event) { this.actor.sheet.render(true); }
	static async #onClose() { this.close(); }

	static async #onRollDice(event, target) {
		const formData = new FormData(event.currentTarget);
		const fd = Object.fromEntries(formData.entries());

		this._updateObject(event, fd);
		this.close();
	}

	static async #onSubmit(event, target) {
		//logger.info(`LitmRollDialog #onSubmit`);
	}

	addTag(tag, toBurn) {
		tag.state  =  tag.type === "weaknessTag" ? "negative" : toBurn ? "burned" : "positive";
		tag.states = (tag.type === "weaknessTag" ? ",negative" : (",positive" + (tag.isSingleUse ? "" : ",burned")));

		this.characterTags.push(tag);

		this.setTotalPower();
		this.#dispatchUpdate();
	}

	removeTag(tag) {
		this.characterTags = this.characterTags.filter((t) => t.id !== tag.id);

		this.setTotalPower();
		this.#dispatchUpdate();
	}

	updateTag(tag) {
		const cTag = this.characterTags.find((t) => t.id == tag.id);
		if (cTag) {
			cTag.isActive = tag.isActive;
			cTag.isBurnt = tag.isBurnt;
		}

		this.setTotalPower();
		this.#dispatchUpdate();
	}

	getFilteredArrayFromFormData(formData) {
		const allTags = [...this.#tagState, ...this.characterTags.filter(t => t.isActive)];
		const entries = Object.entries(formData).filter(([_, v]) => !!v);
		const tags = entries.map(([key]) => allTags.find((t) => t.id === key));

		if (!this.storyThemes) this.storyThemes = [];
		for (let a = 0; a < this.storyThemes.length; a++) {
			const storyTheme = this.storyThemes[a];
			if (!storyTheme.tags) storyTheme.tags = [];

			for (let i = 0; i < storyTheme.tags.length; i++) {
				const tag = storyTheme.tags[i];
				
				const entry = entries.find(e => e[0] == tag.id);
				if (entry) {
					tag.state = entry[1];
					tags.push(tag);
				} else {
					tag.state = "";
				}
			}

			const entry = entries.find(e => e[0] == storyTheme.id);
			if (entry) {
				storyTheme.state = entry[1];
				tags.push(LitmRollDialog.storyThemeToTag(storyTheme));
			} else {
				storyTheme.state = "";
			}
		}
		return tags;
	}

	getFormTags(element) {

	}

	async reset() {
		this.characterTags = [];
		this.#tagState = [];
		this.#modifier = 0;
		this.#shouldRoll = () => game.settings.get("foundryvtt-litm", "skip_roll_moderation");
		const config = await game.settings.get("foundryvtt-litm", "storytags");
		await this._resetStoryThemeTagsStates(config);
		if (this.actor.sheet.rendered) this.actor.sheet.render(true);
	}

	/**
	 * Receives the form data and performs the roll
	 * @param {Event} _event - The form submission event
	 * @param {Object} formData - The form data
	 */
	async _updateObject(_event, formData) {
		const { actorId, title, type, shouldRoll, modifier, ...rest } = formData;
		//const tags = this.getFormTags(_event.currentTarget);
		const tags = this.getFilteredArrayFromFormData(rest);

		const data = {
			actorId,
			type,
			tags,
			title,
			speaker: this.speaker,
			modifier,
		};

		this.#shouldRoll = () => shouldRoll;
		// User has authority to initiate the roll
		if (this.#shouldRoll()) {
			return await LitmRollDialog.roll(data);
		}
		// Else create a moderation request
		return this.#createModerationRequest(data);
	}

	_handleClick(event) {
		const button = event.currentTarget;
		const action = button.dataset.click;

		switch (action) {
			case "add-tag": {
				this.actor.sheet.render(true);
				break;
			}
			case "cancel":
				this.close();
				break;
		}
	}

	async _handleCheckboxChange(event) {
		const checkbox = event.currentTarget;
		const { name: id, value } = checkbox;
		const { type } = checkbox.dataset;
		let valueChanged = false;
		let storyThemesChanged = false;

		switch (type) {
			case "powerTag":
			case "themeTag":
			case "backpack":
			case "weaknessTag": {
				const tag = this.characterTags.find((t) => t.id === id);
				if (tag) {
					valueChanged = true;
					tag.state = value;
				} 
				else {
					if (this.storyThemes?.length) {
						for (const storyTheme of this.storyThemes) {
							if (storyTheme.id == id) {
								storyTheme.state = value;
								valueChanged = true;
								storyThemesChanged = true;
								continue;
							}
							for (const tag of storyTheme.tags ?? []) {
								if (tag.id == id) {
									tag.state = value;
									valueChanged = true;
									storyThemesChanged = true;
									break;
								}
							}
						}
					}
				}
				break;
			}
			default: {
				const existingTag = this.#tagState.find((t) => t.id === id);
				if (existingTag) {
					valueChanged = true;
					existingTag.state = value;
				} else {
					const targetTags = this.targetTags;
					const tag = [...this.tags, ...this.statuses, ...this.gmTags, ...targetTags].find(
						(t) => t.id === id,
					);
					if (tag) {
						valueChanged = true;
						this.#tagState.push({
							...tag,
							state: value,
						});
					} else {
						if (this.storyThemes?.length) {
							for (const storyTheme of this.storyThemes) {
								if (storyTheme.id == id) {
									valueChanged = true;
									storyThemesChanged = true;
									storyTheme.state = value;
									continue;
								}
								for (const tag of storyTheme.tags ?? []) {
									if (tag.id == id) {
										valueChanged = true;
										storyThemesChanged = true;
										tag.state = value;
										break;
									}
								}
							}
						}
					}
				}
			}
		}

		let needsRender = false;
		if (value == "burned" && valueChanged) {
			[needsRender, storyThemesChanged] = await this._removeAllOtherBurnedTags(type, id, storyThemesChanged);
		}

		this.setTotalPower();
		this.#dispatchUpdate();

		if (storyThemesChanged) {
			const config = await game.settings.get("foundryvtt-litm", "storytags");
			config.storyThemes = structuredClone(this.storyThemes);
			await game.settings.set("foundryvtt-litm", "storytags", config);
		}
		if (needsRender)
			this.render(true);
	}

	async _removeAllOtherBurnedTags(type, id, storyThemesChanged) {
		let needsRender = false;

		let otherBurnedTags = this.characterTags.filter((t) => t.id !== id && t.state == "burned");
		if (otherBurnedTags.length)
		{
			for (const tag of otherBurnedTags) {
				needsRender = true;
				tag.state = "positive";
			}
		}

		otherBurnedTags = this.#tagState.filter((t) => t.id !== id && t.state == "burned");
		if (otherBurnedTags.length) {
			for (const tag of otherBurnedTags) {
				needsRender = true;
				tag.state = "positive";
			}
		}

		const targetTags = this.targetTags;
		otherBurnedTags = [...this.tags, ...this.statuses, ...this.gmTags, ...targetTags].filter(
			(t) => t.id !== id && t.state == "burned",
		);
		if (otherBurnedTags.length) {
			for (const tag of otherBurnedTags) {
				needsRender = true;
				this.#tagState.push({
					...tag,
					state: "positive",
				});
			}
		}

		if (this.storyThemes?.length) {
			for (const storyTheme of this.storyThemes) {
				if (storyTheme.id != id && storyTheme.state == "burned") {
					needsRender = true;
					storyThemesChanged = true;
					storyTheme.state = "positive";
					continue;
				}
				for (const tag of storyTheme.tags ?? []) {
					if (tag.id != id && tag.state == "burned") {
						needsRender = true;
						storyThemesChanged = true;
						tag.state = "positive";
						break;
					}
				}
			}
		}
		
		return [needsRender, storyThemesChanged];
	}

	_handleModifierChange(event) {
		const input = event.currentTarget;
		this.#modifier = Number(input.value) || 0;

		this.setTotalPower();
		this.#dispatchUpdate();
	}

	async #createModerationRequest(data) {
		const id = foundry.utils.randomID();
		const userId = game.user.id;
		const tags = LitmRollDialog.#filterTags(data.tags);
		const { totalPower } = game.litm.methods.calculatePower({
			...tags,
			modifier: data.modifier,
		});
		const recipients = Object.entries(this.actor.ownership)
			.filter((u) => u[1] === 3 && u[0] !== "default")
			.map((u) => u[0]);

		ChatMessage.create({
			content: await foundry.applications.handlebars.renderTemplate(
				"systems/foundryvtt-litm/templates/chat/moderation.html",
				{
					title: utils.localize("Litm.ui.roll-moderation"),
					id: this.actor.id,
					rollId: id,
					type: data.type,
					name: this.actor.name,
					tooltipData: {
						...tags,
						modifier: data.modifier,
					},
					totalPower,
				},
			),
			whisper: recipients,
			flags: { litm: { id, userId, data } },
		});
	}

	#dispatchUpdate() {
		Sockets.dispatch("updateRollDialog", {
			actorId: this.actorId,
			characterTags: this.characterTags,
			tagState: this.#tagState,
			modifier: this.#modifier,
		});
	}

	async receiveUpdate({ characterTags, tagState, actorId, modifier }) {
		if (actorId !== this.actorId) return;

		if (characterTags) this.characterTags = characterTags;
		if (tagState) this.#tagState = tagState;
		if (modifier !== undefined) this.#modifier = modifier;

		if (this.actor.sheet.rendered) this.actor.sheet.render();
		if (this.rendered) this.render();
	}

	setTotalPower() {
		if (this.element == null) return;
		const root = this.element instanceof HTMLElement ? this.element : this.element[0];
		root.querySelectorAll("[data-update='totalPower']").forEach(el => {
			el.textContent = this.totalPower;
		});
	}

	static classifyTag(tag) {
		let tagName = tag.name.trim();
		tagName = tagName.replace('[', '');
		tagName = tagName.replace(']', '');
		tag.type = "storyThemeTag";
		if (tagName.startsWith('--')) {
			tagName = tagName.replace('--', '');
			tag.type = "weaknessTag";
		}

		const match = tagName.match(/-(\d+)/);
		if (match) {
			tagName = match ? tagName.replace(/-\d+/, "") : tagName,
			tag.value = match ? Number(match[1]) : null;
		};

		tag.name = tagName;
		tag.states = ",negative" + (tag.type != "weaknessTag" ? ( ",positive" + (tag.isSingleUse ? "" : ",burned") ) : "");
		return tag;
	}

	static storyThemeToTag(storyTheme) {
		return {
			name: storyTheme.name,
			id: storyTheme.id,
			isBurnt: storyTheme.isBurnt,
			value: storyTheme.value,
			state: storyTheme.state,
			type: storyTheme.type
		};
	}

	async _resetStoryThemeTagsStates(config) {
		if (!game.user.isGM) return;
		for (const storyTheme of this.storyThemes ?? []) {
			storyTheme.title = null;
			storyTheme.state = null;
			for (const tag of storyTheme.tags) {
				tag.state = null;
			}
		}
		config.storyThemes = structuredClone(this.storyThemes);
		await game.settings.set("foundryvtt-litm", "storytags", config);
	}
}

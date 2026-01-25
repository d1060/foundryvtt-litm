import Fellowship from "../apps/fellowship.js";
import { showImageDialog } from "../utils.js";

export class Sockets {
	static dispatch(event, data) {
		if (!game.ready)
			return console.error(
				`Tried to dispatch ${event} socket event before the game was ready.`,
			);

		const senderIsGM = game.user.isGM;
		const senderId = game.user.id;
		const id = foundry.utils.randomID();
		game.socket.emit("system.litm", {
			id,
			data,
			event,
			senderIsGM,
			senderId,
		});
	}

	static on(event, cb) {
		game.socket.on("system.litm", (data) => {
			const { event: e, senderId, ...d } = data;
			if (e !== event || senderId === game.userId) return;
			cb(d);
		});
	}

	static registerListeners() {
		this.#registerRollUpdateListener();
		this.#registerRollModerationListeners();
		this.#registerStoryTagsListeners();
		this.#registerFellowshipListeners();
		this.#registerCharacterListeners();

		Hooks.once("ready", () => {
			if (game.user.isGM) this.#registerGMRollListeners();
		});
	}

	static #registerRollUpdateListener() {
		Sockets.on("updateRollDialog", (event) => {
			const { data } = event;
			const actor = game.actors.get(data.actorId);
			if (!actor) return console.warn(`Actor ${data.actorId} not found`);
			actor.sheet.updateRollDialog(data);
		});
	}

	static #registerStoryTagsListeners() {
		Sockets.on("updateStoryTags", (event) => {
			game.litm.storyTags?.render(true);
		});

		Sockets.on("burnStoryTag", (event) => {
			const { data } = event;
			game.litm.storyTags?.burnTag(data.tag);
		});
	}

	static #registerRollModerationListeners() {
		Sockets.on("rollDice", ({ data: { userId, data } }) => {
			if (userId !== game.userId) return;
			game.litm.LitmRollDialog.roll(data);
		});

		Sockets.on("rejectRoll", ({ data: { actorId, name } }) => {
			ui.notifications.warn(
				game.i18n.format("Litm.ui.roll-rejected", { name }),
			);
			const actor = game.actors.get(actorId);
			if (!actor) return console.warn(`Actor ${actorId} not found`);
			actor.sheet.renderRollDialog();
		});

		Sockets.on("resetRollDialog", ({ data: { actorId } }) => {
			const actor = game.actors.get(actorId);
			if (!actor) return console.warn(`Actor ${actorId} not found`);
			actor.sheet.resetRollDialog();
		});
	}

	static #registerGMRollListeners() {
		Sockets.on("skipModeration", ({ data: { name } }) => {
			ui.notifications.info(
				game.i18n.format("Litm.ui.player-skipped-moderation", { name }),
			);
		});
	}

	static #registerFellowshipListeners() {
		Sockets.on("renderFellowship", () => {
			//console.log(`Received renderFellowship.`);
			Fellowship.renderFellowship();
		});

		Sockets.on("updateFellowship", (data) => {
			if (!game.user.isGM) return;

			const attrib = data.attrib;
			const value = data.value;

			const fellowship = game.settings.get("foundryvtt-litm", "fellowship");
			foundry.utils.setProperty(fellowship, attrib, value);
			game.settings.set("foundryvtt-litm", "fellowship", fellowship).then(r => {
				Fellowship.renderFellowship();
				game.socket.emit("system.litm", { app: "character-sheet", type: "renderFellowship", event: "renderFellowship", senderId: game.user.id, isGM: game.user.isGM, user: game.user});
			});
		});
	}

	static #registerCharacterListeners() {
		Sockets.on("showImage", (data) => {
			showImageDialog(data.src, data.name, false, data.origin, data.width, data.height);
		});
	}
}

export function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function localize(...key) {
	if (key.length === 1) return game.i18n.localize(key[0]);
	return key.map((k) => game.i18n.localize(k)).join(" ");
}

export function sortByName(a, b) {
	return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

export function sortTags(tags) {
	return tags.sort(sortByName);
}

export function stringHash(str) {
	let hash = 0x811c9dc5; // FNV offset basis
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193); // FNV prime
	}
	return hash >>> 0; // unsigned 32-bit
}

export function titleCase(str) {
	return (
		str.charAt(0).toUpperCase() +
		str
			.toLowerCase()
			.replace(/\b\w+/g, (l) => {
				if (["and", "the", "of", "or", "a", "an"].includes(l)) return l;
				return l.charAt(0).toUpperCase() + l.substr(1);
			})
			.slice(1)
	);
}

export function dispatch(data) {
	const isGM = game.user.isGM;
	const user = game.user.id;
	return game.socket.emit("system.foundryvtt-litm", { ...data, isGM, user });
}

export async function newTagDialog(actors) {
	const t = localize;
	return Dialog.wait(
		{
			title: t("Litm.ui.add-tag"),
			content: await foundry.applications.handlebars.renderTemplate(
				"systems/foundryvtt-litm/templates/partials/new-tag.html",
				{ actors },
			),
			acceptLabel: t("Litm.ui.create"),
			buttons: {
				cancel: {
					label: t("Litm.ui.cancel"),
				},
				create: {
					label: t("Litm.ui.create"),
					callback: (html) => {
						const form = html.find("form")[0];
						const formData = new foundry.applications.ux.FormDataExtended(form);
						const expanded = foundry.utils.expandObject(formData.object);
						return expanded;
					},
				},
			},
			default: "create",
		},
		{
			classes: ["litm", "litm--new-tag"],
		},
	);
}

export async function confirmDelete(string = "Item") {
	const thing = game.i18n.localize(string);
	const returnOption = await foundry.applications.api.DialogV2.wait({
		classes: ["app", "window-app", "litm", "litm--confirm-delete", "themed", "theme-light"],
		window: {
			resizable: false,
			title: `${game.i18n.format("Litm.ui.confirm-delete-title", { thing })}`,
		},
		content: game.i18n.format("Litm.ui.confirm-delete-content", { thing }),
		buttons: [
			{
				action: 'Yes',
				class: "dialog-button yes",
				icon: '<i class="fa fa-check"></i>',
				label: `${game.i18n.localize("Litm.ui.yes")}`
			},
			{
				action: 'No',
				class: "dialog-button no default bright",
				icon: '<i class="fa fa-xmark"></i>',
				label: `${game.i18n.localize("Litm.ui.no")}`,
			},
		],
		default: "Yes",
	});

	return returnOption == 'Yes';
}

export async function gmModeratedRoll(app, cb) {
	const id = foundry.utils.randomID();
	game.litm.rolls[id] = cb;

	dispatch({ app, id, type: "roll" });
}

export async function showAdvancementHint(type) {
	let title = game.i18n.localize("Litm.themes.advancement-" + type + "-title");
	let content = game.i18n.localize("Litm.themes.advancement-" + type + "-content");

	await foundry.applications.api.DialogV2.wait({
		classes: ["app", "window-app", "litm", "litm--confirm-delete", "themed", "theme-light"],
		window: {
			resizable: false,
			title,
		},
		position: {
			width: 400,
  		},
		content,
		buttons: [
			{
				action: 'Yes',
				class: "dialog-button ok",
				icon: '<i class="fa fa-check"></i>',
				label: `${game.i18n.localize("Litm.ui.ok")}`
			}
		],
		default: "Yes",
	});	
}

export function stringDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1)
  );

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

export async function showImageDialog(image, name, propagate, origin, width, height) {
	const imageAspect = width / height;
	const canvasWidth = canvas.app.renderer.view.width;
	const canvasHeight = canvas.app.renderer.view.height;
	const fixedHeight = 70;

	let displayWidth = width;
	if (width > canvasWidth * 0.9) displayWidth = canvasWidth * 0.9;
	let displayHeight = height;
	if (height > (canvasHeight * 0.9) - fixedHeight) displayHeight = (canvasHeight * 0.9) - fixedHeight;

	let newAspect = displayWidth / displayHeight;

	if (newAspect > imageAspect)
		displayWidth = displayHeight * imageAspect;

	let buttons = [{
			id: "close",
			class: "show-image-dialog-button",
			label: game.i18n.localize("Litm.ui.close"),
			default: true,
			action: "close"
		}];
	if (propagate)
		buttons.push({
			id: "share",
			class: "show-image-dialog-button",
			label: game.i18n.localize("Litm.ui.show-to-players"),
			default: false,
			disabled: !propagate,
			action: "share"
		});

	const left = (canvasWidth - displayWidth) / 2;
	const top = (canvasHeight - displayHeight) / 2;

	var response = await foundry.applications.api.DialogV2.wait({
		window: {
			resizable: true,
			title: game.i18n.localize("Litm.ui.show-portrait.of") + name + (propagate ? "" : game.i18n.localize("Litm.ui.show-portrait.sent-by") + origin.name),
		},
		position: {
			width: displayWidth,
			height: "auto",
			left,
			top,
		},
		content: `<img class="portrait" src="${image}" name="portrait.img" data-tooltip="${name}" style="max-height: 100%" />`,
		buttons: buttons, 
		render: (dialog, html) => {
			//html.classList.add("litm");
			//html.classList.add("litm-portrait");
		},
		submit: result => {
		},
	});

	if (response === 'share') {
		game.socket.emit(
			"system.foundryvtt-litm",
			{
				event: "showImage",
				src: image,
				width: width,
				height: height,
				name: name,
				origin: game.user,
			}
		);
	}
}

export async function actorChoiceDialog(options) {
	if (!options.template) return;
	if (!options.title) return;
	if (!options.label) options.label = options.title;

	const playerActors = game.actors.filter(
		actor => actor.type === "character" && actor.id != options.exclude
	);

	if (options.addSomeoneElse) {
		playerActors.push({
			_id: 'someoneElse',
			name: "Someone Else",
			img: 'icons/environment/people/traveler.png'
		});
	}

	if (!playerActors.length) return null;
	
	const content = await foundry.applications.handlebars.renderTemplate(
		options.template,
		{
			playerActors,
			data: {
				item: options.item
			},
			label: options.label,
		}
	);

	const targetActor = await foundry.applications.api.DialogV2.wait({
			classes: ["app", "window-app", "litm", "litm--item-transfer", 'themed', 'theme-light'],
			window: {
				resizable: false,
				title: game.i18n.localize(options.title),
			},
			content,
			buttons: [
				{
					action: 'select',
					icon: "fa fa-square-check",
					label: `${game.i18n.localize("Litm.ui.select")}`,
					callback: event => {
						const checkedRadio = event.currentTarget.querySelector("input[type='radio']:checked");
						return checkedRadio?.getAttribute("id") ?? false;
					},
				},
				{
					action: 'cancel',
					icon: "fa fa-square-xmark",
					label: `${game.i18n.localize("Litm.ui.cancel")}`,
					callback: () => false,
				},
			],
			default: "select",
			close: () => logger.info("Closed Actor Choice Dialog"),
	});

	if (targetActor && targetActor != 'someoneElse')
		return game.actors.get(targetActor);

	return null;
}


export function storeScrollPositions(app) {
	app._scrollPositions = {};
	for (const el of app.element.querySelectorAll("[data-scroll]")) {
		app._scrollPositions[el.dataset.scroll] = el.scrollTop;
	}
}

export function restoreScrollPositions(app) {
	if (!app._scrollPositions) return;

	for (const el of app.element.querySelectorAll("[data-scroll]")) {
		const pos = app._scrollPositions[el.dataset.scroll];
		if (pos !== undefined)
		{
			el.scrollTop = pos;
			//delete app._scrollPositions[el.dataset.scroll];
		}
	}
}

export function ensureLength(arr, length, fillValue = null) {
	if (arr.length > length) {
		arr.length = length;
	} else if (arr.length < length) {
		arr.push(...Array(length - arr.length).fill(fillValue));
	}
	return arr;
}

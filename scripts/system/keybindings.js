export class KeyBindings {
	static register() {
		game.keybindings.register("foundryvtt-litm", "openDiceRoller", {
			name: utils.localize("Litm.ui.dice-roller"),
			hint: utils.localize("Litm.ui.dice-roller-hint"),
			editable: [
				{
					key: "KeyR",
				},
			],
			onDown: () => {
				const sheet = game.user.character?.sheet;
				if (!sheet)
					return ui.notifications.warn("Litm.ui.warn-no-character", {
						localize: true,
					});
				return sheet.renderRollDialog({ toggle: true });
			},
			onUp: () => {},
			restricted: false,
			precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
		});
	}
}

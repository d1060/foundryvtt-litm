export class ThreatData extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		const fields = foundry.data.fields;
		return {
			consequences: new fields.ArrayField(
				new fields.StringField({ required: true, nullable: false }),
				{
					initial: () => [utils.localize("Litm.ui.name-consequence")],
				},
			),
			category: new fields.StringField(),
		};
	}
}

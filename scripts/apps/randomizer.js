export default class Randomizer {
    static syllabes = [
        [
            "A", "E", "I", "U",
            "An", "En", "In", "Un",
            "Ak", "Ek", "Ik", "Uk",
            "Ar", "Er", "Ir", "Or", "Ur",
            "As", "Es",
            "Al", "El", "Il", "Ol", "Ul",
            "Ca", "Ce", "Ci", "Co",
            "Da", "De", "Di", "Do", "Du",
            "La", "Le", "Li", "Lo", "Lu",
            "Na", "Ne", "Ni", "No", "Nu",
            "Tha", "The", "Thu",
            "Thar", "Ther", "Thir", "Thor", "Thur",
            "Gal", "Gol",
            "Dor",
        ],
        [
            "", "", "", "",
            "a", "ae", "ael", "iel",
            "ar", "er", "ir", "or", "ur",
            "ag", "eg", "ig", "og", "ug",
            "an", "en", "in", "on", "un",
            "e", "o",
            "ba", "be", "bi", "bo", "bu",
            "ca", "ce", "ci", "co", "cu",
            "da", "de", "di", "do", "du",
            "ga", "ge", "gi", "go", "gu",
            "la", "le", "li", "ly", "lo", "lu",
            "da",
            "mar", "mer", "mir", "mor", "mur",
            "n", "na", "ne", "ni", "no", "nu",
            "ran", "ren", "rin", "ron", "run",
            "va", "ve", "vi", "vo", "vu",
        ],
        {
            male: [
                "",
                "e", "i", "o", "u",
                "ad", "ed", "id", "yd", "od", "ud",
                "en", "on", "un",
                "ar", "er", "ir", "or", "ur",
                "as", "is", "ys", "os", "us",
                "ck",
                "dan", "den", "don", "dun",
                "dal", "dil", "dul",
                "k",
                "lan", "lann", "lon", "lun",
                "las", "les", "lys", "los", "lus",
                "lur",
                "lien", "lion", "liun", "lorn",
                "nar", "ne", "no", "nor", "nu",
                "nd",
                "orn",
                "rak", "ran", "ren", "ron", "run",
                "ral", "rel", "ril", "rol", "rul",
                "rien", "rin", "rion", "riun",
                "wen",
                "zal", "zan", "zen", "zon",
                "zar", "zer", "zir", "zor", "zur",
            ],
            female: [
                "e", "a", "an", "in", "yn", "del", "la", "len", "lenn", "lin", "lyn", "lynn", "lar", "lian", "rian", "na", "ni", "wan", "zel", "zin", "zyn", "rel", "wyn",
            ]
        }
    ];

    static replacements = [
        ["nr", "n", "r"],
        ["rn", "n", "r"],
        ["nb", "n"],
        ["kn", "k", "n"],
        ["rd", "r", "d"],
        ["kv", "v"],
        ["kb", "k", "b"],
        ["dade", "da", "de"],
        ["deda", "da", "de"],
        ["lnl", "ln", "nl"],
        ["sbo", "so"],
        ["nn", "n"],
    ];

    static newName(gender) {
        let name = '';
        for (let syllabeCollection of this.syllabes)
        {
            if (Array.isArray(syllabeCollection)) {
                const syllabe = syllabeCollection[Math.floor(Math.random() * syllabeCollection.length)];
                name += syllabe;
            } else if (gender in syllabeCollection) {
                const syllabe = syllabeCollection[gender][Math.floor(Math.random() * syllabeCollection[[gender]].length)];
                name += syllabe;
            }
        }

        for (let replacementArray of this.replacements) {
            if (name.includes(replacementArray[0]))
            {
                const replace = replacementArray[Math.floor(Math.random(replacementArray.length - 1)) + 1];
                name = name.replace(replacementArray[0], replace);
            }
        }
        return name;
    }

    static randomizeImage(gender) {
        const defaultPortraits = {
            male: [
                'apple-picker-b.webp',
                'red-marshal-a.webp',
                'red-marshal-c.webp',
                'wise-one-c.webp',
                'wise-one-d.webp',
                'gerrin.webp',
                'swordsman.webp',
                'suspicious-farmer.webp',
                'crestfallen-rider.png',
            ],
            female: [
                'apple-picker-a.webp',
                'apple-picker-c.webp',
                'red-marshal-b.webp',
                'red-marshal-d.webp',
                'sorrowbalm-mask.webp',
                'willow-mask.webp',
                'wise-one-a.webp',
                'wise-one-b.webp',
                'hardy-lady.webp',
                'pastoral-priest-or-priestess-mask.webp',
            ]
        };

        let allowedPortraits = [];
        if (gender == null)
            allowedPortraits = [...defaultPortraits.male, ...defaultPortraits.female];
        else
            allowedPortraits = defaultPortraits[gender];

        const chosenPortrait = allowedPortraits[Math.floor(Math.random() * allowedPortraits.length)];
        return 'systems/foundryvtt-litm/assets/media/portraits/' + chosenPortrait;
    }

	static newCharacterData() {
        const gender = Math.random() >= 0.5 ? 'male' : 'female';
		const charData = {
			name: Randomizer.newName(gender),
            img: Randomizer.randomizeImage(gender),
			type: "character"
		};
        return charData;
	}

    static async newCharacter(ownerId) {
        const created = await Actor.create(Randomizer.newCharacterData());
        if (!created) return;

        const ownership = created.ownership;
        ownership[ownerId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        await created.update({ownership});

        if (ownerId == game.user.id) {
            created.sheet.render(true);
        } else {
            game.socket.emit("system.foundryvtt-litm", {
                app: "character-sheet",
                event: "renderCharacterCheet",
                senderId: game.user.id,
                receiverId: ownerId,
                actorId: created.id,
            });
        }
    }
}
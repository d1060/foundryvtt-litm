
export default class Randomizer {
    static name_chains;

    static generateNameFromChain(chain, options = {}) {
        const {
            minLen = 4,
            maxLen = 10,
            capitalize = true,
            maxAttempts = 50,
        } = options;

        const {
            order,
            startToken,
            endToken,
            tables
        } = chain;

        function sampleNext(context) {
            const t = tables[context];
            if (!t) return null;

            const r = Math.floor(Math.random() * t.total) + 1;
            let lo = 0, hi = t.cumWeights.length - 1;

            while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (r <= t.cumWeights[mid]) hi = mid;
            else lo = mid + 1;
            }
            return t.chars[lo];
        }

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            let context = startToken.repeat(order);
            let out = "";

            for (let i = 0; i < maxLen + 5; i++) {
            const next = sampleNext(context);
            if (!next || next === endToken) break;

            out += next;
            context = context.slice(1) + next;

            if (out.length >= maxLen) break;
            }

            if (out.length < minLen || out.length > maxLen) continue;

            if (capitalize) {
            out = out.charAt(0).toUpperCase() + out.slice(1);
            }

            return out;
        }

        return null;
    }

    static generateCulturalName(cultures, gender, options = {}) {
        const culture = cultures[Math.floor(Math.random() * cultures.length)];

        const cultureData = this.name_chains.cultures[culture];
        if (!cultureData) {
            throw new Error(`Unknown culture: ${culture}`);
        }

        const chain = cultureData[gender];
        if (!chain) {
            throw new Error(`Unknown gender '${gender}' for culture '${culture}'`);
        }

        const name = this.generateNameFromChain(chain, options);
        //logger.info(`Generated ${culture} ${gender} name: ${name}`);
        return name;
    }

    static async loadNameChains() {
        const url = "systems/foundryvtt-litm/assets/data/name-chains.json.gz";

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);

        const gzBytes = new Uint8Array(await res.arrayBuffer());

        // pako is global when loaded via system.json scripts
        const jsonText = pako.ungzip(gzBytes, { to: "string" });

        this.name_chains = JSON.parse(jsonText);
    }

    static newName(gender) {
        let culture_name = this.generateCulturalName(["west slavic", "south slavic", "north germanic", "west germanic", "central germanic", "baltic", "east slavic"], gender);

        if (gender === "male" && culture_name.endsWith("a")) {
            culture_name = culture_name.slice(0, -1);
        }

        return culture_name;
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
            gender,
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
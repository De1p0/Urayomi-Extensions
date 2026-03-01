// SOURCE CODE ADAPTED FROM https://github.com/kodjodevf/mangayomi-extensions 


export class DefaultExtension {
    constructor(source = {
        name: "MangaDex",
        langs: ["ar", "bn", "bg", "my", "ca", "zh", "zh-hk", "cs", "da", "nl", "en", "tl", "fi", "fr", "de", "el", "he", "hi", "hu", "id", "it", "ja", "kk", "ko", "la", "lt", "ms", "mn", "ne", "no", "fa", "pl", "pt-br", "pt", "ro", "ru", "sh", "es-419", "es", "sv", "ta", "th", "tr", "uk", "vi"],
        baseUrl: "https://mangadex.org",
        apiUrl: "https://api.mangadex.org",
        iconUrl: "https://raw.githubusercontent.com/De1p0/Urayomi-Extensions/covers/mangadex.png",
        typeSource: "single",
        itemType: 0,
        version: "0.1.4",
        pkgPath: "sources/mangadex.js"
    }) {
        this.source = source;
    }


    async fetchUrl(url) {
        const res = await fetch(url);
        return await res.json();
    }

    async getPopular(page = 1) {
        const offset = 20 * (page - 1);
        const url = `${this.source.apiUrl}/manga?limit=20&offset=${offset}&availableTranslatedLanguage[]=${this.source.langs[0]}&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive`;
        const data = await this.fetchUrl(url);
        return this.mangaRes(data);
    }

    async getLatestUpdates(page = 1) {
        const offset = 20 * (page - 1);
        const url = `${this.source.apiUrl}/chapter?limit=20&offset=${offset}&translatedLanguage[]=${this.source.langs[0]}&order[publishAt]=desc`;
        const chapters = await this.fetchUrl(url);

        const mangaIds = Array.from(
            new Set(chapters.data.flatMap(item => item.relationships.filter(r => r.type === "manga").map(r => r.id)))
        );

        const mangaUrl = `${this.source.apiUrl}/manga?includes[]=cover_art&limit=${mangaIds.length}&ids[]=${mangaIds.join("&ids[]=")}&contentRating[]=safe&contentRating[]=suggestive`;
        const mangaData = await this.fetchUrl(mangaUrl);

        return this.mangaRes(mangaData);
    }

    async search(query, page = 1) {
        const offset = 20 * (page - 1);
        const url = `${this.source.apiUrl}/manga?includes[]=cover_art&offset=${offset}&limit=20&title=${encodeURIComponent(query)}`;
        const data = await this.fetchUrl(url);
        return this.mangaRes(data);
    }

    async getDetail(mangaId) {
        const url = `${this.source.apiUrl}/manga/${mangaId}?includes[]=cover_art&includes[]=author&includes[]=artist`;
        const data = await this.fetchUrl(url);
        const mangaData = data.data;

        const manga = {
            name: mangaData.attributes.title.en || Object.values(mangaData.attributes.title)[0] || "",
            description: mangaData.attributes.description.en || "",
            author: mangaData.relationships.filter(r => r.type === "author").map(a => a.attributes.name).join(", "),
            genre: mangaData.attributes.tags.map(t => t.attributes.name.en),
            status: { "ongoing": 0, "completed": 1, "hiatus": 2, "cancelled": 3 }[mangaData.attributes.status],
            imageUrl: mangaData.relationships.find(r => r.type === "cover_art") ?
                `https://uploads.mangadex.org/covers/${mangaId}/${mangaData.relationships.find(r => r.type === "cover_art").attributes.fileName}` : ""
        };

        return manga;
    }

    mangaRes(data) {
        return {
            list: data.data.map(e => ({
                name: e.attributes.title.en || Object.values(e.attributes.title)[0] || "",
                imageUrl: e.relationships.find(r => r.type === "cover_art") ?
                    `https://uploads.mangadex.org/covers/${e.id}/${e.relationships.find(r => r.type === "cover_art").attributes.fileName}` : "",
                link: `/manga/${e.id}`
            })),
            hasNextPage: true
        };
    }
}
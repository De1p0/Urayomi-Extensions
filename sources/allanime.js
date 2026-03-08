// SOURCE CODE ADAPTED FROM https://github.com/kodjodevf/mangayomi-extensions

const _storage = {};

function sendMessage(action, payload) {
    const args = JSON.parse(payload);

    switch (action) {
        case "get":
            return _storage[args[0]] ?? null;

        case "getString":
            return _storage[args[0]] ?? args[1] ?? "";

        case "setString":
            _storage[args[0]] = args[1];
            return true;

        default:
            console.warn(`sendMessage: Unknown action "${action}"`);
            return null;
    }
}

class SharedPreferences {
    get(key) {
        return sendMessage("get", JSON.stringify([key]));
    }

    getString(key, defaultValue) {
        return sendMessage("getString", JSON.stringify([key, defaultValue]));
    }

    setString(key, value) {
        return sendMessage("setString", JSON.stringify([key, value]));
    }
}

export class DefaultExtension {

    constructor(corFetch, source = {
        name: "AllManga",
        langs: ["en"],
        baseUrl: "https://allmanga.to",
        apiUrl: "https://api.allanime.day/api",
        typeSource: "single",
        itemType: 0,
        version: "0.1.1",
    }) {
        this.source = source;
        this.corFetch = corFetch;
    }

    async fetchUrl(url, options = {}) {

        const res = await this.corFetch(url, options);

        if (!res.ok) {
            throw new Error(`HTTP error ${res.status}`);
        }

        return { body: await res.text() };
    }

    getHeaders() {
        return {
            "Accept": "*/*",
            "referer": "https://allmanga.to/",
            "user-agent": this.preferenceUserAgent(),
        };
    }

    getPostHeaders() {
        return {
            ...this.getHeaders(),
            "content-type": "application/json",
        };
    }

    async post(body) {

        return this.fetchUrl(this.source.apiUrl, {
            method: "POST",
            headers: this.getPostHeaders(),
            body: JSON.stringify(body)
        });

    }

    async getPopular(page) {

        const res = await this.post(
            Queries.buildPopularMangaQuery(page)
        );

        const data = JSON.parse(res.body)?.data?.queryPopular?.recommendations ?? [];

        return data.map(item => ({
            name: MangaUtils.getMangaName(item.anyCard),
            imageUrl: URLS.buildMangaCoverUrl(item.anyCard.thumbnail),
            link: URLS.buildMangaURL(item.anyCard._id),
        }));
    }

    async getLatestUpdates(page) {

        const res = await this.post(
            Queries.buildSearchQuery({ page })
        );

        const items = JSON.parse(res.body)?.data?.mangas?.edges ?? [];

        return items.map(item => ({
            name: MangaUtils.getMangaName(item),
            imageUrl: URLS.buildMangaCoverUrl(item.thumbnail),
            link: URLS.buildMangaURL(item._id),
        }));
    }

    async search(query, page) {
        const res = await this.post(
            Queries.buildSearchQuery({ page, query })
        );

        const edges = JSON.parse(res.body)?.data?.mangas?.edges ?? [];

        const list = edges.map(item => ({
            name: MangaUtils.getMangaName(item),
            imageUrl: URLS.buildMangaCoverUrl(item.thumbnail),
            link: `/manga/${item._id}`,
        }));

        const hasNextPage = list.length === 20;

        return { hasNextPage, list };
    }

    async getDetail(url) {

        const mangaId = url.split("/").pop();

        const resDetail = await this.post(
            Queries.buildDetailsQuery(mangaId)
        );

        const detailsData = JSON.parse(resDetail.body)?.data?.manga;

        const resChapters = await this.post(
            Queries.buildChaptersQuery(mangaId)
        );

        const chaptersData = JSON.parse(resChapters.body)?.data?.episodeInfos ?? [];

        const chapters = chaptersData
            .sort((a, b) => b.episodeIdNum - a.episodeIdNum)
            .map(cur => {

                const episodeNumber = cur.episodeIdNum ?? "Unknown";

                return {
                    name: `Chapter ${episodeNumber}`,
                    dateUpload: cur.uploadDates?.sub
                        ? new Date(cur.uploadDates.sub).valueOf()
                        : null,
                    description: cur.notes,
                    url: URLS.buildMangaURL(`${mangaId}/chapter-${episodeNumber}-sub`)
                };

            });

        return {
            name: MangaUtils.getMangaName(detailsData),
            author: MangaUtils.getAuthor(detailsData),
            artist: MangaUtils.getAuthor(detailsData),
            genre: MangaUtils.combineGenres(detailsData.genres ?? [], detailsData.tags ?? []),
            status: MangaUtils.getStatus(detailsData.status),
            imageUrl: URLS.buildMangaCoverUrl(detailsData.thumbnail ?? ""),
            link: URLS.buildMangaURL(mangaId),
            description: MangaUtils.buildDescription(detailsData.description ?? "", detailsData.altNames ?? []),
            chapters
        };
    }

    async getPageList(url) {

        const parts = url.split("/");

        const mangaId = parts[parts.length - 2];
        const chapterNum = parts[parts.length - 1].split("-")[1];
        const chapterType = parts[parts.length - 1].split("-").pop();

        const res = await this.post(
            Queries.buildPageQuery({
                id: mangaId,
                chapterNum,
                translationType: chapterType
            })
        );

        const pagesData = JSON.parse(res.body)?.data?.chapterPages?.edges?.[0];

        const pictureUrlHead = pagesData.pictureUrlHead;

        return pagesData.pictureUrls.map(page => ({
            url: URLS.addHttp(
                URLS.buildMangaPageUrl(
                    pictureUrlHead,
                    page.url,
                    this.preferenceImageQuality()
                )
            ),
            headers: this.getHeaders()
        }));
    }

    preferenceUserAgent() {

        const userAgent = new SharedPreferences()
            .getString("USERAGENT", "")
            .trim();

        return userAgent ||
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
    }

    preferenceImageQuality() {
        return new SharedPreferences().getString("IMAGEQUALITY", "original");
    }
}

const URLS = {

    buildMangaCoverUrl: url =>
        url.startsWith("http")
            ? url
            : `https://wp.youtube-anime.com/aln.youtube-anime.com/${url}`,

    buildMangaURL: id =>
        `https://allmanga.to/manga/${id}`,

    buildMangaPageUrl: (head, path, quality) => {

        if (quality === "800")
            return `https://ytimgf.youtube-anime.com/${path}?w=800`;

        if (quality === "480")
            return `https://wp.youtube-anime.com/${head}/${path}?w=480`;

        return `https://ytimgf.youtube-anime.com/${path}`;
    },

    addHttp: url =>
        url.startsWith("http") ? url : `https://${url}`,
};

const MangaUtils = {

    getMangaName: data =>
        data.englishName ||
        data.name ||
        data.nativeName ||
        "No Title",

    getAuthor: data =>
        Array.isArray(data.authors)
            ? data.authors[0]
            : "None",

    getStatus: status => {

        if (!status) return 4;

        const s = status.toLowerCase();

        if (s.includes("complete") || s.includes("finished")) return 1;

        if (s.includes("ongoing") || s.includes("releasing") || s.includes("publishing")) return 0;

        return 4;
    },

    buildDescription: (desc, altNames) =>
        desc +
        (altNames?.length
            ? `\n\nAlternative Names:\n${altNames.join("\n")}`
            : ""),

    combineGenres: (genres, tags) =>
        [...new Set([...(genres ?? []), ...(tags ?? [])])],
}; t

const Queries = {

    popularMangaQuery: `
query ($type: VaildPopularTypeEnumType! $size: Int! $page: Int $dateRange: Int $allowAdult: Boolean $allowUnknown: Boolean) {
  queryPopular(type: $type size: $size dateRange: $dateRange page: $page allowAdult: $allowAdult allowUnknown: $allowUnknown) {
    recommendations {
      anyCard {
        _id
        name
        thumbnail
        englishName
      }
    }
  }
}`,

    buildPopularMangaQuery: page => ({
        query: Queries.popularMangaQuery,
        variables: {
            type: "manga",
            size: 20,
            page,
            dateRange: 0,
            allowAdult: false,
            allowUnknown: false
        }
    }),

    buildSearchQuery: ({ page, query }) => ({
        query: `
query ($search: SearchInput $size: Int $page: Int $translationType: VaildTranslationTypeMangaEnumType $countryOrigin: VaildCountryOriginEnumType) {
  mangas(search: $search limit: $size page: $page translationType: $translationType countryOrigin: $countryOrigin) {
    edges {
      _id
      name
      thumbnail
      englishName
    }
  }
}`,
        variables: {
            page,
            size: 20,
            search: { query }
        }
    }),

    buildDetailsQuery: id => ({
        query: `
query ($id: String!) {
  manga(_id: $id) {
    _id
    name
    thumbnail
    description
    authors
    genres
    tags
    status
    altNames
    englishName
  }
}`,
        variables: { id }
    }),

    buildChaptersQuery: id => ({
        query: `
query ($id: String!, $chapterNumStart: Float!, $chapterNumEnd: Float!) {
  episodeInfos(showId: $id episodeNumStart: $chapterNumStart episodeNumEnd: $chapterNumEnd) {
    episodeIdNum
    notes
    uploadDates
  }
}`,
        variables: {
            id: `manga@${id}`,
            chapterNumStart: 0,
            chapterNumEnd: 9999
        }
    }),

    buildPageQuery: ({ id, chapterNum, translationType }) => ({
        query: `
query ($id: String! $translationType: VaildTranslationTypeMangaEnumType! $chapterNum: String!) {
  chapterPages(mangaId: $id translationType: $translationType chapterString: $chapterNum) {
    edges {
      pictureUrls
      pictureUrlHead
    }
  }
}`,
        variables: {
            id,
            chapterNum,
            translationType
        }
    })
};
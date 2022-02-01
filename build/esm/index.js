import axios from "axios";
import cheerio from "cheerio";
const debugPrefix = "apple music: ";
let debug = false;
export function EnableDebug() {
    debug = true;
}
function getRawPlaylist(document) {
    const $ = cheerio.load(document);
    const tracks = [];
    const songList = $("div.songs-list-row").toArray();
    songList.forEach((song) => {
        const lookArtist = $(song)
            .find("div.songs-list__col--artist")
            .find("a.songs-list-row__link");
        const track = {
            artist: {
                name: lookArtist.text(),
                url: lookArtist.attr("href") ?? "",
            },
            title: $(song)
                .find("div.songs-list__col--song")
                .find("div.songs-list-row__song-name")
                .text(),
            duration: $(song)
                .find("div.songs-list__col--time")
                .find("time")
                .text()
                .trim()
                .split(":")
                .map((value) => Number(value))
                .reduce((acc, time) => 60 * acc + time),
            url: $(song)
                .find("div.songs-list__col--album")
                .find("a.songs-list-row__link")
                .attr("href") ?? "",
            type: "song",
        };
        tracks.push(track);
    });
    const product = $("div.product-page-header");
    const creator = product.find("div.product-creator").find("a.dt-link-to");
    const playlist = {
        title: product.find("h1.product-name").text().trim(),
        description: product
            .find("div.product-page-header__metadata--notes")
            .text()
            .trim(),
        creator: {
            name: creator.text().trim(),
            url: "https://music.apple.com" + creator.attr("href") ?? "",
        },
        tracks,
        numTracks: tracks.length,
        type: "playlist",
    };
    return playlist;
}
function getRawAlbum(document) {
    const $ = cheerio.load(document);
    const tracks = [];
    const product = $("div.product-page-header");
    const creator = product.find("div.product-creator").find("a.dt-link-to");
    const artist = {
        name: creator.text().trim(),
        url: creator.attr("href") ?? "",
    };
    const albumUrl = $("meta[property='og:url']").attr("content");
    const songList = $("div.songs-list-row").toArray();
    songList.forEach((song) => {
        const track = {
            artist,
            title: $(song)
                .find("div.songs-list__col--song")
                .find("div.songs-list-row__song-name")
                .text(),
            duration: $(song)
                .find("div.songs-list__col--time")
                .find("time")
                .text()
                .trim()
                .split(":")
                .map((value) => Number(value))
                .reduce((acc, time) => 60 * acc + time),
            url: albumUrl
                ? albumUrl +
                    "?i=" +
                    JSON.parse($(song)
                        .find("div.songs-list__col--time")
                        .find("button.preview-button")
                        .attr("data-metrics-click") ?? "{ targetId: 0 }")["targetId"] ?? ""
                : "",
            type: "song",
        };
        tracks.push(track);
    });
    const playlist = {
        title: product.find("h1.product-name").text().trim(),
        description: product
            .find("div.product-page-header__metadata--notes")
            .text()
            .trim(),
        artist,
        tracks,
        numTracks: tracks.length,
        type: "album",
    };
    return playlist;
}
function linkType(url) {
    if (RegExp(/https?:\/\/music\.apple\.com\/.+?\/album\/.+?\/.+?\?i=([0-9]+)/).test(url)) {
        return "song";
    }
    else if (RegExp(/https?:\/\/music\.apple\.com\/.+?\/playlist\//).test(url)) {
        return "playlist";
    }
    else if (RegExp(/https?:\/\/music\.apple\.com\/.+?\/album\//).test(url)) {
        return "album";
    }
    else {
        throw Error("Apple Music link is invalid");
    }
}
async function search(url) {
    const urlType = linkType(url);
    const page = await axios
        .get(url)
        .then((res) => res.data)
        .catch(() => undefined);
    if (!page) {
        if (debug) {
            console.log(debugPrefix + "http request failed");
        }
        return null;
    }
    if (urlType === "playlist") {
        return getRawPlaylist(page);
    }
    const album = getRawAlbum(page);
    if (urlType === "album") {
        return album;
    }
    const match = new RegExp(/https?:\/\/music\.apple\.com\/.+?\/album\/.+?\/.+?\?i=([0-9]+)/).exec(url);
    const id = match ? match[1] : undefined;
    if (!id) {
        if (debug) {
            console.log(debugPrefix + "failed to extract song id");
        }
        return null;
    }
    const track = album.tracks.find((track) => {
        return track.url.includes(`?i=${id}`);
    });
    if (!track) {
        if (debug) {
            console.log(debugPrefix + "track not found in album");
        }
        return null;
    }
    return track;
}
export default search;

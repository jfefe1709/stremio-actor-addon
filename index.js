const { addonBuilder } = require("stremio-addon-sdk");
const express = require("express");
const axios = require("axios");

const TMDB_API_KEY = "f4273ae35c295c6dd7cd5f05e4e535d8";
const TMDB_BASE = "https://api.themoviedb.org/3";

const manifest = {
    id: "org.javier.actorfilms",
    name: "Actor & Director Filmography",
    description: "Busca películas y series de cualquier actor o director, ordenadas por puntuación.",
    version: "1.0.0",
    resources: ["catalog", "meta", "stream"],
    types: ["movie", "series"],
    idPrefixes: ["movie", "series"],
    catalogs: [
        {
            type: "movie",
            id: "actor-director-catalog",
            name: "Búsqueda de Actores/Directores"
        }
    ]
};

const builder = new addonBuilder(manifest);

// ---------- Helpers ----------
async function searchPerson(name) {
    const resp = await axios.get(`${TMDB_BASE}/search/person`, {
        params: { api_key: TMDB_API_KEY, query: name }
    });
    return resp.data.results;
}

async function getFilmography(personId) {
    const resp = await axios.get(`${TMDB_BASE}/person/${personId}/combined_credits`, {
        params: { api_key: TMDB_API_KEY }
    });
    const credits = resp.data;

    const movies = credits.cast.concat(credits.crew)
        .filter(c => c.media_type === "movie")
        .map(c => ({ id: c.id, type: "movie" }));

    const series = credits.cast.concat(credits.crew)
        .filter(c => c.media_type === "tv")
        .map(c => ({ id: c.id, type: "tv" }));

    return { movies, series };
}

async function getItemDetails(type, id) {
    const resp = await axios.get(`${TMDB_BASE}/${type}/${id}`, {
        params: { api_key: TMDB_API_KEY, append_to_response: "videos" }
    });
    const data = resp.data;

    const trailer = data.videos?.results?.find(v => v.type === "Trailer" && v.site === "YouTube");

    return {
        id: `${type}:${id}`,
        type: type === "movie" ? "movie" : "series",
        name: data.title || data.name,
        description: data.overview || "Sin descripción",
        poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : "",
        year: (data.release_date || data.first_air_date || "").split("-")[0] || "",
        genres: data.genres ? data.genres.map(g => g.name).join(", ") : "",
        score: data.vote_average || 0,
        trailer: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : ""
    };
}

// ---------- Catalog ----------
async function catalogHandler(req, res) {
    const search = req.query.search;
    if (!search) return res.json({ metas: [] });

    const persons = await searchPerson(search);
    if (!persons.length) return res.json({ metas: [] });

    const personId = persons[0].id;
    const filmography = await getFilmography(personId);

    const movieDetails = await Promise.all(filmography.movies.map(m => getItemDetails("movie", m.id)));
    const seriesDetails = await Promise.all(filmography.series.map(s => getItemDetails("tv", s.id)));

    movieDetails.sort((a, b) => b.score - a.score);
    seriesDetails.sort((a, b) => b.score - a.score);

    const metas = [];

    if (movieDetails.length) {
        metas.push({
            id: `tab:movies`,
            type: "movie",
            name: "Películas",
            poster: "",
            description: "",
            extra: { items: movieDetails }
        });
    }

    if (seriesDetails.length) {
        metas.push({
            id: `tab:series`,
            type: "series",
            name: "Series",
            poster: "",
            description: "",
            extra: { items: seriesDetails }
        });
    }

    res.json({ metas });
}

// ---------- Meta ----------
async function metaHandler(req, res) {
    const [type, itemId] = req.params.id.split(":");
    const details = await getItemDetails(type, itemId);
    res.json([details]);
}

// ---------- Stream ----------
async function streamHandler(req, res) {
    const [type, itemId] = req.params.id.split(":");
    const details = await getItemDetails(type, itemId);

    if (details.trailer) {
        res.json({
            streams: [
                {
                    title: "Trailer oficial",
                    url: details.trailer,
                    type: "trailer"
                }
            ]
        });
    } else {
        res.json({ streams: [] });
    }
}

// ---------- Servidor ----------
const app = express();
app.use("/manifest.json", (req, res) => res.json(manifest));
app.use("/catalog/:id", catalogHandler);
app.use("/meta/:id", metaHandler);
app.use("/stream/:type/:id", streamHandler);

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`Addon corriendo en puerto ${PORT}`));
